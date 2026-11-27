# The starting valley (levels 1–5)

The Unknown Forest is a valley walled in by mountains and the first zone of
the game, built for **levels 1 to 5**. It is big: about **3 km east to west
and 4.5 km north to south**, roughly 10 minutes across and 15 minutes from end
to end at a walk. You wake by the stream in ragged clothes with a crude weapon
that suits your class (a rusty shortsword, a cracked wand, an oak cudgel or a
chipped dagger), a heel of stale bread and an empty waterskin.

All of the data below lives in `shared/src/valley.ts` (layout, zones,
shrines, the campsite), `shared/src/quests.ts`, `shared/src/enemies.ts` and
`shared/src/status.ts`. The rules run on the server in
`server/src/sim/Game.ts`.

## Map

North is up (away from the camera); distances are walking time from where you wake.

```
                          waterfall + pool (9 min)
              Shrine of the Veil
   Cave Mouth (sealed)                Greypine Wood (2-3, wolves; 5 min north)
 The Thornbrake (4-5)
   Shrine of the Deep Rot
                         Shrine of the Green Mother          Shrine of the Oathshield
                                                                The Narrow Pass (sealed)
  Shrine of the Hunger                        Ashford (2-3)        (5 min east)
                         Shrine of the Roads   ford
   Haskel's caravan + your camp  * you wake    Tusk Meadow (1-2)   Shrine of the Dawn
  Shrine of the Hidden Ledger            Shrine of the Far Shore
     Unknown Ruins (sealed)
                                     Webbed Hollow (3-4, spiders; 3 min south)
                              gorge (the stream leaves)
```

The **old road** runs from the wake-up clearing across the ford, east through
Ashford and up into the pass. A path leads west from where you wake to
Haskel's caravan, about half a minute's walk. Fainter trails lead
south-west to the ruins and up the western valley to the cave.

## Hunting grounds

| Zone | Levels | Creatures | Status effect | Where |
| --- | --- | --- | --- | --- |
| Tusk Meadow | 1–2 | Tusked boars, wild hares | none | Open grassland east of the ford, a minute from the clearing |
| Greypine Wood | 2–3 | Grey wolves, hares; Greyjaw (named, level 2) at the wolves' den on its south edge | Bleeding (20% of hits): 3 damage a second for 5 s | The dense pine forest filling the north |
| Ashford (the village) | 2–3 | Risen villagers, skeletons; Old Corwin the Gravedigger (named, level 3); the Hollow Priest (boss, level 4) | none (the Priest's blast blights) | On the old road, east of the ford |
| Webbed Hollow | 3–4 | Hollow spiders | Poisoned (35%): 2 damage a second for 8 s | The south, toward the gorge |
| The Thornbrake | 4–5 | Thornlings | Blighted (25%): you deal 25% less damage for 10 s | The far north-west, in front of the cave |

Wild hares live everywhere else in the valley.

- **Spread out.** Every creature keeps its distance from the others (30–40 m
  in the wild, 8 m inside Ashford), and aggro ranges are short (6–8 m), so you
  can pick your fights instead of pulling a crowd.
- **Packs (party encounters).** In the Webbed Hollow and the Thornbrake,
  creatures of level 4 and up come in packs of 2–3 that fight together: hit
  or get spotted by one and every packmate within 18 m joins in. A pack
  returns only once every member is dead. These fights are designed for two:
  you and a companion from Haskel's camp (below), or another player.
- A creature killed returns to its own zone after 20 seconds.
- Creatures spawn at a level inside the zone's range. Health, damage and
  experience scale with level (`enemyStats`).
- Nothing spawns within 45 m of where you wake, the campsite or Haskel, or
  within 12 m of a shrine.
- Creatures more than 200 m from every player stand still (saves the server
  and the network).
- Entering a zone shows its name and level range. The large map (`M`) labels
  the zones you've found.
- Status effects don't stack: being hit again refreshes the timer. Damage over
  time ignores armour. Death clears them.

### Difficulty

Fighting above your level is punishing: each level of difference shifts damage
by 38% in the stronger side's favour, both ways (`levelGapMultiplier` in
`shared/src/stats.ts`). Results from the balance simulator (`npm run balance
-w server`: every calling, auto-attacks plus its first ability, no potions or
food):

| You | vs same level | vs one level higher | vs two or more higher |
| --- | --- | --- | --- |
| Level 1 | win, ~75% health left | win, ~30% left (a Priest ~10%) | always lose |
| Level 2 | win, ~70–90% left | win, ~25–45% left | always lose |
| Level 3 | win | Thornling (4): about half your fights | lose |

Party encounters (`PARTY_ONLY=1 npm run balance -w server`), at level 4, no
potions:

| Encounter | Alone | + Brannoc | + Ilse | + Sister Maren | + Wren |
| --- | --- | --- | --- | --- | --- |
| 3 thornlings | always lose | win, ~60% left | win, ~65% left | win 3 in 4, ~60% left | win half, ~15% left |
| 3 hollow spiders | always lose | win, ~80% left | win, ~75% left | win, ~75% left | win, ~35% left |
| The Hollow Priest | always lose | win, ~70% left | win, ~65% left | win, ~70% left | win, ~50% left |

