# Art & Asset Sources

The game runs with **zero downloaded assets**: every character, creature and
prop has a procedural low-poly placeholder built in code
(`client/src/scene/Avatars.ts`, `client/src/scene/propGeometry.ts`).

Real models are layered on top through a manifest, so you can swap art in
gradually without touching game code.

## How to add a model pack

1. Download a pack (see the list below) and unzip it into its own folder under
   `client/public/assets/models/`, e.g. `client/public/assets/models/kaykit-adventurers/`.
2. Copy the entries you want from `manifest.example.json` into `manifest.json`
   and fix the file paths to match your download.
3. Check the animation clip names (drag the `.glb` into
   <https://gltf-viewer.donmccurdy.com/>) and map them under `clips`
   (`idle`, `walk`, `attack`, `cast`, `dead`). If you leave `clips` out, the
   loader guesses from common names ("Idle", "Walk", "Attack", "Death"…).
4. Materials are converted to the game's toon shading automatically, so PBR
   packs blend in with the cel-shaded look; strong baked lighting in textures
   may look odd.
5. Tune `scale` (placeholders are ~1.8 m tall) and `rotationY` (models must face +Z).
6. Reload. Anything that fails to load falls back to the placeholder and logs a
   warning in the browser console.

Manifest keys:

| Section      | Key format                                         | Example                       |
| ------------ | -------------------------------------------------- | ----------------------------- |
| `characters` | a class id from the tree, a base class, or `"default"` | `"berserker"`, `"fighter"`   |
| `enemies`    | enemy id from `shared/src/enemies.ts`              | `"wolf"`                      |
| `props`      | prop kind from `shared/src/world.ts`               | `"pine"`, `"rock"`, `"bush"`  |

A character entry can also point `animations` at a separate `.glb` that holds
clips for the same skeleton (useful for packs that ship rigs and animations
separately).

## Downloading packs (why it's manual)

Automated downloads from the cloud dev environment didn't work out:

- **Quaternius** hosts packs in Google Drive folders; Drive answered "quota
  exceeded" for every file (popular public files hit Drive's download limits).
- **Kenney** refuses non-browser clients and marks its pages "noai", so it
  shouldn't be scraped.
- **KayKit** downloads go through itch.io's interactive download flow.

All three download fine by hand in a browser. Note that the **Ultimate
Modular Ruins** pack (Quaternius) ships FBX/OBJ only. Convert it to `.glb`
first (Blender: *File › Import › FBX*, then *Export › glTF 2.0 (.glb)*), or
with the `obj2gltf` / `FBX2glTF` command-line tools.

## Recommended open-licence packs

All of these were chosen because they are **CC0 (public domain)**: no
attribution is legally required and they can be committed to the repo and
shipped commercially. Crediting the authors is still good manners, and the
credits screen should list them.

| Pack | Author | What it gives us | Licence | Where |
| --- | --- | --- | --- | --- |
| KayKit – Adventurers | Kay Lousberg | Rigged + animated Knight, Barbarian, Mage, Rogue, Rogue (hooded) with weapons. Good base for most of the 12 classes. | CC0 | kaylousberg.itch.io/kaykit-adventurers |
| KayKit – Skeletons | Kay Lousberg | Animated skeleton warrior / mage / rogue / minion. First dungeon enemies; necromancer look. | CC0 | kaylousberg.itch.io/kaykit-skeletons |
| KayKit – Dungeon Remastered | Kay Lousberg | Modular dungeon walls, floors, doors, props, chests. For the dungeon layer. | CC0 | kaylousberg.itch.io/kaykit-dungeon-remastered |
| KayKit – Forest Nature Pack | Kay Lousberg | Stylised trees, rocks, bushes matching the KayKit look. Drop-in for the forest props. | CC0 | kaylousberg.itch.io |
| Ultimate Animated Animal Pack | Quaternius | Animated forest animals (wolf, deer, fox and others) for the forest creatures. | CC0 | quaternius.com |
| Ultimate Modular Ruins | Quaternius | Columns, arches, broken walls; would replace the procedural ruins. FBX/OBJ only, convert first. | CC0 | quaternius.com |
| Monster & RPG character packs | Quaternius | Animated low-poly monsters and fantasy heroes (several packs on the site). | CC0 | quaternius.com |
| Universal Animation Library | Quaternius | Humanoid animation set that can be retargeted. | CC0 | quaternius.com |
| Nature Kit, Graveyard Kit, Fantasy Town Kit | Kenney | Huge low-poly prop libraries (trees, rocks, fences, tents, campfires). | CC0 | kenney.nl/assets |
| UI Pack RPG Expansion, Game Icons | Kenney | Panels, frames and item icons to replace the emoji icons. | CC0 | kenney.nl/assets |
| RPG audio, Impact sounds | Kenney | Footsteps, hits, UI clicks. | CC0 | kenney.nl/assets |

Mixing art styles looks bad: KayKit + Quaternius + Kenney all share a clean
low-poly style and work together reasonably well. Pack names and file layouts change between releases, so check each download.
Pick one "hero" style
(KayKit is recommended for characters) and fill gaps from the others.

### Licences to be careful with

- **Poly Pizza / Sketchfab / OpenGameArt**: per-model licences vary (CC0,
  CC-BY, CC-BY-SA, GPL). CC-BY is fine but needs credit; avoid -SA/GPL art
  unless you are happy with its share-alike terms. Record every non-CC0 asset
  in a `CREDITS.md`.
- **Mixamo**: free to use in games, but it is not an open licence and the raw
  files can't be redistributed in a public repo.

## Why the placeholders stay

Even after real art is added, the placeholders keep the game playable for
anyone who clones the repo before downloading packs, and they make a good
fallback if a model file is missing or broken.
