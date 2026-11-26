import * as THREE from "three";

export interface CelPostOptions {
  /** Multisampled scene target (smoother edges, more GPU). */
  msaa: boolean;
}

/**
 * Screen-space "ink" pass for the cel-shaded look.
 *
 * The scene is rendered into an offscreen target with a depth texture, then a
 * full-screen shader draws dark outlines wherever the depth jumps (object
 * silhouettes, cliff edges, foliage), applies a colour grade and vignette, and
 * finally applies tone mapping + sRGB output like a normal render would.
 * The grade (saturation, shadow tint, vignette, exposure) follows the
 * time-of-day preset via setGrade().
 * Uses the Laplacian of linear depth so flat or sloped surfaces stay clean and
 * only real discontinuities get ink.
 */
export class CelPost {
  private target: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  enabled = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    opts: CelPostOptions,
  ) {
    const halfFloat = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: opts.msaa ? 4 : 0,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThickness: { value: 1 },
        uNear: { value: 0.1 },
        uFar: { value: 400 },
        uOrtho: { value: 1 },
        uInk: { value: new THREE.Color("#07090a") },
        uEdge: { value: 0.22 },
        uSaturation: { value: 1 },
        uShadowTint: { value: new THREE.Color("#ffffff") },
        uVignette: { value: 0.18 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uThickness;
        uniform float uNear;
        uniform float uFar;
        uniform float uOrtho;
        uniform vec3 uInk;
        uniform float uEdge;
        uniform float uSaturation;
        uniform vec3 uShadowTint;
        uniform float uVignette;
        varying vec2 vUv;

        float linearDepth(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }

        void main() {
          vec2 o = uTexel * uThickness;
          float c = linearDepth(vUv);
          float l = linearDepth(vUv - vec2(o.x, 0.0));
          float r = linearDepth(vUv + vec2(o.x, 0.0));
          float u = linearDepth(vUv + vec2(0.0, o.y));
          float d = linearDepth(vUv - vec2(0.0, o.y));
          // Second derivative: ~0 on planes and slopes, large at depth jumps.
          float lap = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
          // Only ink the nearer side of an edge, so lines stay one pixel wide.
          float nearer = step(c, max(max(l, r), max(u, d)) - 0.05);
          float edge = smoothstep(uEdge, uEdge * 2.5, lap) * nearer;

          vec4 col = texture2D(tColor, vUv);
          // Grade (driven by the time-of-day preset): saturation and shadow tint.
          float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          col.rgb = mix(vec3(lum), col.rgb, uSaturation);
          col.rgb = mix(col.rgb * uShadowTint, col.rgb, smoothstep(0.05, 0.5, lum));
          col.rgb = mix(col.rgb, uInk, edge);
          // Vignette.
          float vig = smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(1.2, 1.0)));
          col.rgb *= 1.0 - vig * uVignette;
          gl_FragColor = col;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.resize();
  }

  /** Colour grade from a time-of-day preset. */
  setGrade(p: { saturation: number; shadowTint: THREE.Color; vignette: number; exposure: number }): void {
    const u = this.material.uniforms;
    u.uSaturation!.value = p.saturation;
    (u.uShadowTint!.value as THREE.Color).copy(p.shadowTint);
    u.uVignette!.value = p.vignette;
    this.renderer.toneMappingExposure = p.exposure;
  }

  resize(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.material.uniforms.uTexel!.value.set(1 / size.x, 1 / size.y);
    // Bold ink: about 1.5 CSS pixels at any pixel density.
    this.material.uniforms.uThickness!.value = Math.max(1.5, this.renderer.getPixelRatio() * 1.5);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    const u = this.material.uniforms;
    u.tColor!.value = this.target.texture;
    u.tDepth!.value = this.target.depthTexture;
    const cam = camera as THREE.OrthographicCamera | THREE.PerspectiveCamera;
    u.uNear!.value = cam.near;
    u.uFar!.value = cam.far;
    u.uOrtho!.value = (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}
