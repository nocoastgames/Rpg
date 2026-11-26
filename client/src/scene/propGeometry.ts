import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PropKind } from "@rpg/shared";

/**
 * Procedural low-poly placeholder geometry for world props. Each kind is a
 * single merged geometry with baked vertex colours so it can be drawn as one
 * InstancedMesh. Replaced automatically when a glTF prop is configured in
 * public/assets/models/manifest.json.
 */

function part(geo: THREE.BufferGeometry, color: string, transform?: (g: THREE.BufferGeometry) => void): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  transform?.(g);
  g.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  // Slight per-face colour jitter for a hand-painted feel.
  for (let i = 0; i < count; i += 3) {
    const j = 0.92 + ((i * 7919) % 17) / 100;
    for (let k = 0; k < 3 && i + k < count; k++) {
      colors[(i + k) * 3] = c.r * j;
      colors[(i + k) * 3 + 1] = c.g * j;
      colors[(i + k) * 3 + 2] = c.b * j;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g = g.index ? g.toNonIndexed() : g;
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

const cache = new Map<PropKind, THREE.BufferGeometry>();

export function buildPropGeometry(kind: PropKind): THREE.BufferGeometry {
  const hit = cache.get(kind);
  if (hit) return hit;
  let geo: THREE.BufferGeometry;
  switch (kind) {
    case "pine":
      geo = merge([
        part(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), "#3d2a1c", (g) => g.translate(0, 0.8, 0)),
        part(new THREE.ConeGeometry(1.5, 2.2, 7), "#1d3a28", (g) => g.translate(0, 2.2, 0)),
        part(new THREE.ConeGeometry(1.15, 1.9, 7), "#22452f", (g) => g.translate(0, 3.2, 0)),
        part(new THREE.ConeGeometry(0.75, 1.5, 7), "#285036", (g) => g.translate(0, 4.1, 0)),
      ]);
      break;
    case "oak":
      geo = merge([
        part(new THREE.CylinderGeometry(0.22, 0.34, 2, 7), "#3f2c1d", (g) => g.translate(0, 1, 0)),
        part(new THREE.IcosahedronGeometry(1.5, 0), "#2e4d22", (g) => g.translate(0, 2.9, 0)),
        part(new THREE.IcosahedronGeometry(1.1, 0), "#36582a", (g) => g.translate(0.9, 2.5, 0.4)),
        part(new THREE.IcosahedronGeometry(1.0, 0), "#273f1c", (g) => g.translate(-0.8, 2.6, -0.5)),
      ]);
      break;
    case "birch":
      geo = merge([
        part(new THREE.CylinderGeometry(0.12, 0.16, 2.8, 6), "#b8b3a6", (g) => g.translate(0, 1.4, 0)),
        part(new THREE.IcosahedronGeometry(0.95, 0), "#566e30", (g) => {
          g.scale(1, 1.3, 1);
          g.translate(0, 3.2, 0);
        }),
      ]);
      break;
    case "rock":
      geo = merge([
        part(new THREE.DodecahedronGeometry(0.6, 0), "#5b5d58", (g) => {
          g.scale(1, 0.6, 0.85);
          g.translate(0, 0.2, 0);
        }),
      ]);
      break;
    case "bush":
      geo = merge([
        part(new THREE.IcosahedronGeometry(0.6, 0), "#26431f", (g) => {
          g.scale(1.2, 0.8, 1.2);
          g.translate(0, 0.35, 0);
        }),
        part(new THREE.IcosahedronGeometry(0.4, 0), "#30512a", (g) => g.translate(0.45, 0.4, 0.2)),
      ]);
      break;
    case "stone":
      // Flat stepping stone.
      geo = merge([
        part(new THREE.DodecahedronGeometry(0.42, 0), "#5f605a", (g) => {
          g.scale(1, 0.32, 0.85);
          g.translate(0, 0.02, 0);
        }),
      ]);
      break;
    case "log":
      geo = merge([
        part(new THREE.CylinderGeometry(0.3, 0.32, 2.4, 7), "#46301f", (g) => {
          g.rotateZ(Math.PI / 2);
          g.translate(0, 0.28, 0);
        }),
      ]);
      break;
    case "mushroom":
      geo = merge([
        part(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 5), "#cfc6b2", (g) => g.translate(0, 0.11, 0)),
        part(new THREE.ConeGeometry(0.16, 0.12, 6), "#8e2620", (g) => g.translate(0, 0.25, 0)),
        part(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 5), "#cfc6b2", (g) => g.translate(0.15, 0.08, 0.08)),
        part(new THREE.ConeGeometry(0.11, 0.09, 6), "#9a3222", (g) => g.translate(0.15, 0.18, 0.08)),
      ]);
      break;
  }
  cache.set(kind, geo);
  return geo;
}
