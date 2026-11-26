# Classes

> Generated from `shared/src/classes.ts` by `npm run docs:classes`. Edit the data, not this file.

## How progression works

| Level | Choice | Requirement |
|---|---|---|
| 1 | One of 4 base classes | Character creation |
| 10 | 1 of 2 paths | Reach level 10 |
| 25 | 1 of 2 specialisations | Reach level 25 and complete the **Trial of Paths** |
| 50 | 1 of 2 end classes | Reach level 50 and complete the **Trial of Mastery** |

- **4 → 8 → 16 → 32.** Every class branches in two. Choices are permanent (a lineage system will allow changes later).
- **Each class teaches one ability**, and you keep every ability on your path: 4 abilities plus a basic attack at level 50.
- **Each base has 5 pure and 3 hybrid end classes.** A hybrid blends in a second base (one hybrid with each other base). Every pair of bases has exactly two hybrids, one reached from each side.
- **Companions.** One level-25 specialisation per base is a *pet line* and brings a pet at 25; its two end classes are *pet classes* whose companion is far stronger at 50 (about 4x a familiar's health and damage). Every other end class gains a lesser *familiar* at 50.

## Hybrids

| Pair | From one side | From the other |
|---|---|---|
| Fighter + Priest | **Paladin** (Fighter) | **Grandmaster** (Priest) |
| Fighter + Mage | **Shadow Knight** (Fighter) | **Spellblade** (Mage) |
| Fighter + Thief | **Ranger** (Fighter) | **Swashbuckler** (Thief) |
| Mage + Thief | **Illusionist** (Mage) | **Phantom** (Thief) |
| Mage + Priest | **Deathspeaker** (Mage) | **Tempest** (Priest) |
| Priest + Thief | **Ascendant** (Priest) | **Troubadour** (Thief) |

## Fighter

_Trusts muscle, armour and a sharp edge. Builds rage by trading blows._

- **Resource:** Rage · **Primary stat:** Might · **Basic attack:** melee, 2.2m
- **Starting ability:** Heavy Blow: 1.6x damage, single target

| Lv 10 | Lv 25 | Lv 50 | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|
| Warrior | Berserker | **Warlord** | Pure | Rallying Cry: +30% damage for 10s, allies within 10m | War Hound (familiar) |
| Warrior | Berserker | **Juggernaut** | Pure | Unstoppable: +55% armor for 8s | Iron Boar (familiar) |
| Warrior | Knight | **Paladin** | Hybrid · Fighter + Priest | Lay on Hands: heal 40% max HP, allies within 7m | Light Wisp (familiar) |
| Warrior | Knight | **Shadow Knight** | Hybrid · Fighter + Mage | Soul Rend: 2x damage, single target, 50% lifesteal | Shadow Hound (familiar) |
| Hunter | Woodsman | **Ranger** | Hybrid · Fighter + Thief | Fade Step: dash 7m, 1.4x damage on landing | Grey Wolf (familiar) |
| Hunter | Woodsman | **Warden** | Pure | Bramble Trap: 2.2x damage, 3m area | Barn Owl (familiar) |
| Hunter | Beastmaster (pet line: Bonded Wolf (pet) at 25) | **Beastlord** | Pure, Pet class | Pack Fury: +35% damage for 10s, allies within 10m | Dire Bear (empowered pet) |
| Hunter | Beastmaster (pet line: Bonded Wolf (pet) at 25) | **Dragon Knight** | Pure, Pet class | Dragon's Breath: 2x damage, 4m area | Young Drake (empowered pet) |

**Abilities learned on the way:**

- Warrior (Lv 10): Cleave: 1.3x damage, 2.2m area
  - Berserker (Lv 25): Bloodfury: +40% damage for 6s
  - Knight (Lv 25): Shield Wall: +50% armor for 6s
- Hunter (Lv 10): Volley: 1x damage, 3m area
  - Woodsman (Lv 25): Aimed Shot: 2x damage, single target
  - Beastmaster (Lv 25): Call of the Wild: +40% speed for 8s, allies within 8m

## Mage

_A scholar of the arcane, fragile but devastating at range._

- **Resource:** Mana · **Primary stat:** Intellect · **Basic attack:** ranged, 12m
- **Starting ability:** Arcane Missile: 1.6x damage, single target

| Lv 10 | Lv 25 | Lv 50 | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|
| Arcanist | Elementalist | **Archmage** | Pure | Meteor: 3x damage, 5m area | Arcane Wisp (familiar) |
| Arcanist | Elementalist | **Spellblade** | Hybrid · Mage + Fighter | Arcane Edge: 1.9x damage around you, 3.5m | Flame Sprite (familiar) |
| Arcanist | Enchanter | **Timeweaver** | Pure | Haste: +50% speed for 8s, allies within 10m | Clockwork Owl (familiar) |
| Arcanist | Enchanter | **Illusionist** | Hybrid · Mage + Thief | Mirror Step: dash 8m, 1.5x damage on landing | Mirror Sprite (familiar) |
| Occultist | Necromancer (pet line: Skeletal Servant (pet) at 25) | **Lich** | Pure, Pet class | Death Nova: 1.9x damage around you, 5m | Skeletal Champion (empowered pet) |
| Occultist | Necromancer (pet line: Skeletal Servant (pet) at 25) | **Deathspeaker** | Hybrid · Mage + Priest, Pet class | Last Rites: heal 30% max HP, allies within 8m | Bound Wraith (empowered pet) |
| Occultist | Warlock | **Voidcaller** | Pure | Void Rift: 2.6x damage, 4m area | Void Eye (familiar) |
| Occultist | Warlock | **Hexmaster** | Pure | Hex: 2.8x damage, single target, 30% lifesteal | Hex Raven (familiar) |

**Abilities learned on the way:**

- Arcanist (Lv 10): Blink: dash 8m
  - Elementalist (Lv 25): Fireball: 2x damage, 3m area
  - Enchanter (Lv 25): Mana Ward: +35% armor for 8s, allies within 8m
- Occultist (Lv 10): Drain Life: 1.3x damage, single target, 50% lifesteal
  - Necromancer (Lv 25): Bone Spear: 2.2x damage, single target
  - Warlock (Lv 25): Curse of Agony: 1.7x damage, 3.5m area

## Priest

_Channels faith to mend allies and smite the wicked._

- **Resource:** Faith · **Primary stat:** Spirit · **Basic attack:** ranged, 10m
- **Starting ability:** Mend: heal 25% max HP, allies within 5m

| Lv 10 | Lv 25 | Lv 50 | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|
| Cleric | Lifebinder | **Saint** | Pure | Miracle: heal 70% max HP, allies within 10m | White Dove (familiar) |
| Cleric | Lifebinder | **Oracle** | Pure | Foresight: +40% armor for 8s, allies within 10m | Seer Owl (familiar) |
| Cleric | Monk | **Grandmaster** | Hybrid · Priest + Fighter | Hundred Palms: 3x damage, single target | Red-crowned Crane (familiar) |
| Cleric | Monk | **Ascendant** | Hybrid · Priest + Thief | Cyclone Kick: 1.8x damage around you, 4m | Wind Sprite (familiar) |
| Druid | Wildcaller (pet line: Spirit Wolf (pet) at 25) | **Archdruid** | Pure, Pet class | Tranquility: heal 50% max HP, allies within 10m | Ancient Treant (empowered pet) |
| Druid | Wildcaller (pet line: Spirit Wolf (pet) at 25) | **Primalist** | Pure, Pet class | Bear Form: +45% armor for 10s | Spirit Bear (empowered pet) |
| Druid | Shaman | **Tempest** | Hybrid · Priest + Mage | Chain Lightning: 2.2x damage, 4.5m area | Storm Wisp (familiar) |
| Druid | Shaman | **Soulkeeper** | Pure | Ancestral Spirits: heal 40% max HP, allies within 9m | Ancestor Spirit (familiar) |

**Abilities learned on the way:**

- Cleric (Lv 10): Smite: 1.8x damage, 2m area
  - Lifebinder (Lv 25): Sanctuary: heal 35% max HP, allies within 9m
  - Monk (Lv 25): Flying Kick: dash 7m, 1.4x damage on landing
- Druid (Lv 10): Thornlash: 1.6x damage, single target
  - Wildcaller (Lv 25): Rejuvenation: heal 30% max HP, allies within 8m
  - Shaman (Lv 25): Earthshock: 1.8x damage, 2.5m area

## Thief

_Lives by speed and cunning. Strikes where it hurts most._

- **Resource:** Energy · **Primary stat:** Agility · **Basic attack:** melee, 2m
- **Starting ability:** Backstab: 2x damage, single target

| Lv 10 | Lv 25 | Lv 50 | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|
| Rogue | Assassin | **Nightblade** | Pure | Death Mark: 4x damage, single target | Shadow Cat (familiar) |
| Rogue | Assassin | **Phantom** | Hybrid · Thief + Mage | Phase Strike: dash 9m, 2x damage on landing | Shade (familiar) |
| Rogue | Duelist | **Blademaster** | Pure | Blade Storm: 2x damage around you, 4m | Steel Raven (familiar) |
| Rogue | Duelist | **Swashbuckler** | Hybrid · Thief + Fighter | Dirty Brawl: 2.2x damage, 2.5m area | Parrot (familiar) |
| Wanderer | Bard | **Troubadour** | Hybrid · Thief + Priest | Hymn of Renewal: heal 40% max HP, allies within 10m | Songbird (familiar) |
| Wanderer | Bard | **Virtuoso** | Pure | Dissonance: 2.2x damage around you, 5m | Echo (familiar) |
| Wanderer | Trapper (pet line: Hunting Hawk (pet) at 25) | **Falconer** | Pure, Pet class | Talon Strike: 3x damage, single target | War Falcon (empowered pet) |
| Wanderer | Trapper (pet line: Hunting Hawk (pet) at 25) | **Plaguebringer** | Pure, Pet class | Plague Cloud: 2x damage, 4.5m area | Plague Rat (empowered pet) |

**Abilities learned on the way:**

- Rogue (Lv 10): Shadowstep: dash 8m, 1.2x damage on landing
  - Assassin (Lv 25): Eviscerate: 3x damage, single target
  - Duelist (Lv 25): Riposte: +40% armor for 5s
- Wanderer (Lv 10): Fan of Knives: 1.3x damage around you, 4m
  - Bard (Lv 25): Song of Vigor: heal 20% max HP, allies within 9m
  - Trapper (Lv 25): Bear Trap: 2x damage, 2m area
