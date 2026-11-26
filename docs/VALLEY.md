# The starting valley (levels 1–5)

The Unknown Forest is a small valley walled in by mountains and the first
zone of the game, built for **levels 1 to 5**. You wake by the stream in
ragged clothes with a crude weapon that suits your class (a rusty shortsword,
a cracked wand, a dented mace or a chipped dagger), a heel of stale bread and
an empty waterskin.

All of the data below lives in `shared/src/valley.ts` (zones, shrines, the
campsite), `shared/src/quests.ts` (the first quest, resting), `shared/src/enemies.ts`
and `shared/src/status.ts`. The rules run on the server in
`server/src/sim/Game.ts`.

## Map

```
                    waterfall + pool
         Shrine of the Veil      Greypine Wood (2-3, wolves)
   Shrine of the Deep Rot             Shrine of the Green Mother
 The Thornbrake (4-5)                          Shrine of the Oathshield
 Cave Mouth (sealed)   Shrine of the Roads                The Narrow Pass (sealed)
                     The Clearing (camp)  * you wake here
 Shrine of the Hunger                   ford     Tusk Meadow (1-2, boars)
                                                       Shrine of the Dawn
     Unknown Ruins (sealed)
   Shrine of the Hidden Ledger     Webbed Hollow (3-4, spiders)
                                 Shrine of the Far Shore
                           gorge (the stream leaves)
```

## Hunting grounds

| Zone | Levels | Creatures | Status effect | Where |
| --- | --- | --- | --- | --- |
| Tusk Meadow | 1–2 | Tusked boars, wild hares | none | East bank, across the ford |
| Greypine Wood | 2–3 | Grey wolves | Bleeding (20% of hits): 3 damage a second for 5 s | North, around the waterfall pool |
| Ashford (the village) | 2–3 | Risen villagers, skeletons; Old Corwin the Gravedigger (named); the Hollow Priest (boss, level 4) | none (the Priest's blast blights) | West, on the old road |
| Webbed Hollow | 3–4 | Hollow spiders | Poisoned (35%): 2 damage a second for 8 s | South, toward the gorge |
| The Thornbrake | 4–5 | Thornlings | Blighted (25%): you deal 25% less damage for 10 s | North-west, in front of the cave |

- Each zone keeps a set population (11, 9, 10, 7, 7). Hares never fight back; they bolt. A creature killed returns to
  its own zone after 20 seconds.
- Creatures spawn at a level inside the zone's range. Health, damage and
  experience scale with level (`enemyStats`).
- Nothing spawns near where you wake, near the campsite, or within 12 m of a
  shrine.
- Entering a zone shows its name and level range. The large map (`M`) labels
  the zones you've found.
- Status effects don't stack: being hit again refreshes the timer. Damage over
  time ignores armour. Death clears them.

Rough pacing: the first quest takes you to about level 3, and the hunting
grounds carry you to 5 (about 1,150 experience in total).

## Shrines

Each of the nine gods has a shrine somewhere in the valley, set where that
god's domain shows: Solenne's faces the sunrise, Orren's stands at the
crossroads, the Ferryman's cairn sits where the stream leaves the valley, the
Deep Rot's stump is split by black thorns near the cave.

- **Your god's shrine calls to you.** A column of light in the god's colour
  rises from it until you've prayed there, and it is always marked on your map.
- **The first prayer receives your god's blessing.** The usual rules still
  apply: your path has to suit the god (see
  [CHARACTER_CREATION.md](CHARACTER_CREATION.md)). If it doesn't, the prayer is
  remembered, and the blessing follows once their favour is won.
- **Every prayer after that cures all status effects and fully heals you.**
  The shrine needs 30 seconds before it answers again.
- **Other gods' shrines don't answer you.** Inspecting one tells you whose it
  is, nothing more: the gods' epic quests have to be discovered through lore
  books and other world items.
- After you convert to a new god, pray at their shrine to receive their
  blessing.

## The campsite

The Clearing, just west of where you wake, is where you build your camp in the
first quest. Once it's built:

- **Rest by the fire** (interact). You're fully healed, your resource is
  restored and status effects are cured. You become **Well Rested** (+15%
  experience from kills and double natural healing for 15 minutes).
- **Resting stirs the valley back to life.** Every hunting ground refills to
  full strength at once.
- You can't rest while something is chasing you.
- **You respawn at the camp** instead of the stream bank.

The camp belongs to the world, not one player: once anyone builds it, everyone
in that world can rest there. Players who haven't done the quest yet still
finish it by adding their supplies to the camp.

## First quest: Shelter

About ten minutes for a new player. Gathering spots glint and are marked on
your map while you need them; the tracker (top left) shows the step and your
progress.

| Step | Task | Reward |
| --- | --- | --- |
| 1. Firewood | Gather 8 bundles of dry branches from the deadfall in the woods around the clearing (1.5 s each) | 40 XP |
| 2. A ring of stones | Collect 6 smooth stones from the stream banks (1.5 s each) | 50 XP |
| 3. Hides | Hunt boars in Tusk Meadow for 4 good hides (nearly a third of hides come out torn and useless) | 80 XP |
| 4. Make camp | Return to the clearing and build the camp (4 s) | 120 XP |

Gathering and building are timed actions with a progress bar. Moving,
attacking or being hit interrupts them. Quest rewards aren't boosted by Well
Rested or background bonuses.

## Haskel the Peddler

A traveling merchant camped by the old signpost on the road to the pass. A
rockfall buried the road behind his cart; everyone is stuck in the valley
until the kingdom beyond digs it out. He used to trade with **Ashford**, a
farming village down the old west road, and found it overrun by the dead.

Talk to him (interact) to open his window:

- **Talk:** his story, his quest (*The Silent Village*), one odd job at a
  time, and a plain weapon for your calling if you've lost yours (no weapon
  equipped and none you can use in your pack).