Wren hits hardest against a single target and is weakest against a pack;
Brannoc and Ilse are the safe picks for the Thornbrake.

Named creatures (`NAMED_ONLY=1 npm run balance -w server`):

| Creature | Where | Alone | With a companion |
| --- | --- | --- | --- |
| Greyjaw (level 2) | The wolves' den, Greypine Wood | level 2: win, ~55% health left | level 2: win, 80–88% left |
| Old Corwin (level 3) | Ashford's graveyard | level 3: win, 25–65% left | |
| The Hollow Priest (level 4 boss) | The crypt's thorn chamber | level 4: always lose | level 4: win, 50–70% left |

### Pacing

Levelling is slow on purpose, and the story quests are tuned to it
(`xpForNextLevel` in `shared/src/stats.ts`: 360 × level^1.15, so 360 XP to
level 2, 799 to level 3, 1,271 to level 4, 1,774 to level 5):

- **Level 2 as you finish Shelter.** The quest's steps and the boars you
  hunt for hides leave you short; building the fire and the quest reward
  (120 XP) take you over.
- **Level 3 as you finish Teeth in the Pines**, Haskel's wolf hunt. Ashford
  waits for it (and for level 3).
- **Level 4 by the time you reach the Hollow Priest**, deep in the crypt.

A test (`pacing` in `shared/test/valley.test.ts`) checks these against the
fewest and most kills each quest is likely to take.

## Shrines

Each of the nine gods has a shrine somewhere in the valley (from half a minute
to 9 minutes from where you wake), set where that god's domain shows: Solenne's faces the sunrise, Orren's stands at the
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

The clearing beside Haskel's caravan, west of where you wake, is where you
build your own campfire in the Shelter quest. Once it's built:

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

## First quest: Voices in the Distance

You wake on the stream bank with no memory, and hear voices somewhere to the
west. The tracker and map arrow just say "The voices" (you haven't met anyone
yet).

| Step | Task | Reward |
| --- | --- | --- |
| 1. Follow the voices | Walk west (about 170 m) until you find the caravan | 30 XP |
| 2. The peddler | Talk to the grey-bearded man by the cart | 30 XP |

Haskel tells you you're welcome to stay near the caravan, but there's no wood
to spare: you must build your own campfire. **Shelter** starts at once.

## Second quest: Shelter

From Haskel. About ten minutes for a new player. Gathering spots glint and are marked on
your map while you need them; the tracker (top left) shows the step and your
progress.

| Step | Task | Reward |
| --- | --- | --- |
| 1. Firewood | Gather 8 bundles of dry branches from the deadfall in the woods around the caravan (1.5 s each) | 40 XP |
| 2. A ring of stones | Collect 6 smooth stones from the stream banks (1.5 s each) | 50 XP |
| 3. Hides | Hunt boars in Tusk Meadow for 4 good hides (nearly a third of hides come out torn and useless) | 80 XP |
| 4. Make camp | Return to the clearing beside the caravan and build your campfire (4 s) | 120 XP |

Gathering and building are timed actions with a progress bar. Moving,
attacking or being hit interrupts them. Quest rewards aren't boosted by Well
Rested or background bonuses.

## Haskel the Peddler

A traveling merchant. A rockfall buried the pass road behind his cart, so he
pulled back to a sheltered clearing west of the stream to wait, with four
other stranded travellers; everyone is stuck in the valley until the kingdom
beyond digs the road out. He used to trade with **Ashford**, a farming
village on the old road east of the ford, and found it overrun by the dead.
Until your campfire is built he only talks about that. Then he sends you
after the wolves (*Teeth in the Pines*), and once that's done and you're
level 3, he asks you to find out what happened in Ashford.

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

- **Companions:** see *The stranded travellers* below.

A **❗** over his head means he has something for you; **❓** means you have
something to hand in.

### Odd jobs (repeatable)

He offers one at a time, at random: 3 wolf pelts, 4 raw hares, 3 boar hides,
3 spider silk, 5 old bones or 4 black thorns, for 8–16 coins and some
experience. Hand the items over in his window; a new job is offered after.

### The stranded travellers (companions)

