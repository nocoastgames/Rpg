/**
 * Turns the KayKit character packs (CC0, by Kay Lousberg) into the small
 * files the game loads from client/public/assets/models/kaykit/:
 *
 * - one .glb per character, meshes and weapons only (each pack ships every
 *   character with ~3 MB of the same animations baked in);
 * - animations.glb: the shared rig with only the clips the game plays.
 *
 * Every KayKit character uses the same skeleton, so any clip plays on any
 * character, and parts (heads, hats, capes) can be swapped between them.
 *
 * Usage (after cloning the two packs from github.com/KayKit-Game-Assets):
 *   node --experimental-strip-types scripts/build-models.ts <adventurers-pack-dir> <skeletons-pack-dir>
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NodeIO, type Animation, type Document } from "@gltf-transform/core";
import { dedup, prune, resample } from "@gltf-transform/functions";

const [advDir, skelDir] = process.argv.slice(2);
if (!advDir || !skelDir) {
  console.error("usage: build-models.ts <kaykit-character-pack-adventures-1.0> <kaykit-character-pack-skeletons-1.0>");
  process.exit(1);
}
const OUT = new URL("../client/public/assets/models/kaykit/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/** The clips the game plays (see client/src/scene/KayKit.ts). */
const CLIPS = [
  "Idle",
  "Idle_Combat",
  "Unarmed_Idle",
  "2H_Melee_Idle",
  "Walking_A",
  "Walking_B",
  "Walking_D_Skeletons",
  "Running_A",
  "1H_Melee_Attack_Chop",
  "1H_Melee_Attack_Slice_Diagonal",
  "1H_Melee_Attack_Stab",
  "1H_Melee_Attack_Slice_Horizontal",
  "2H_Melee_Attack_Spin",
  "2H_Melee_Attack_Chop",
  "2H_Melee_Attack_Slice",
  "Dualwield_Melee_Attack_Stab",
  "Unarmed_Melee_Attack_Punch_A",
  "1H_Ranged_Shoot",
  "2H_Ranged_Shoot",
  "Spellcast_Shoot",
  "Spellcast_Raise",
  "Spellcast_Long",
  "Death_A",
  "Death_B",
  "Hit_A",
  "Interact",
  "PickUp",
  "Sit_Floor_Idle",
  "Cheer",
  "Skeletons_Awaken_Standing",
];

const io = new NodeIO();

async function finish(doc: Document, file: string): Promise<void> {
  await doc.transform(prune(), dedup());
  await io.write(join(OUT, file), doc);
  console.log(`${file}: ${(statSync(join(OUT, file)).size / 1024).toFixed(0)} KB`);
}

/** A character without its animations. */
function dropAnimation(a: Animation): void {
  // Samplers hold the keyframe data; dispose them too or prune keeps it.
  // (Leave the accessors to prune: clips share their keyframe times.)
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

async function character(src: string, file: string): Promise<void> {
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) dropAnimation(a);
  await finish(doc, file);
}

const advChars = join(advDir, "addons/kaykit_character_pack_adventures/Characters/gltf");
for (const name of ["Knight", "Barbarian", "Mage", "Rogue", "Rogue_Hooded"]) await character(join(advChars, `${name}.glb`), `${name}.glb`);

const skelChars = join(skelDir, "addons/kaykit_character_pack_skeletons/Characters/gltf");
for (const name of ["Skeleton_Minion", "Skeleton_Warrior", "Skeleton_Rogue", "Skeleton_Mage"]) await character(join(skelChars, `${name}.glb`), `${name}.glb`);

// The skeletons' weapons ship as separate .gltf files.
const skelAssets = join(skelDir, "addons/kaykit_character_pack_skeletons/Assets/gltf");
for (const f of readdirSync(skelAssets)) {
  if (!["Skeleton_Blade.gltf", "Skeleton_Axe.gltf", "Skeleton_Staff.gltf", "Skeleton_Shield_Small_A.gltf"].includes(f)) continue;
  await finish(await io.read(join(skelAssets, f)), f.replace(".gltf", ".glb"));
}

// Animations: the skeleton pack's rig (a superset of the adventurers' clips), meshes removed.
const anim = await io.read(join(skelChars, "Skeleton_Minion.glb"));
for (const a of anim.getRoot().listAnimations()) if (!CLIPS.includes(a.getName())) dropAnimation(a);
for (const n of anim.getRoot().listNodes()) {
  n.setMesh(null);
  n.setSkin(null);
}
for (const m of anim.getRoot().listMeshes()) m.dispose();
for (const s of anim.getRoot().listSkins()) s.dispose();
const missing = CLIPS.filter((c) => !anim.getRoot().listAnimations().some((a) => a.getName() === c));
if (missing.length) console.warn("missing clips:", missing.join(", "));
await anim.transform(resample());
await finish(anim, "animations.glb");