- **Buy:**

  | Item | Price | What it does |
  | --- | --- | --- |
  | Trail Ration | 3 | Food: 40% health over 12 s |
  | Healing Draught | 25 | Potion: 40% health at once, even in combat (15 s cooldown) |
  | Throwing Knife ×5 | 8 | Thrown at the nearest enemy within 12 m |
  | Arrows ×20 | 4 | Bows shoot one per attack for +2 damage |
  | Map of the Valley | 12 | Reveals the whole map for good |
  | A Peddler's Bestiary | 10 | Notes on the valley's creatures (+60 XP the first read) |
  | Hymns of the Ten | 10 | A hymn for each god, with a curious margin note (+60 XP) |

- **Sell:** loot, rusty gear and anything else with a value. "Sell all loot"
  sells every material in your pack.

A **❗** over his head means he has something for you; **❓** means you have
something to hand in.

### Odd jobs (repeatable)

He offers one at a time, at random: 3 wolf pelts, 4 raw hares, 3 boar hides,
3 spider silk, 5 old bones or 4 black thorns, for 8–16 coins and some
experience. Hand the items over in his window; a new job is offered after.

## Food, potions, loot and money

- **Food** (stale bread, rations, cooked meat) heals over 10–12 s and only
  out of combat; taking or dealing damage interrupts the meal. Raw boar and
  hare meat cook into Roast Boar and Roast Hare if you use them at the camp
  fire.
- **Healing Draughts** are expensive but instant and work mid-fight.
- Quick-heal (`5`, D-pad up) eats out of combat and drinks a draught in it.
- **Loot** goes straight into the killer's pack: boar hides and meat, wolf
  pelts, hare meat, spider silk, black thorns, old bones, grave shrouds, the
  odd tarnished locket, coins, and sometimes rusty gear (a rusted longsword,
  flail, dirk or gravewood wand for one calling each, or a moth-eaten
  gambeson anyone can wear).
- **Equipment:** use a weapon or armour in your pack to equip it (it swaps
  with what you're wearing). Click an equipped item to take it off. Armour
  shows on your character.

## The map

You start without one. The map only shows what you've explored (about 24 m
around wherever you've been), plus the camp and your god's shrine. Buy
Haskel's map to see the whole valley.

## Second quest: The Silent Village

From Haskel. About twenty minutes; the village's dead are level 2–3 and the
Hollow Priest is a level 4 boss.

| Step | Task | Reward |
| --- | --- | --- |
| 1. The old west road | Find Ashford | 40 XP |
| 2. Put them to rest | Destroy 8 risen villagers or skeletons | 90 XP |
| 3. What happened here | Search the cart, the well and the headman's journal (2 s each) | 70 XP |
| 4. The gravedigger | Kill Old Corwin in the graveyard for the crypt key | 70 XP |
| 5. Under the chapel | Unlock the crypt (3 s); the Hollow Priest climbs out | 30 XP |
| 6. The Hollow Priest | Destroy it. Every 7 s it blasts everything within 4.5 m (and blights it); at half health it calls two skeletons | 150 XP |
| 7. Root and ash | Burn the black thorns in the crypt (4 s) | 60 XP |
| 8. Report to Haskel | Talk to him | 150 XP, 25 coins, and your first **upper-body armour** for your calling |

| Calling | Armour |
| --- | --- |
| Fighter | Ashford Militia Brigandine (10% armour, +2 Vitality) |
| Mage | Hedge-Wizard's Robe (5% armour, +2 Intellect) |
| Priest | Chapel Vestments (7% armour, +2 Spirit) |
| Thief | Poacher's Leathers (7% armour, +2 Agility) |

**When you report back, Haskel lights a signal fire on the rockslide. Twenty
seconds later the kingdom's men clear the road and the pass opens for everyone
in that world.**

## The road out: arrested

Soldiers in the King's blue and silver wait in the pass beyond the rockslide.
Walk out through it and they arrest you: you're the only living soul to come
out of the valley where the dead walk, and nobody can explain that. A short
scene plays (controls are locked), the screen goes black, and you wake in a
cell in **the castle dungeon**, far from the valley.

- The cell is all that's built: straw, a bucket, chains, a barred slit of
  moonlight, a torch outside, a locked door, and scratches on the wall.
- Your map can't help you there ("You don't know where you are").
- You keep your gear. If you die in the dungeon you wake in the cell.
- `/tp cell` goes there directly; `/tp spawn` (or any valley place) brings you
  back.

The crypt is shared world state like the camp: once someone unlocks it the
door stays open, and once the thorns are burned they stay burned. If you
reach the Hollow Priest step after someone else has destroyed it, inspect the
crypt and it rises again for you.

## Dev commands

| Command | Effect |
| --- | --- |
| `/tp camp`, `/tp shrine_<god>`, `/tp tusk_meadow` (any zone id) | Teleport |
| `/tp vendor`, `/tp village`, `/tp crypt` | Teleport to Haskel, Ashford, the crypt |
| `/step [quest]` | Finish the current step of a quest (default: your first active one) |
| `/quest make_camp`, `/quest silent_village` | Start (if needed) and finish a whole quest |
| `/coins <n>` | Set your coins |
