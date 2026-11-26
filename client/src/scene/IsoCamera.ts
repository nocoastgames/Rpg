import * as THREE from "three";

/**
 * Classic isometric view: orthographic camera, yawed 45 degrees and pitched
 * down ~35 degrees, following a target on the ground. Mouse wheel zooms.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  /** World units visible vertically. Smaller = closer. */
  private viewHeight = 20;
  private readonly minView = 10;
  private readonly maxView = 36;
  private readonly offset: THREE.Vector3;
  private readonly target = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    const yaw = Math.PI / 4;
    const pitch = Math.atan(1 / Math.SQRT2); // 35.264 deg: true isometric
    const dist = 80;
    this.offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.resize(aspect);
  }

  resize(aspect: number): void {
    // Portrait phones: show more height so the visible width stays playable.
    const h = (this.viewHeight / 2) * (aspect < 1 ? Math.min(1.8, 0.75 / aspect) : 1);
    this.camera.left = -h * aspect;
    this.camera.right = h * aspect;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  zoom(deltaY: number, aspect: number): void {
    const step = Math.sign(deltaY) * Math.min(0.1, Math.abs(deltaY) / 600);
    this.viewHeight = THREE.MathUtils.clamp(this.viewHeight * (1 + step), this.minView, this.maxView);
    this.resize(aspect);
  }

  follow(x: number, y: number, z: number, dt: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 8);
    this.target.x += (x - this.target.x) * k;
    this.target.y += (y - this.target.y) * k;
    this.target.z += (z - this.target.z) * k;
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }

  /**
   * Convert a screen-space direction (WASD/stick: right = +x, up = +y) into a
   * world XZ direction, so "up" always walks up the screen. The input's
   * magnitude (0..1, analog sticks) is preserved.
   */
  screenDirToWorld(sx: number, sy: number): { x: number; z: number } {
    if (sx === 0 && sy === 0) return { x: 0, z: 0 };
    const fwd = new THREE.Vector3(-this.offset.x, 0, -this.offset.z).normalize();
    const right = new THREE.Vector3(fwd.z * -1, 0, fwd.x); // fwd rotated -90deg around Y
    const x = right.x * sx + fwd.x * sy;
    const z = right.z * sx + fwd.z * sy;
    const len = Math.hypot(x, z);
    const mag = Math.min(1, Math.hypot(sx, sy));
    return { x: (x / len) * mag, z: (z / len) * mag };
  }
}
