import * as THREE from "three";
import {
  POOL_RADIUS,
  POOL_V,
  RUINS_CENTER,
  RUINS_ROTATION,
  distanceToTrail,
  distanceToWater,
  forestDensity,
  fromUV,
  poolCenter,
  smoothstep,
  streamHalfWidth,
  streamU,
  terrainHeight,
  toUV,
  valleyBase,
  valleySdf,
  valueNoise,
  waterSurface,
  type Prop,
  type PropKind,
  type World,
} from "@rpg/shared";
import { applyOcclusionCutout } from "./occlusion.ts";
import { toonMaterial } from "./toon.ts";
import { buildPropGeometry } from "./propGeometry.ts";
import type { AssetLibrary } from "./Assets.ts";

const ruinsCenter = fromUV(RUINS_CENTER.u, RUINS_CENTER.v);
const ruinsCos = Math.cos(RUINS_ROTATION);
const ruinsSin = Math.sin(RUINS_ROTATION);

/**
 * Visual ground height at a point: the shared terrain, plus walkable
 * structures (the ruins' stepped dais) so characters stand on top of them.
 */
export function groundHeight(x: number, z: number): number {
  let h = terrainHeight(x, z);
  const dx = x - ruinsCenter.x;
  const dz = z - ruinsCenter.z;
  if (Math.abs(dx) < 6 && Math.abs(dz) < 6) {
    // Inverse of the ruins' local frame (see shared world.ts).
    const lx = dx * ruinsCos - dz * ruinsSin;
    const lz = dx * ruinsSin + dz * ruinsCos;
    const m = Math.max(Math.abs(lx), Math.abs(lz));
    if (m < 2.75) h += 0.6;
    else if (m < 3.75) h += 0.35;
  }
  return h;
}

const TERRAIN_SIZE = 340;

export interface EnvironmentOptions {
  /** Lower-cost settings for phones/tablets. */
  lowPower: boolean;
}

