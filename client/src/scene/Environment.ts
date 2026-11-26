import * as THREE from "three";
import {
  WORLD_SIZE,
  distanceToWater,
  forestDensity,
  streamCenterX,
  streamHalfWidth,
  valueNoise,
  type Prop,
  type PropKind,
  type World,
} from "@rpg/shared";
import { applyOcclusionCutout } from "./occlusion.ts";
import { buildPropGeometry } from "./propGeometry.ts";
import type { AssetLibrary } from "./Assets.ts";

export const WATER_LEVEL = -0.18;

/** Visual ground height. Gameplay is flat 2D; this only shapes the stream channel. */
export function groundHeight(x: number, z: number): number {
  const d = distanceToWater(x, z);
  if (d < 0) return Math.max(-0.75, d * 0.35) - 0.05;
  if (d < 1.5) return -0.05 + (d / 1.5) * 0.05;
  return 0;
}

/**
 * Builds the static forest: terrain, stream, props, lights and atmosphere.
 * Everything is generated from the same seed the server uses.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private readonly water: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points;

  constructor(
    private readonly world: World,
    scene: THREE.Scene,
    assets: AssetLibrary,
  ) {
    scene.background = new THREE.Color("#1d2a24");
    scene.fog = new THREE.Fog("#1d2a24", 95, 150);

    // Early-morning light: you just woke up.
    const hemi = new THREE.HemisphereLight("#cfe3ff", "#3a4a2a", 1.1);
    scene.add(hemi);
    this.sun = new THREE.DirectionalLight("#ffe2b0", 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.group.add(this.buildTerrain());
    this.water = this.buildWater();
    this.group.add(this.water);
    this.buildProps(assets);
    this.motes = this.buildMotes();
    this.group.add(this.motes);
    scene.add(this.group);
  }

  /** Keep the shadow frustum centred on the player. */
  update(dt: number, time: number, focus: THREE.Vector3): void {
    this.sun.position.set(focus.x - 25, 45, focus.z + 15);
    this.sun.target.position.copy(focus);
    this.water.material.uniforms.uTime!.value = time;
    this.motes.position.set(focus.x, 0, focus.z);
    (this.motes.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(time * 0.7) * 0.25;
    void dt;
  }

  private buildTerrain(): THREE.Mesh {
    const seg = 220;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE + 40, WORLD_SIZE + 40, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color("#4f7a35");
    const grassB = new THREE.Color("#6c8f3d");
    const forestFloor = new THREE.Color("#3b4f2a");
    const mud = new THREE.Color("#6b5a3c");
    const bed = new THREE.Color("#4a5a55");
    const seed = this.world.seed;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundHeight(x, z));
      const n = valueNoise(seed + 3, x / 6, z / 6);
      const density = forestDensity(seed, x, z);
      c.copy(grassA).lerp(grassB, n).lerp(forestFloor, Math.min(1, density * 0.9));
      const dw = distanceToWater(x, z);
      if (dw < 0) c.copy(bed);
      else if (dw < 1.6) c.lerp(mud, 1 - dw / 1.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = "terrain";
    return mesh;
  }

  private buildWater(): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
    // A ribbon following the stream's centre line.
    const half = WORLD_SIZE / 2 + 20;
    const steps = 480;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const z = -half + (i / steps) * half * 2;
      const cx = streamCenterX(z);
      const hw = streamHalfWidth(z) + 0.35;
      positions.push(cx - hw, WATER_LEVEL, z, cx + hw, WATER_LEVEL, z);
      uvs.push(0, z * 0.25, 1, z * 0.25);
      if (i < steps) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uDeep: { value: new THREE.Color("#1f5a73") }, uShallow: { value: new THREE.Color("#5fa7b8") } },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        varying vec2 vUv;
        void main() {
          float edge = abs(vUv.x - 0.5) * 2.0;           // 0 centre .. 1 bank
          float flow = vUv.y - uTime * 0.6;
          float ripple = sin(flow * 6.0 + sin(vUv.x * 9.0 + uTime) * 1.5) * 0.5 + 0.5;
          float sparkle = smoothstep(0.92, 1.0, sin(flow * 13.0 + vUv.x * 21.0) * ripple);
          vec3 col = mix(uDeep, uShallow, edge * 0.8 + ripple * 0.15);
          col += sparkle * 0.25;
          float foam = smoothstep(0.82, 1.0, edge) * (0.6 + 0.4 * ripple);
          col = mix(col, vec3(0.85, 0.92, 0.95), foam * 0.5);
          gl_FragColor = vec4(col, mix(0.78, 0.5, edge));
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "stream";
    return mesh;
  }

  private buildProps(assets: AssetLibrary): void {
    const byKind = new Map<PropKind, Prop[]>();
    for (const p of this.world.props) {
      let list = byKind.get(p.kind);
      if (!list) byKind.set(p.kind, (list = []));
      list.push(p);
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [kind, props] of byKind) {
      const matrices = props.map((p) =>
        m
          .clone()
          .compose(
            new THREE.Vector3(p.x, groundHeight(p.x, p.z), p.z),
            q.clone().setFromAxisAngle(up, p.rotation),
            new THREE.Vector3(p.scale, p.scale, p.scale),
          ),
      );

      // Prefer a downloaded glTF model if the manifest provides one.
      const gltfMeshes = assets.instancedProp(kind, matrices);
      if (gltfMeshes) {
        for (const mesh of gltfMeshes) this.group.add(mesh);
        continue;
      }

      const geo = buildPropGeometry(kind);
      const mat = applyOcclusionCutout(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
      const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
      matrices.forEach((mat4, i) => inst.setMatrixAt(i, mat4));
      inst.castShadow = kind !== "mushroom";
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      inst.name = `props:${kind}`;
      this.group.add(inst);
    }
  }

  private buildMotes(): THREE.Points {
    // Drifting pollen / fireflies around the player for atmosphere.
    const count = 220;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = 0.5 + Math.random() * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: "#fff3b0", size: 0.12, transparent: true, opacity: 0.6, depthWrite: false });
    return new THREE.Points(geo, mat);
  }
}
