import * as THREE from "three";

/**
 * "See-through foliage": trees and rocks that stand between the camera and
 * the local player get a dithered hole cut around the player, the way classic
 * isometric ARPGs keep your hero visible in dense woods.
 *
 * Works by patching built-in materials via onBeforeCompile, so it applies to
 * procedural props and to loaded glTF models alike.
 */
export const occlusionUniforms = {
  uCutCenter: { value: new THREE.Vector2(-9999, -9999) }, // player position in framebuffer pixels
  uCutRadius: { value: 0 }, // pixels
  uCutViewZ: { value: 0 }, // player's view-space depth (positive)
};

export function applyOcclusionCutout<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, occlusionUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec2 uCutCenter;
uniform float uCutRadius;
uniform float uCutViewZ;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
{
  float d = distance(gl_FragCoord.xy, uCutCenter);
  if (d < uCutRadius && vViewPosition.z < uCutViewZ - 1.0) {
    // 4x4 ordered dither so the hole fades out at the edge.
    float edge = smoothstep(uCutRadius * 0.55, uCutRadius, d);
    vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
    float bayer = mod(p.x * 4.0 + p.y * 7.0 + p.x * p.y * 3.0, 16.0) / 16.0;
    if (bayer > edge) discard;
  }
}`,
      );
  };
  material.customProgramCacheKey = () => "occlusion-cutout";
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
  occlusionUniforms.uCutRadius.value = size.y * 0.09;
}
