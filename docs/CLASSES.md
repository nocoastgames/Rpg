# Classes

> Generated from `shared/src/classes.ts` by `npm run docs:classes`. Edit the data, not this file.

12 classes, each with 2 subclasses. Every character has a basic attack, one class ability and one subclass ability.

| Class | Role | Resource | Attack | Subclasses |
|---|---|---|---|---|
| **Warrior** | Melee DPS | Rage | melee (2.2m) | Berserker, Guardian |
| **Paladin** | Hybrid | Mana | melee (2.2m) | Crusader, Lightwarden |
| **Ranger** | Ranged DPS | Focus | ranged (14m) | Beastmaster, Sharpshooter |
| **Rogue** | Melee DPS | Energy | melee (2m) | Assassin, Shadowdancer |
| **Wizard** | Caster | Mana | ranged (12m) | Pyromancer, Cryomancer |
| **Cleric** | Healer | Mana | ranged (10m) | Lifebinder, Inquisitor |
| **Necromancer** | Caster | Mana | ranged (11m) | Bonecaller, Plaguebringer |
| **Druid** | Hybrid | Mana | ranged (10m) | Shapeshifter, Grovekeeper |
| **Monk** | Melee DPS | Energy | melee (2m) | Iron Fist, Windwalker |
| **Bard** | Support | Mana | ranged (10m) | Skald, Trickster |
| **Warlock** | Caster | Mana | ranged (11m) | Hexblade, Voidcaller |
| **Shaman** | Hybrid | Mana | melee (2.4m) | Stormcaller, Spiritwalker |

## Warrior

_A hardened fighter who turns pain into rage and rage into broken bones._

- **Role:** Melee DPS · **Resource:** Rage · **Primary stat:** Might
- **Base stats:** Might 14, Agility 9, Intellect 4, Vitality 13, Spirit 5
- **Basic attack:** melee, 2.2m, 6-10 dmg every 0.9s
- **Wakes up with:** Rusty Shortsword

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Cleave _(class)_ | 15 | 4s | 2.5 | 1.4x damage, 2.2m radius |
| Bloodfury _(Berserker)_ | 20 | 18s | self | +40% damage for 6s |
| Shield Wall _(Guardian)_ | 20 | 18s | self | +50% armor for 6s |

**Berserker** — _Fury unchained._ Trades defence for overwhelming offence. (+3 Might, +1 Agility)

**Guardian** — _The wall that does not fall._ Shield-bearing protector who soaks damage so allies don't have to. (+4 Vitality)

## Paladin

_A holy knight bound by oath, equally at home leading a charge or holding a line._

- **Role:** Hybrid · **Resource:** Mana · **Primary stat:** Might
- **Base stats:** Might 12, Agility 6, Intellect 6, Vitality 12, Spirit 10
- **Basic attack:** melee, 2.2m, 6-9 dmg every 1s
- **Wakes up with:** Dented Mace

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Holy Strike _(class)_ | 12 | 5s | 2.5 | 1.6x damage, single target |
| Judgement _(Crusader)_ | 25 | 10s | 9 | 2x damage, 3m radius |
| Radiant Aura _(Lightwarden)_ | 30 | 20s | self | heal 30% max HP, allies within 7m |

**Crusader** — _Zeal made steel._ An offensive paladin who calls down judgement on the wicked. (+3 Might, +1 Spirit)

**Lightwarden** — _Shelter in the dark._ A protector who mends allies with radiant auras. (+3 Spirit, +1 Vitality)

## Ranger

_Wilderness hunter and peerless archer. The forest is home, not a threat._

- **Role:** Ranged DPS · **Resource:** Focus · **Primary stat:** Agility
- **Base stats:** Might 7, Agility 15, Intellect 6, Vitality 10, Spirit 7
- **Basic attack:** ranged, 14m, 5-8 dmg every 0.8s
- **Wakes up with:** Makeshift Bow

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Multishot _(class)_ | 20 | 6s | 14 | 1x damage, 3m radius |
| Feral Instinct _(Beastmaster)_ | 20 | 16s | self | +40% speed for 8s |
| Piercing Shot _(Sharpshooter)_ | 35 | 10s | 20 | 3x damage, single target |

**Beastmaster** — _Never hunts alone._ Bonded with the wild. Future versions add an animal companion. (+2 Vitality, +2 Spirit)

**Sharpshooter** — _One arrow, one kill._ Patient marksman who lands devastating long-range shots. (+4 Agility)

