import * as THREE from "three";

/**
 * Cel-shading helpers. Every lit surface uses MeshToonMaterial with one shared
 * gradient ramp, so light falls off in hard bands instead of smooth gradients.
 * Ink outlines are added afterwards by the screen-space pass in CelPost.ts.
 */

/** Light ramp: deep shadow, shadow, lit, highlight. Dark-leaning for a moody look. */
const RAMP = [72, 128, 200, 255];

let gradient: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array(RAMP.length * 4);
  RAMP.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, RAMP.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export type ToonParams = Omit<THREE.MeshToonMaterialParameters, "gradientMap">;

export function toonMaterial(params: ToonParams = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ ...params, gradientMap: toonGradient() });
}

/** Convert any loaded (e.g. glTF PBR) material into a toon material, keeping colour, textures and emissive. */
export function toToon(src: THREE.Material): THREE.MeshToonMaterial {
  const s = src as THREE.MeshStandardMaterial;
  const m = toonMaterial({
    color: s.color?.clone() ?? new THREE.Color("#ffffff"),
    map: s.map ?? null,
    emissive: s.emissive?.clone() ?? new THREE.Color("#000000"),
    emissiveMap: s.emissiveMap ?? null,
    emissiveIntensity: s.emissiveIntensity ?? 1,
    alphaMap: s.alphaMap ?? null,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: src.side,
    vertexColors: src.vertexColors,
  });
  m.name = src.name;
  return m;
}
