import * as THREE from "three";
import { mulberry32, type GatherNode, type World } from "@rpg/shared";
import { groundHeight } from "./Environment.ts";
import { applyOcclusionCutout } from "./occlusion.ts";
import { toonMaterial } from "./toon.ts";

/**
 * Quest pick-ups (dry branches, river stones). Shown only while your current
 * quest step wants them, with a glint so they're easy to spot; gone once
 * picked up.
 */
export class QuestNodes {
  readonly group = new THREE.Group();
  private readonly items: Array<{ node: GatherNode; obj: THREE.Group; glint: THREE.Mesh }> = [];
  private readonly glintMat = new THREE.MeshBasicMaterial({ color: "#fff3b0", transparent: true, opacity: 0.9, depthWrite: false });

  constructor(world: World) {
    const rng = mulberry32(99);
    const wood = applyOcclusionCutout(toonMaterial({ color: "#7a5a3a" }));
    const woodDark = applyOcclusionCutout(toonMaterial({ color: "#5e4329" }));
    const stone = applyOcclusionCutout(toonMaterial({ color: "#9aa0a4" }));
    for (const node of world.nodes) {
      const obj = new THREE.Group();
      if (node.kind === "deadfall") {
        for (let i = 0; i < 5; i++) {
          const len = 0.7 + rng() * 0.5;
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, len, 5), i % 2 ? wood : woodDark);
          stick.rotation.set(Math.PI / 2 - 0.15 + rng() * 0.3, rng() * Math.PI, 0);
          stick.position.set((rng() - 0.5) * 0.3, 0.06 + i * 0.03, (rng() - 0.5) * 0.3);
          stick.castShadow = true;
          obj.add(stick);
        }
      } else {
        const st = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), stone);
        st.scale.set(1.2, 0.55, 0.9);
        st.position.y = 0.09;
        st.castShadow = true;
        obj.add(st);
      }
      const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), this.glintMat);
      glint.position.y = 0.7;
      obj.add(glint);
      obj.position.set(node.x, groundHeight(node.x, node.z), node.z);
      obj.visible = false;
      this.group.add(obj);
      this.items.push({ node, obj, glint });
    }
  }

  update(time: number, wants: (n: GatherNode) => boolean): void {
    for (const it of this.items) {
      it.obj.visible = wants(it.node);
      if (!it.obj.visible) continue;
      it.glint.position.y = 0.7 + Math.sin(time * 3 + it.node.x) * 0.08;
      it.glint.rotation.y = time * 2;
    }
  }
}