## Rogue

_A knife in the dark. Quick, quiet and gone before the body hits the floor._

- **Role:** Melee DPS · **Resource:** Energy · **Primary stat:** Agility
- **Base stats:** Might 8, Agility 15, Intellect 7, Vitality 9, Spirit 6
- **Basic attack:** melee, 2m, 4-7 dmg every 0.6s
- **Wakes up with:** Chipped Dagger

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Shadowstep _(class)_ | 30 | 7s | 8 | dash 8m, 1.2x damage on landing |
| Eviscerate _(Assassin)_ | 40 | 8s | 2.5 | 3x damage, single target |
| Fan of Blades _(Shadowdancer)_ | 35 | 8s | self | 1.3x damage around you, 4m |

**Assassin** — _Death, delivered._ Specialises in single, lethal strikes. (+3 Agility, +1 Might)

**Shadowdancer** — _A storm of steel._ Acrobatic duelist who fights many foes at once. (+2 Agility, +2 Vitality)

## Wizard

_Scholar of the arcane who bends raw elemental force to their will._

- **Role:** Caster · **Resource:** Mana · **Primary stat:** Intellect
- **Base stats:** Might 4, Agility 7, Intellect 16, Vitality 8, Spirit 10
- **Basic attack:** ranged, 12m, 5-9 dmg every 1s
- **Wakes up with:** Cracked Wand

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Arcane Blink _(class)_ | 15 | 8s | 8 | dash 8m |
| Fireball _(Pyromancer)_ | 25 | 6s | 14 | 2.2x damage, 3m radius |
| Frost Nova _(Cryomancer)_ | 25 | 9s | self | 1.4x damage around you, 5m |

**Pyromancer** — _Everything burns._ Master of flame and explosive area damage. (+4 Intellect)

**Cryomancer** — _Still as winter._ Controls the battlefield with ice. Future versions add slows and freezes. (+2 Intellect, +2 Vitality)

## Cleric

_Faithful servant of the old gods, keeping companions alive against all odds._

- **Role:** Healer · **Resource:** Mana · **Primary stat:** Spirit
- **Base stats:** Might 8, Agility 6, Intellect 8, Vitality 11, Spirit 15
- **Basic attack:** ranged, 10m, 4-7 dmg every 1s
- **Wakes up with:** Oak Cudgel

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Mend _(class)_ | 20 | 8s | self | heal 25% max HP, allies within 5m |
| Sanctuary _(Lifebinder)_ | 40 | 25s | self | heal 45% max HP, allies within 9m |
| Smite _(Inquisitor)_ | 25 | 7s | 12 | 2.2x damage, 2.5m radius |

**Lifebinder** — _None fall on my watch._ Devoted healer with powerful group restoration. (+4 Spirit)

**Inquisitor** — _Faith as a weapon._ Battle priest who punishes the unholy. (+2 Spirit, +2 Might)

## Necromancer

_Walker of the border between life and death who commands decay itself._

- **Role:** Caster · **Resource:** Mana · **Primary stat:** Intellect
- **Base stats:** Might 5, Agility 6, Intellect 15, Vitality 10, Spirit 9
- **Basic attack:** ranged, 11m, 5-8 dmg every 1s
- **Wakes up with:** Bone Fetish

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Drain Life _(class)_ | 18 | 6s | 10 | 1.3x damage, single target, 50% lifesteal |
| Bone Spear _(Bonecaller)_ | 25 | 7s | 16 | 2.4x damage, single target |
| Plague Cloud _(Plaguebringer)_ | 30 | 9s | 12 | 1.7x damage, 4m radius |

**Bonecaller** — _The dead remember._ Shapes bone into weapons. Future versions raise skeletal minions. (+3 Intellect, +1 Vitality)

**Plaguebringer** — _Rot spreads._ Spreads disease and lingering decay across groups of foes. (+2 Intellect, +2 Spirit)

## Druid

_Keeper of the old groves who speaks with root, beast and storm._

- **Role:** Hybrid · **Resource:** Mana · **Primary stat:** Spirit
- **Base stats:** Might 8, Agility 8, Intellect 10, Vitality 10, Spirit 12
- **Basic attack:** ranged, 10m, 5-8 dmg every 1s
- **Wakes up with:** Gnarled Branch

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Thornlash _(class)_ | 15 | 5s | 10 | 1.5x damage, single target |
| Bear Form _(Shapeshifter)_ | 25 | 20s | self | +40% armor for 10s |
| Rejuvenation _(Grovekeeper)_ | 30 | 16s | self | heal 35% max HP, allies within 7m |

