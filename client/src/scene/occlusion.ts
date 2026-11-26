import * as THREE from "three";

/**
 * "See-through foliage": trees and rocks that stand between the camera and
 * the local player get a hole cut around the player, the way classic
 * isometric ARPGs keep your hero visible in dense woods. The hole is
 * hard-edged so the ink-outline pass draws a clean rim around it.
 *
 * Works by patching built-in materials via onBeforeCompile, so it applies to
 * procedural props and to loaded glTF models alike.
 */
export const occlusionUniforms = {
  uCutCenter: { value: new THREE.Vector2(-9999, -9999) }, // player position in framebuffer pixels
  uCutRadius: { value: 0 }, // pixels
  uCutViewZ: { value: 0 }, // player's view-space depth (positive)
  uCutWorldY: { value: 0 }, // player's feet height in world space
};

export interface CutoutOptions {
  /**
   * Only cut fragments at least this many metres above the player's feet.
   * Used for terrain, so the ground around the player is never cut but
   * mountainsides between camera and player are.
   */
  minHeightAbovePlayer?: number;
  /** Multiplier on the cut radius. */
  radiusScale?: number;
}

export function applyOcclusionCutout<T extends THREE.Material>(material: T, opts: CutoutOptions = {}): T {
  const heightAware = opts.minHeightAbovePlayer !== undefined;
  const heightTest = heightAware ? `&& vCutWorldY > uCutWorldY + ${opts.minHeightAbovePlayer!.toFixed(2)}` : "";
  const radius = `(uCutRadius * ${(opts.radiusScale ?? 1).toFixed(2)})`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, occlusionUniforms);
    if (heightAware) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vCutWorldY;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec2 uCutCenter;
uniform float uCutRadius;
uniform float uCutViewZ;
uniform float uCutWorldY;
${heightAware ? "varying float vCutWorldY;" : ""}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
{
  float uCutR = ${radius};
  float d = distance(gl_FragCoord.xy, uCutCenter);
  if (d < uCutR && vViewPosition.z < uCutViewZ - 1.0 ${heightTest}) {
    // Hard-edged porthole: the ink pass outlines its rim, which reads well with cel shading.
    discard;
  }
}`,
      );
  };
  material.customProgramCacheKey = () => `occlusion-cutout-${opts.minHeightAbovePlayer ?? "x"}-${opts.radiusScale ?? 1}`;
  return material;
}

const tmp = new THREE.Vector3();

/** Call once per frame with the local player's world position. */
export function updateOcclusion(camera: THREE.Camera, renderer: THREE.WebGLRenderer, playerPos: THREE.Vector3 | null): void {
  if (!playerPos) {
    occlusionUniforms.uCutRadius.value = 0;
    return;
  }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  tmp.copy(playerPos).setY(playerPos.y + 1);
  const viewPos = tmp.clone().applyMatrix4(camera.matrixWorldInverse);
  tmp.project(camera);
  occlusionUniforms.uCutCenter.value.set((tmp.x * 0.5 + 0.5) * size.x, (tmp.y * 0.5 + 0.5) * size.y);
  occlusionUniforms.uCutViewZ.value = -viewPos.z;
  occlusionUniforms.uCutWorldY.value = playerPos.y;
  occlusionUniforms.uCutRadius.value = size.y * 0.09;
}
