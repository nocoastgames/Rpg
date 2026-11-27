import * as THREE from "three";
import { DEFAULT_APPEARANCE } from "@rpg/shared";
import type { AssetLibrary } from "../scene/Assets.ts";
import { createEnemyAvatar, createNpcAvatar, createPlayerAvatar, type Avatar } from "../scene/Avatars.ts";
import { toonMaterial } from "../scene/toon.ts";

/**
 * Model gallery (open the game with ?gallery): every creature and person
 * side by side, animated, for checking art. Click to cycle idle / walk /
 * attack / dead.
 */
export function showGallery(container: HTMLElement, assets: AssetLibrary): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a3424");
  scene.add(new THREE.HemisphereLight("#d6e6ff", "#3a4a2a", 1.4));
  const sun = new THREE.DirectionalLight("#fff0d6", 2.4);
  sun.position.set(-6, 10, 8);
  sun.castShadow = true;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), toonMaterial({ color: "#4e6a34" }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const kinds = ["wolf", "greyjaw", "spider", "giant_rat", "wasp", "adder", "bog_toad", "deer", "stag", "boar", "hare", "thornling", "skeleton", "risen", "gravedigger", "hollow_priest"];
  const avatars: Array<{ a: Avatar; label: string }> = [];
  const place = (a: Avatar, label: string, i: number, row: number) => {
    a.root.position.set((i - 7.5) * 3.2, 0, row * 4);
    a.root.rotation.y = -0.6;
    scene.add(a.root);
    avatars.push({ a, label });
  };
  kinds.forEach((k, i) => place(createEnemyAvatar(assets, k), k, i, 0));
  place(createPlayerAvatar(assets, "fighter", "rusty_shortsword", DEFAULT_APPEARANCE), "player", 0, -1);
  place(createNpcAvatar("vendor"), "haskel", 1, -1);
  for (const [i, id] of ["adv_brannoc", "adv_ilse", "adv_maren", "adv_wren"].entries()) place(createNpcAvatar(id), id, i + 2, -1);

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 20, 56);
  camera.lookAt(0, 0.8, 0);
  const label = document.createElement("div");
  label.style.cssText = "position:fixed;top:8px;left:8px;color:#fff;font:14px sans-serif;background:#0008;padding:4px 8px";
  container.append(label);
  const modes = ["idle", "walk", "attack", "dead"] as const;
  let mode = 0;
  let seq = 0;
  const setMode = () => {
    seq++;
    for (const { a } of avatars) a.setAnim(modes[mode] === "walk" ? "walk" : modes[mode]!, seq);
    label.textContent = `Gallery: ${modes[mode]} (click to change) · ${avatars.map((x) => x.label).join(", ")}`;
  };
  setMode();
  renderer.domElement.addEventListener("click", () => {
    mode = (mode + 1) % modes.length;
    setMode();
  });
  const g = window as unknown as { __gallery: { setMode(m: number): void } };
  g.__gallery = {
    setMode: (m: number) => {
      mode = m;
      setMode();
    },
  };
  let last = performance.now();
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const { a } of avatars) a.update(dt, modes[mode] === "walk" ? 2 : 0);
    renderer.render(scene, camera);
  };
  loop();
}