**Shapeshifter** — _Claw and fang._ Takes the form of beasts. Future versions add full bear and wolf forms. (+2 Might, +2 Vitality)

**Grovekeeper** — _The forest provides._ Nurturing druid who channels the regrowth of the wild. (+4 Spirit)

## Monk

_Disciplined martial artist whose body is the only weapon needed._

- **Role:** Melee DPS · **Resource:** Energy · **Primary stat:** Agility
- **Base stats:** Might 10, Agility 13, Intellect 6, Vitality 10, Spirit 9
- **Basic attack:** melee, 2m, 4-7 dmg every 0.55s
- **Wakes up with:** Frayed Hand Wraps

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Flying Kick _(class)_ | 30 | 7s | 7 | dash 7m, 1.4x damage on landing |
| Hundred Palms _(Iron Fist)_ | 40 | 9s | 2.5 | 2.8x damage, single target |
| Cyclone Kick _(Windwalker)_ | 35 | 8s | self | 1.5x damage around you, 3.5m |

**Iron Fist** — _Unbreakable._ Hard-style fighter delivering crushing single blows. (+3 Might, +1 Vitality)

**Windwalker** — _Swift as the gale._ Fluid fighter who sweeps through crowds. (+3 Agility, +1 Spirit)

## Bard

_Wandering minstrel whose songs carry real power over friend and foe._

- **Role:** Support · **Resource:** Mana · **Primary stat:** Spirit
- **Base stats:** Might 6, Agility 11, Intellect 10, Vitality 9, Spirit 12
- **Basic attack:** ranged, 10m, 4-7 dmg every 0.9s
- **Wakes up with:** Battered Lute

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Song of Vigor _(class)_ | 20 | 10s | self | heal 15% max HP, allies within 9m |
| War Chant _(Skald)_ | 30 | 22s | self | +30% damage for 10s, allies within 9m |
| Dissonance _(Trickster)_ | 25 | 8s | self | 1.4x damage around you, 5m |

**Skald** — _Songs of war._ Battle-singer who drives allies to greater violence. (+2 Might, +2 Spirit)

**Trickster** — _Now you see me._ Illusionist who confounds enemies with discordant magic. (+2 Agility, +2 Intellect)

## Warlock

_Bound by a pact to something that should not be named, and paid well for it._

- **Role:** Caster · **Resource:** Mana · **Primary stat:** Intellect
- **Base stats:** Might 6, Agility 7, Intellect 14, Vitality 10, Spirit 9
- **Basic attack:** ranged, 11m, 5-9 dmg every 1s
- **Wakes up with:** Tarnished Sigil

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Soul Siphon _(class)_ | 18 | 6s | 10 | 1.3x damage, single target, 50% lifesteal |
| Cursed Edge _(Hexblade)_ | 25 | 20s | self | +50% damage for 8s |
| Void Rift _(Voidcaller)_ | 30 | 9s | 12 | 2x damage, 3.5m radius |

**Hexblade** — _A cursed edge._ Channels the patron's power through a bound blade. (+2 Might, +2 Vitality)

**Voidcaller** — _Gaze into the abyss._ Opens rifts to the void, unleashing raw destruction. (+4 Intellect)

## Shaman

_Speaker to the spirits of earth, sky and ancestors._

- **Role:** Hybrid · **Resource:** Mana · **Primary stat:** Spirit
- **Base stats:** Might 10, Agility 7, Intellect 9, Vitality 11, Spirit 12
- **Basic attack:** melee, 2.4m, 5-9 dmg every 0.95s
- **Wakes up with:** Splintered Spear

| Ability | Cost | Cooldown | Range | Effect |
|---|---|---|---|---|
| Earthshock _(class)_ | 15 | 5s | 10 | 1.5x damage, single target |
| Chain Lightning _(Stormcaller)_ | 28 | 8s | 14 | 1.8x damage, 4m radius |
| Ancestral Spirits _(Spiritwalker)_ | 30 | 18s | self | heal 30% max HP, allies within 7m |

**Stormcaller** — _The sky answers._ Commands lightning and thunder. (+3 Intellect, +1 Spirit)

**Spiritwalker** — _Ancestors guide me._ Calls on ancestral spirits to restore the living. (+3 Spirit, +1 Vitality)
