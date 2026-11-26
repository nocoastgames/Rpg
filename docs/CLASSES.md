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
- **Companions.** Each base has two *pet classes* on separate lines with different creatures: one traditionally good, one evil. Their level-25 specialisation (a *pet line*) brings a young companion at 25; at 50 the pet class grows it into something several times stronger (about 4x a familiar's health and damage), while the line's other end class takes a familiar instead. Every other end class gains a lesser *familiar* at 50.

- **Alignment.** Every class starts neutral; some paths turn good or evil (shown per end class below). A character whose alignment matches their god's leaning gets that faith's minor blessing (see docs/CHARACTER_CREATION.md).

## Pet classes

| Base | Good | Evil |
|---|---|---|
| Fighter | Woodsman → **Beastlord** (Wolf Pup → Alpha Wolf) | Dark Knight → **Death Knight** (Nightmare Hound → Hellhound) |
| Mage | Conjurer → **Phoenix Caller** (Firebird Hatchling → Phoenix) | Necromancer → **Lich** (Skeletal Servant → Skeletal Champion) |
| Priest | Wildcaller → **Archdruid** (Treant Sapling → Ancient Treant) | Shaman → **Witch Doctor** (Lesser Loa → Bound Loa) |
| Thief | Scout → **Falconer** (Hunting Hawk → War Falcon) | Assassin → **Plaguebringer** (Plague Rat → Rat King) |


## Hybrids

| Pair | From one side | From the other |
|---|---|---|
| Fighter + Priest | **Paladin** (Fighter) | **Grandmaster** (Priest) |
| Fighter + Thief | **Ranger** (Fighter) | **Swashbuckler** (Thief) |
| Fighter + Mage | **Shadow Knight** (Fighter) | **Spellblade** (Mage) |
| Mage + Thief | **Illusionist** (Mage) | **Phantom** (Thief) |
| Mage + Priest | **Deathspeaker** (Mage) | **Tempest** (Priest) |
| Priest + Thief | **Ascendant** (Priest) | **Troubadour** (Thief) |

## Fighter

_Trusts muscle, armour and a sharp edge. Builds rage by trading blows._

- **Resource:** Rage · **Primary stat:** Might · **Basic attack:** melee, 2.2m
- **Starting ability:** Heavy Blow: 1.6x damage, single target

| Lv 10 | Lv 25 | Lv 50 | Alignment | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|---|
| Warrior | Knight | **Paladin** | Good | Hybrid · Fighter + Priest, Good | Lay on Hands: heal 40% max HP, allies within 7m | Light Wisp (familiar) |
| Warrior | Knight | **Juggernaut** | Good | Pure, Good | Unstoppable: +55% armor for 8s | Iron Boar (familiar) |
| Warrior | Woodsman (pet line: Wolf Pup (pet) at 25) | **Beastlord** | Good | Pure, Pet class · Good | Pack Fury: +35% damage for 10s, allies within 10m | Alpha Wolf (empowered pet) |
| Warrior | Woodsman (pet line: Wolf Pup (pet) at 25) | **Ranger** | Neutral | Hybrid · Fighter + Thief | Fade Step: dash 7m, 1.4x damage on landing | Red Fox (familiar) |
| Marauder | Berserker | **Warlord** | Neutral | Pure | Rallying Cry: +30% damage for 10s, allies within 10m | War Hound (familiar) |
| Marauder | Berserker | **Bloodreaver** | Evil | Pure, Evil | Blood Frenzy: 2.4x damage, single target, 40% lifesteal | Carrion Crow (familiar) |
| Marauder | Dark Knight (pet line: Nightmare Hound (pet) at 25) | **Death Knight** | Evil | Pure, Pet class · Evil | Unholy Blight: 2x damage around you, 4m | Hellhound (empowered pet) |
| Marauder | Dark Knight (pet line: Nightmare Hound (pet) at 25) | **Shadow Knight** | Evil | Hybrid · Fighter + Mage, Evil | Shadow Cleave: 2.2x damage, 2.5m area | Void Wisp (familiar) |

**Abilities learned on the way:**

- Warrior (Lv 10): Cleave: 1.3x damage, 2.2m area
  - Knight (Lv 25): Shield Wall: +50% armor for 6s
  - Woodsman (Lv 25): Aimed Shot: 2x damage, single target
- Marauder (Lv 10): Rampage: 1.3x damage around you, 2.5m
  - Berserker (Lv 25): Bloodfury: +40% damage for 6s
  - Dark Knight (Lv 25): Soul Rend: 1.8x damage, single target, 40% lifesteal

## Mage

_A scholar of the arcane, fragile but devastating at range._

- **Resource:** Mana · **Primary stat:** Intellect · **Basic attack:** ranged, 12m
- **Starting ability:** Arcane Missile: 1.6x damage, single target

| Lv 10 | Lv 25 | Lv 50 | Alignment | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|---|
| Arcanist | Elementalist | **Archmage** | Neutral | Pure | Meteor: 3x damage, 5m area | Arcane Wisp (familiar) |
| Arcanist | Elementalist | **Spellblade** | Neutral | Hybrid · Mage + Fighter | Arcane Edge: 1.9x damage around you, 3.5m | Flame Sprite (familiar) |
| Arcanist | Conjurer (pet line: Firebird Hatchling (pet) at 25) | **Phoenix Caller** | Good | Pure, Pet class · Good | Sunfire: 2.4x damage, 4m area | Phoenix (empowered pet) |
| Arcanist | Conjurer (pet line: Firebird Hatchling (pet) at 25) | **Illusionist** | Neutral | Hybrid · Mage + Thief | Mirror Step: dash 8m, 1.5x damage on landing | Mirror Sprite (familiar) |
| Occultist | Necromancer (pet line: Skeletal Servant (pet) at 25) | **Lich** | Evil | Pure, Pet class · Evil | Death Nova: 1.9x damage around you, 5m | Skeletal Champion (empowered pet) |
| Occultist | Necromancer (pet line: Skeletal Servant (pet) at 25) | **Deathspeaker** | Neutral | Hybrid · Mage + Priest | Last Rites: heal 30% max HP, allies within 8m | Bound Wraith (familiar) |
| Occultist | Warlock | **Voidcaller** | Evil | Pure, Evil | Void Rift: 2.6x damage, 4m area | Void Eye (familiar) |
| Occultist | Warlock | **Hexmaster** | Evil | Pure, Evil | Hex: 2.8x damage, single target, 30% lifesteal | Hex Raven (familiar) |

**Abilities learned on the way:**

- Arcanist (Lv 10): Blink: dash 8m
  - Elementalist (Lv 25): Fireball: 2x damage, 3m area
  - Conjurer (Lv 25): Binding Circle: 1.8x damage, 3m area
- Occultist (Lv 10): Drain Life: 1.3x damage, single target, 50% lifesteal
  - Necromancer (Lv 25): Bone Spear: 2.2x damage, single target
  - Warlock (Lv 25): Curse of Agony: 1.7x damage, 3.5m area

## Priest

_Channels faith to mend allies and smite the wicked._

- **Resource:** Faith · **Primary stat:** Spirit · **Basic attack:** ranged, 10m
- **Starting ability:** Mend: heal 25% max HP, allies within 5m

| Lv 10 | Lv 25 | Lv 50 | Alignment | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|---|
| Cleric | Lifebinder | **Saint** | Good | Pure, Good | Miracle: heal 70% max HP, allies within 10m | White Dove (familiar) |
| Cleric | Lifebinder | **Oracle** | Good | Pure, Good | Foresight: +40% armor for 8s, allies within 10m | Seer Owl (familiar) |
| Cleric | Monk | **Grandmaster** | Neutral | Hybrid · Priest + Fighter | Hundred Palms: 3x damage, single target | Red-crowned Crane (familiar) |
| Cleric | Monk | **Ascendant** | Neutral | Hybrid · Priest + Thief | Cyclone Kick: 1.8x damage around you, 4m | Wind Sprite (familiar) |
| Druid | Wildcaller (pet line: Treant Sapling (pet) at 25) | **Archdruid** | Good | Pure, Pet class · Good | Tranquility: heal 50% max HP, allies within 10m | Ancient Treant (empowered pet) |
| Druid | Wildcaller (pet line: Treant Sapling (pet) at 25) | **Primalist** | Neutral | Pure | Bear Form: +45% armor for 10s | Bear Cub (familiar) |
| Druid | Shaman (pet line: Lesser Loa (pet) at 25) | **Witch Doctor** | Evil | Pure, Pet class · Evil | Voodoo Curse: 2.4x damage, 3.5m area | Bound Loa (empowered pet) |
| Druid | Shaman (pet line: Lesser Loa (pet) at 25) | **Tempest** | Neutral | Hybrid · Priest + Mage | Chain Lightning: 2.2x damage, 4.5m area | Storm Wisp (familiar) |

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

| Lv 10 | Lv 25 | Lv 50 | Alignment | Tags | Ability (learned) | Companion at 50 |
|---|---|---|---|---|---|---|
| Rogue | Assassin (pet line: Plague Rat (pet) at 25) | **Plaguebringer** | Evil | Pure, Pet class · Evil | Plague Cloud: 2x damage, 4.5m area | Rat King (empowered pet) |
| Rogue | Assassin (pet line: Plague Rat (pet) at 25) | **Nightblade** | Evil | Pure, Evil | Death Mark: 4x damage, single target | Shadow Cat (familiar) |
| Rogue | Shadowdancer | **Phantom** | Neutral | Hybrid · Thief + Mage | Phase Strike: dash 9m, 2x damage on landing | Shade (familiar) |
| Rogue | Shadowdancer | **Swashbuckler** | Neutral | Hybrid · Thief + Fighter | Dirty Brawl: 2.2x damage, 2.5m area | Parrot (familiar) |
| Wanderer | Scout (pet line: Hunting Hawk (pet) at 25) | **Falconer** | Good | Pure, Pet class · Good | Talon Strike: 3x damage, single target | War Falcon (empowered pet) |
| Wanderer | Scout (pet line: Hunting Hawk (pet) at 25) | **Deadeye** | Neutral | Pure | Deadly Aim: 3.4x damage, single target | Watcher Crow (familiar) |
| Wanderer | Bard | **Troubadour** | Good | Hybrid · Thief + Priest, Good | Hymn of Renewal: heal 40% max HP, allies within 10m | Songbird (familiar) |
| Wanderer | Bard | **Virtuoso** | Neutral | Pure | Dissonance: 2.2x damage around you, 5m | Echo (familiar) |

**Abilities learned on the way:**

- Rogue (Lv 10): Shadowstep: dash 8m, 1.2x damage on landing
  - Assassin (Lv 25): Eviscerate: 3x damage, single target
  - Shadowdancer (Lv 25): Evasion: +40% armor for 5s
- Wanderer (Lv 10): Fan of Knives: 1.3x damage around you, 4m
  - Scout (Lv 25): Marked Shot: 2x damage, single target
  - Bard (Lv 25): Song of Vigor: heal 20% max HP, allies within 9m