Four travellers were caught on this side of the rockslide with Haskel and
wait around his camp, one of each calling. Talk to any of them (or open
Haskel's **Companions** tab) and ask **one** to adventure with you:

| Companion | Calling | Role | Special |
| --- | --- | --- | --- |
| Brannoc the Sellsword | Fighter | Protector: tough, steady damage | **Taunt** (every 6 s): creatures attacking you turn on him |
| Ilse the Hedge-Witch | Mage | Damage at range | **Fire Burst** (every 8 s): burns everything around her target |
| Sister Maren the Wandering Priest | Priest | Healer | **Mend** (every 3 s): heals you below 70% health, else cures a status |
| Wren the Pickpocket | Thief | Damage up close | **Backstab** (every 7 s): a hit for 2.5× damage |

- **One at a time.** You can travel with only one; part ways (in the same
  tab) to ask someone else. Each traveller goes with one player at a time, so
  in a shared world the others see "Travelling with <name>".
- They follow you, attack what you attack, defend you, scale with your level,
  and get back up 12 seconds after being downed. They show in your party
  frame.
- They go home if you leave the world, and the soldiers send them back down
  the road when you're arrested at the pass.

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

You start without one. The map only shows what you've explored (about 45 m
around wherever you've been), plus the camp and your god's shrine. Buy
Haskel's map to see the whole valley.

### Quest arrow and the quest diary

The quest you're **following** gets a gold marker on the map, and when it's
off the edge of the corner map, a gold arrow on the rim points the way. The
tracker shows where and how far ("Tusk Meadow · 240 m ↗", the arrow matching
the map's orientation). The arrow is deliberately general: a place, the
middle of a hunting ground, or the nearest pick-up you still need, never a
creature's exact position. For a delivery, it points at the creatures that
drop the item until you carry enough, then at whoever asked for it
(`questTarget` in `shared/src/questTargets.ts`).

The **quest diary** (`J`, 📜 on touch, or the button in the character panel)
lists:

- **In progress**: each quest's story so far (finished steps, in the words of
  what happened), the current step with progress, and a *Follow on the map*
  button. Clicking a quest in the tracker opens it here.
- **Finished** quests.
- **Rumours**: the gods' epic quests you've read about but haven't done.

You follow the story quest you're on unless you pick another; the choice is
remembered on this device.

## Third quest: Teeth in the Pines

From Haskel, once your campfire is built. He won't send a greenhorn to
Ashford: wolves from Greypine Wood have been at his mules.

| Step | Task | Reward |
| --- | --- | --- |
| 1. Thin the pack | Kill 8 grey wolves in Greypine Wood (levels 2–3) | 60 XP |
| 2. Greyjaw | Find the wolves' den at the south edge of Greypine Wood and kill Greyjaw, the old pack leader (level 2, named; comes back after a minute) | 80 XP |
| 3. Back to the caravan | Show Haskel the pelt | 170 XP + 220 XP, 15 coins |

Finishing it takes you to level 3.

## Fourth quest: The Silent Village

From Haskel, once you've done Teeth in the Pines and reached **level 3**.
About half an hour; the village's dead are level 2–3, the crypt's are 3–4,
and the Hollow Priest is a level 4 boss.

| Step | Task | Reward |
| --- | --- | --- |
| 1. The old west road | Cross the ford and find Ashford | 60 XP |
| 2. Put them to rest | Destroy 8 risen villagers or skeletons | 150 XP |
| 3. What happened here | Search the cart, the well and the headman's journal (2 s each) | 150 XP |
| 4. The gravedigger | Kill Old Corwin in the graveyard for the crypt key | 150 XP |
| 5. Under the chapel | Unlock the crypt (3 s) | 60 XP |
| 6. Into the dark | Go down into the crypt and reach the thorn chamber | 260 XP |
| 7. The Hollow Priest | Destroy it. Every 7 s it blasts everything within 4.5 m (and blights it); at half health it calls two skeletons | 150 XP |
| 8. Root and ash | Burn the heart of the black thorns (4 s) | 60 XP |
| 9. Report to Haskel | Climb out and talk to him | 150 XP, 25 coins, and your first **upper-body armour** for your calling |

### The crypt under the chapel

Once unlocked, the crypt door leads down (interact: *Go down into the
crypt*) to a small dungeon of its own:

```
  Stair hall ── Ossuary ──┐
  (way out)   2 skeletons │ (a risen in the passage)
                          │
            Burial hall ──┘ ── The Thorn Chamber
     2 risen, a level 4 skeleton,   the Hollow Priest,
     two sarcophagi                 the heart of the thorns
```

- Lit by torches and the purple glow of the thorns; the map shows the rooms
  while you're down there, and the quest arrow points through the door
  (down, or back up) when your goal is on the other side.
- The crypt's dead come back 90 seconds after they fall. The Hollow Priest
  doesn't; if someone else destroyed it before you, it's waiting again
  when you go down.
- Fall in the crypt and you wake by the camp fire above ground.
- The stairs in the stair hall take you back up into Ashford.

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
door stays open, and once the thorns are burned they stay burned.

## Dev commands

| Command | Effect |
| --- | --- |
| `/tp camp`, `/tp shrine_<god>`, `/tp tusk_meadow` (any zone id) | Teleport |
| `/tp vendor`, `/tp village`, `/tp crypt` | Teleport to Haskel, Ashford, the crypt |
| `/step [quest]` | Finish the current step of a quest (default: your first active one) |
| `/quest voices`, `/quest make_camp`, `/quest grey_pack`, `/quest silent_village` | Start (if needed) and finish a whole quest |
| `/tp wolf_den`, `/tp crypt_stairs`, `/tp crypt_thorns` | Teleport to Greyjaw's den, into the crypt, to the thorn chamber |
| `/coins <n>` | Set your coins |
| `/near <creature>` | Teleport next to the nearest creature of a kind (`skeleton`, `risen`, `wolf`…) |
