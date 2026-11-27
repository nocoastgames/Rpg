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
  CHUNK_SIZE,
  VALLEY_HALF_V,
  chunkProps,
  type PropKind,
  type World,
} from "@rpg/shared";
import { applyOcclusionCutout } from "./occlusion.ts";
import { toonMaterial } from "./toon.ts";
import { sunDirection, type LightingPreset } from "./Lighting.ts";
import { buildPropGeometry } from "./propGeometry.ts";
import type { AssetLibrary } from "./Assets.ts";

const ruinsCenter = fromUV(RUINS_CENTER.u, RUINS_CENTER.v);
const GRASS_A = new THREE.Color("#4f7a35");
const GRASS_B = new THREE.Color("#6c8f3d");
const FOREST_FLOOR = new THREE.Color("#3b4f2a");
const DIRT = new THREE.Color("#7d6a47");
const MUD = new THREE.Color("#6b5a3c");
const BED = new THREE.Color("#4a5a55");
const MOSS = new THREE.Color("#55643f");
const ROCK = new THREE.Color("#5f5a53");
const DARK_ROCK = new THREE.Color("#4c4843");
const SNOW = new THREE.Color("#b9c2c9");
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

/** The ground is a tile that follows the camera (the valley is kilometres across). */
const TERRAIN_SIZE = 260;
const TERRAIN_STEP = 2;
/** Rebuild the tile around you once you are this far from its centre. */
const TERRAIN_RECENTRE = 50;
/** Trees, rocks and bushes are drawn within this distance. */
const PROP_RADIUS = 75;
const PROP_REFRESH = 15;
const PROP_KINDS: readonly PropKind[] = ["pine", "oak", "birch", "rock", "bush", "log", "mushroom", "stone"];
const PROP_CAPACITY = 4000;

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
  private readonly hemi: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly sunOffset = new THREE.Vector3(-30, 45, 30);
  private fireflies = 0;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly motes: THREE.Points;
  private readonly mist: THREE.Points;
  private readonly mistBase: THREE.Vector3;
  private readonly terrain: THREE.Mesh;
  private terrainCentre = { x: Number.NaN, z: Number.NaN };
  /** A terrain rebuild in progress, a few rows per frame. */
  private terrainJob: { cx: number; cz: number; row: number; pos: Float32Array; col: Float32Array } | null = null;
  private readonly propMeshes = new Map<PropKind, THREE.InstancedMesh>();
  private readonly gltfPropMeshes: THREE.Object3D[] = [];
  private readonly chunkMatrices = new Map<string, Map<PropKind, number[]>>();
  private propCentre = { x: Number.NaN, z: Number.NaN };
  private readonly assets: AssetLibrary;

  constructor(
    private readonly world: World,
    scene: THREE.Scene,
    assets: AssetLibrary,
    opts: EnvironmentOptions,
  ) {
    // Colours and intensities here are placeholders; applyLighting() sets the real values per time of day.
    const sky = new THREE.Color("#22302a");
    scene.background = sky;
    this.fog = new THREE.Fog(sky, 120, 210);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight("#d6e6ff", "#3a4a2a", 1.2);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.5);
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

    this.assets = assets;
    this.terrain = this.buildTerrain();
    this.group.add(this.terrain);
    const sp = world.spawn;
    this.rebuildTerrainNow(sp.x, sp.z);
    this.waterMat = this.buildWaterMaterial();
    this.group.add(this.buildStream(), this.buildPool());
    this.buildPropMeshes();
    this.refreshProps(sp.x, sp.z);
    this.motes = this.buildMotes(opts.lowPower ? 80 : 220);
    const pc = poolCenter();
    const top = fromUV(pc.u, POOL_V - POOL_RADIUS + 1);
    this.mistBase = new THREE.Vector3(top.x, waterSurface(POOL_V), top.z);
    this.mist = this.buildMist();
    this.group.add(this.motes, this.mist);
    scene.add(this.group);
  }

  /** Apply a time-of-day preset (see Lighting.ts). Cheap enough to call every frame during a cycle. */
  applyLighting(p: LightingPreset, scene: THREE.Scene): void {
    (scene.background as THREE.Color).copy(p.sky);
    this.fog.color.copy(p.sky);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.copy(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sunOffset.copy(sunDirection(p)).multiplyScalar(60);
    this.waterMat.uniforms.uLight!.value = p.water;
    this.fireflies = p.fireflies;
    // Daytime motes are pale pollen; at night they become green-gold fireflies.
    (this.motes.material as THREE.PointsMaterial).color.set("#fff3b0").lerp(new THREE.Color("#d8f07a"), p.fireflies);
  }

  /** Indoors (the dungeon) there's no pollen, fireflies or mist. */
  setOutdoors(outdoors: boolean): void {
    this.motes.visible = outdoors;
    this.mist.visible = outdoors;
    // Underground there's no valley floor under the rooms, just dark.
    this.terrain.visible = outdoors;
  }

  /** Keep the shadow frustum centred on the player; animate water and particles. */
  update(_dt: number, time: number, focus: THREE.Vector3): void {
    this.streamWorld(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
    this.waterMat.uniforms.uTime!.value = time;
    this.motes.position.set(focus.x, focus.y, focus.z);
    (this.motes.material as THREE.PointsMaterial).opacity = (0.35 + this.fireflies * 0.45) + Math.sin(time * 0.7) * 0.2;

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

  // --- Streaming: terrain tile and props follow the player --------------------

  private streamWorld(focus: THREE.Vector3): void {
    // Terrain: start a background rebuild when we drift from the tile's centre; finish it a slice per frame.
    if (!this.terrainJob && Math.hypot(focus.x - this.terrainCentre.x, focus.z - this.terrainCentre.z) > TERRAIN_RECENTRE) {
      this.startTerrainJob(focus.x, focus.z);
    }
    if (this.terrainJob) {
      // Far off (a teleport): finish at once rather than walk off the edge.
      const far = Math.hypot(focus.x - this.terrainCentre.x, focus.z - this.terrainCentre.z) > TERRAIN_SIZE / 2 - 40;
      this.stepTerrainJob(far ? Infinity : 6);
    }
    if (Math.hypot(focus.x - this.propCentre.x, focus.z - this.propCentre.z) > PROP_REFRESH) this.refreshProps(focus.x, focus.z);
  }

  private buildTerrain(): THREE.Mesh {
    const seg = TERRAIN_SIZE / TERRAIN_STEP;
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const count = (geo.attributes.position as THREE.BufferAttribute).count;
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = applyOcclusionCutout(toonMaterial({ vertexColors: true }), {
      minHeightAbovePlayer: 2.2,
      radiusScale: 1.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = "terrain";
    mesh.frustumCulled = false;
    return mesh;
  }

  private rebuildTerrainNow(x: number, z: number): void {
    this.startTerrainJob(x, z);
    this.stepTerrainJob(Infinity);
  }

  private startTerrainJob(x: number, z: number): void {
    const cx = Math.round(x / TERRAIN_STEP) * TERRAIN_STEP;
    const cz = Math.round(z / TERRAIN_STEP) * TERRAIN_STEP;
    const n = (TERRAIN_SIZE / TERRAIN_STEP + 1) ** 2;
    this.terrainJob = { cx, cz, row: 0, pos: new Float32Array(n * 3), col: new Float32Array(n * 3) };
  }

  /** Compute up to `rows` rows of the next terrain tile; swap it in when complete. */
  private stepTerrainJob(rows: number): void {
    const job = this.terrainJob;
    if (!job) return;
    const side = TERRAIN_SIZE / TERRAIN_STEP + 1;
    const end = Math.min(side, job.row + rows);
    const c = new THREE.Color();
    const seed = this.world.seed;
    for (let r = job.row; r < end; r++) {
      const z = job.cz - TERRAIN_SIZE / 2 + r * TERRAIN_STEP;
      for (let q = 0; q < side; q++) {
        const x = job.cx - TERRAIN_SIZE / 2 + q * TERRAIN_STEP;
        const i = r * side + q;
        const h = terrainHeight(x, z);
        job.pos[i * 3] = x;
        job.pos[i * 3 + 1] = h;
        job.pos[i * 3 + 2] = z;
        this.groundColour(c, seed, x, z, h);
        job.col[i * 3] = c.r;
        job.col[i * 3 + 1] = c.g;
        job.col[i * 3 + 2] = c.b;
      }
    }
    job.row = end;
    if (job.row < side) return;
    const geo = this.terrain.geometry;
    (geo.attributes.position as THREE.BufferAttribute).array.set(job.pos);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).array.set(job.col);
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.terrainCentre = { x: job.cx, z: job.cz };
    this.terrainJob = null;
  }

  private groundColour(c: THREE.Color, seed: number, x: number, z: number, h: number): void {
    const sdf = valleySdf(x, z);
    const n = valueNoise(seed + 3, x / 6, z / 6);
    if (sdf >= -0.5) {
      c.copy(GRASS_A).lerp(GRASS_B, n).lerp(FOREST_FLOOR, Math.min(1, forestDensity(seed, x, z) * 0.9));
      const trail = distanceToTrail(x, z);
      if (trail < 1.8) c.lerp(DIRT, (1 - trail / 1.8) * (0.65 + n * 0.35));
      const dw = distanceToWater(x, z);
      if (dw < 0) c.copy(BED);
      else if (dw < 1.6) c.lerp(MUD, 1 - dw / 1.6);
    } else {
      const { v } = toUV(x, z);
      const alt = h - valleyBase(v);
      c.copy(MOSS).lerp(ROCK, smoothstep(5, 15, alt)).lerp(DARK_ROCK, n * 0.5 * smoothstep(3, 10, alt));
      if (alt > 21 + n * 6) c.lerp(SNOW, smoothstep(21 + n * 6, 25 + n * 6, alt));
      const dw = distanceToWater(x, z);
      if (dw < 0.5) c.lerp(BED, 0.6);
    }
  }

  private buildWaterMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uLight: { value: 1 }, uDeep: { value: new THREE.Color("#1f5a73") }, uShallow: { value: new THREE.Color("#5fa7b8") } },
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
        uniform float uLight;
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
          col = mix(col, vec3(0.88, 0.94, 0.97), clamp(step(0.45, foam) * foam, 0.0, 1.0) * 0.8);
          col *= uLight;
          gl_FragColor = vec4(col, mix(0.8, 0.55, edge) + vSteep * 0.15);
          #include <fog_fragment>
        }`,
    });
  }

  /** Ribbon following the stream from above the waterfall, through the valley and out the gorge. */
  private buildStream(): THREE.Mesh {
    const vStart = POOL_V - 40;
    const vEnd = VALLEY_HALF_V + 200;
    const steps = Math.round((vEnd - vStart) / 2.5);
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

  /** One instanced mesh per prop kind, refilled with whatever is near the player. */
  private buildPropMeshes(): void {
    for (const kind of PROP_KINDS) {
      const geo = buildPropGeometry(kind);
      const mat = applyOcclusionCutout(toonMaterial({ vertexColors: true }));
      const inst = new THREE.InstancedMesh(geo, mat, PROP_CAPACITY);
      inst.count = 0;
      inst.castShadow = kind !== "mushroom" && kind !== "stone";
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      inst.name = `props:${kind}`;
      this.group.add(inst);
      this.propMeshes.set(kind, inst);
    }
  }

  /** Instance matrices for one chunk's props, by kind (cached). */
  private chunkMatricesFor(cx: number, cz: number): Map<PropKind, number[]> {
    const key = `${cx},${cz}`;
    let m = this.chunkMatrices.get(key);
    if (m) return m;
    m = new Map();
    const tmp = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (const p of chunkProps(this.world, cx, cz)) {
      pos.set(p.x, groundHeight(p.x, p.z) - (p.kind === "stone" ? 0.02 : 0), p.z);
      tmp.compose(pos, q.setFromAxisAngle(up, p.rotation), scale.setScalar(p.scale));
      let list = m.get(p.kind);
      if (!list) m.set(p.kind, (list = []));
      list.push(...tmp.elements);
    }
    this.chunkMatrices.set(key, m);
    return m;
  }

  private refreshProps(x: number, z: number): void {
    this.propCentre = { x, z };
    const r = PROP_RADIUS;
    const cx0 = Math.floor((x - r) / CHUNK_SIZE);
    const cx1 = Math.floor((x + r) / CHUNK_SIZE);
    const cz0 = Math.floor((z - r) / CHUNK_SIZE);
    const cz1 = Math.floor((z + r) / CHUNK_SIZE);
    const byKind = new Map<PropKind, number[][]>();
    const keep = new Set<string>();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        // Round area: skip chunk corners well outside the radius.
        const ccx = (cx + 0.5) * CHUNK_SIZE;
        const ccz = (cz + 0.5) * CHUNK_SIZE;
        if (Math.hypot(ccx - x, ccz - z) > r + CHUNK_SIZE) continue;
        keep.add(`${cx},${cz}`);
        for (const [kind, list] of this.chunkMatricesFor(cx, cz)) {
          let lists = byKind.get(kind);
          if (!lists) byKind.set(kind, (lists = []));
          lists.push(list);
        }
      }
    }
    // Forget matrices of chunks far behind us.
    if (this.chunkMatrices.size > keep.size * 3) for (const k of this.chunkMatrices.keys()) if (!keep.has(k)) this.chunkMatrices.delete(k);

    // A downloaded glTF model replaces the placeholder for its kind.
    for (const o of this.gltfPropMeshes) this.group.remove(o);
    this.gltfPropMeshes.length = 0;
    for (const kind of PROP_KINDS) {
      const inst = this.propMeshes.get(kind)!;
      const lists = byKind.get(kind) ?? [];
      const arr = inst.instanceMatrix.array as Float32Array;
      let n = 0;
      for (const list of lists) {
        const count = Math.min(list.length / 16, PROP_CAPACITY - n);
        arr.set(count * 16 === list.length ? list : list.slice(0, count * 16), n * 16);
        n += count;
      }
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      if (this.assets.hasProp(kind) && n > 0) {
        const matrices: THREE.Matrix4[] = [];
        for (let i = 0; i < n; i++) matrices.push(new THREE.Matrix4().fromArray(arr, i * 16));
        const meshes = this.assets.instancedProp(kind, matrices);
        if (meshes) {
          inst.count = 0;
          for (const m of meshes) this.group.add(m);
          this.gltfPropMeshes.push(...meshes);
        }
      }
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
    // Pollen by day, fireflies by night (colour set in applyLighting). Additive so they glow.
    const mat = new THREE.PointsMaterial({ color: "#fff3b0", size: 0.14, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    return new THREE.Points(geo, mat);
  }

  private buildMist(): THREE.Points {
    const count = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({ color: "#eef6ff", size: 0.5, transparent: true, opacity: 0.35, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }
}