/**
 * Builds the static valley: terrain and mountains, the stream with its
 * waterfall and pool, vegetation, lights and atmosphere. Generated from the
 * same shared world definition the server uses.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly motes: THREE.Points;
  private readonly mist: THREE.Points;
  private readonly mistBase: THREE.Vector3;

  constructor(
    private readonly world: World,
    scene: THREE.Scene,
    assets: AssetLibrary,
    opts: EnvironmentOptions,
  ) {
    const sky = new THREE.Color("#0d1214");
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 90, 170);

    // Dusk: a low, warm sun and a cold blue fill. Dark fantasy, not storybook.
    scene.add(new THREE.HemisphereLight("#7d8fb0", "#232b1e", 1.5));
    this.sun = new THREE.DirectionalLight("#ffc890", 2.3);
    this.sun.castShadow = true;
    const shadowRes = opts.lowPower ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowRes, shadowRes);
    const sc = this.sun.shadow.camera;
    sc.left = -32;
    sc.right = 32;
    sc.top = 32;
    sc.bottom = -32;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.09;
    scene.add(this.sun, this.sun.target);

    this.group.add(this.buildTerrain(opts.lowPower ? 220 : 300));
    this.waterMat = this.buildWaterMaterial();
    this.group.add(this.buildStream(), this.buildPool());
    this.buildProps(assets);
    this.motes = this.buildMotes(opts.lowPower ? 80 : 220);
    const pc = poolCenter();
    const top = fromUV(pc.u, POOL_V - POOL_RADIUS + 1);
    this.mistBase = new THREE.Vector3(top.x, waterSurface(POOL_V), top.z);
    this.mist = this.buildMist();
    this.group.add(this.motes, this.mist);
    scene.add(this.group);
  }

  /** Keep the shadow frustum centred on the player; animate water and particles. */
  update(_dt: number, time: number, focus: THREE.Vector3): void {
    this.sun.position.set(focus.x - 26, focus.y + 36, focus.z + 30);
    this.sun.target.position.copy(focus);
    this.waterMat.uniforms.uTime!.value = time;
    this.motes.position.set(focus.x, focus.y, focus.z);
    (this.motes.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(time * 0.7) * 0.25;

    const pos = this.mist.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = (time * 0.35 + i / pos.count) % 1;
      const a = i * 2.399;
      const r = 0.5 + t * 3.5;
      pos.setXYZ(i, this.mistBase.x + Math.cos(a) * r, this.mistBase.y + t * 3, this.mistBase.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
  }

  // -------------------------------------------------------------------------

  private buildTerrain(seg: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color("#30492a");
    const grassB = new THREE.Color("#405a2e");
    const forestFloor = new THREE.Color("#1f2b1b");
    const dirt = new THREE.Color("#4f4333");
    const mud = new THREE.Color("#3d3428");
    const bed = new THREE.Color("#1d2a2c");
    const moss = new THREE.Color("#2a3524");
    const rock = new THREE.Color("#35322f");
    const darkRock = new THREE.Color("#2e2c2b");
    const snow = new THREE.Color("#5f6871");
    const seed = this.world.seed;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const sdf = valleySdf(x, z);
      const n = valueNoise(seed + 3, x / 6, z / 6);
      if (sdf >= -0.5) {
        c.copy(grassA).lerp(grassB, n).lerp(forestFloor, Math.min(1, forestDensity(seed, x, z) * 0.9));
        const trail = distanceToTrail(x, z);
        if (trail < 1.8) c.lerp(dirt, (1 - trail / 1.8) * (0.65 + n * 0.35));
        const dw = distanceToWater(x, z);
        if (dw < 0) c.copy(bed);
        else if (dw < 1.6) c.lerp(mud, 1 - dw / 1.6);
      } else {
        const { v } = toUV(x, z);
        const alt = h - valleyBase(v);
        c.copy(moss).lerp(rock, smoothstep(5, 15, alt)).lerp(darkRock, n * 0.5 * smoothstep(3, 10, alt));
        if (alt > 21 + n * 6) c.lerp(snow, smoothstep(21 + n * 6, 25 + n * 6, alt));
        const dw = distanceToWater(x, z);
        if (dw < 0.5) c.lerp(bed, 0.6);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = applyOcclusionCutout(toonMaterial({ vertexColors: true }), {
      minHeightAbovePlayer: 2.2,
      radiusScale: 1.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = "terrain";
    return mesh;
  }

  private buildWaterMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uDeep: { value: new THREE.Color("#0c2733") }, uShallow: { value: new THREE.Color("#2a5d6a") } },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute float aSteep;
        varying vec2 vUv;
        varying float vSteep;
        void main() {
          vUv = uv;
          vSteep = aSteep;
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
        varying float vSteep;
        void main() {
          float edge = abs(vUv.x - 0.5) * 2.0;           // 0 centre .. 1 bank
          float speed = 0.6 + vSteep * 4.0;
          float flow = vUv.y - uTime * speed;
          float ripple = sin(flow * 6.0 + sin(vUv.x * 9.0 + uTime) * 1.5) * 0.5 + 0.5;
          float sparkle = smoothstep(0.92, 1.0, sin(flow * 13.0 + vUv.x * 21.0) * ripple);
          vec3 col = mix(uDeep, uShallow, edge * 0.8 + ripple * 0.15);
          col += sparkle * 0.25;
          float foam = smoothstep(0.82, 1.0, edge) * (0.6 + 0.4 * ripple);
          // Waterfall: white streaks.
          float streak = smoothstep(0.4, 1.0, sin(flow * 3.0 + vUv.x * 30.0) * 0.5 + 0.5);
          foam = max(foam, vSteep * (0.55 + 0.45 * streak));
          col = mix(col, vec3(0.62, 0.74, 0.78), clamp(step(0.45, foam) * foam, 0.0, 1.0) * 0.8);
          gl_FragColor = vec4(col, mix(0.8, 0.55, edge) + vSteep * 0.15);
          #include <fog_fragment>
        }`,
    });
  }

  /** Ribbon following the stream from above the waterfall, through the valley and out the gorge. */
  private buildStream(): THREE.Mesh {
    const vStart = POOL_V - 30;
    const vEnd = 135;
    const steps = 520;
    const positions: number[] = [];
    const uvs: number[] = [];
    const steep: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = vStart + (i / steps) * (vEnd - vStart);
      const u = streamU(v);
      const above = v < POOL_V;
      const hw = above ? 1.3 + Math.max(0, (v - (POOL_V - 12)) / 12) * 0.6 : streamHalfWidth(v) + 0.35;
      const y = waterSurface(v) + (above ? 0.06 : 0);
      const slope = Math.abs(waterSurface(v + 0.5) - waterSurface(v - 0.5));
      const st = Math.min(1, slope * 0.9);
      const l = fromUV(u - hw, v);
      const r = fromUV(u + hw, v);
      positions.push(l.x, y, l.z, r.x, y, r.z);
      uvs.push(0, v * 0.25, 1, v * 0.25);
      steep.push(st, st);
      // Skip the stretch covered by the pool so the water isn't drawn twice.
      const inPool = v > POOL_V - POOL_RADIUS + 1.5 && v < POOL_V + POOL_RADIUS - 1.5;
      if (i < steps && !inPool) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("aSteep", new THREE.Float32BufferAttribute(steep, 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.waterMat);
    mesh.name = "stream";
    mesh.renderOrder = 1;
    return mesh;
  }

  private buildPool(): THREE.Mesh {
    const pc = poolCenter();
    const p = fromUV(pc.u, pc.v);
    const geo = new THREE.CircleGeometry(POOL_RADIUS + 0.4, 40).rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const steep = new Float32Array(uv.count);
    // Map UVs so the shader's "edge" term is radial.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i)) / (POOL_RADIUS + 0.4);
      uv.setXY(i, 0.5 + r * 0.5, pos.getZ(i) * 0.1);
    }
    geo.setAttribute("aSteep", new THREE.BufferAttribute(steep, 1));
    const mesh = new THREE.Mesh(geo, this.waterMat);
    mesh.position.set(p.x, waterSurface(POOL_V) - 0.01, p.z);
    mesh.name = "pool";
    return mesh;
  }

  private buildProps(assets: AssetLibrary): void {
    const byKind = new Map<PropKind, Prop[]>();
    for (const p of this.world.props) {
      let list = byKind.get(p.kind);
      if (!list) byKind.set(p.kind, (list = []));
      list.push(p);
    }

    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [kind, props] of byKind) {
      const matrices = props.map((p) =>
        new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, groundHeight(p.x, p.z) - (kind === "stone" ? 0.02 : 0), p.z),
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
      const mat = applyOcclusionCutout(toonMaterial({ vertexColors: true }));
      const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
      matrices.forEach((mat4, i) => inst.setMatrixAt(i, mat4));
      inst.castShadow = kind !== "mushroom" && kind !== "stone";
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      inst.name = `props:${kind}`;
      this.group.add(inst);
    }
  }

  private buildMotes(count: number): THREE.Points {
    // Drifting pollen / fireflies around the player for atmosphere.
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = 0.5 + Math.random() * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    // Fireflies: small, bright and additive so they glow in the gloom.
    const mat = new THREE.PointsMaterial({ color: "#d8f07a", size: 0.16, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    return new THREE.Points(geo, mat);
  }

  private buildMist(): THREE.Points {
    const count = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({ color: "#9fb4bf", size: 0.5, transparent: true, opacity: 0.3, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }
}
