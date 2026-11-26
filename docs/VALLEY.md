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
| Tusk Meadow | 1–2 | Tusked boars | none | East bank, across the ford |
| Greypine Wood | 2–3 | Grey wolves | Bleeding (20% of hits): 3 damage a second for 5 s | North, around the waterfall pool |
| Webbed Hollow | 3–4 | Hollow spiders | Poisoned (35%): 2 damage a second for 8 s | South, toward the gorge |
| The Thornbrake | 4–5 | Thornlings | Blighted (25%): you deal 25% less damage for 10 s | North-west, in front of the cave |

- Each zone keeps a set population (8, 7, 7, 7). A creature killed returns to
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
  is and whether its epic quest would make that god your god.
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

## Dev commands

| Command | Effect |
| --- | --- |
| `/tp camp`, `/tp shrine_<god>`, `/tp tusk_meadow` (any zone id) | Teleport |
| `/step` | Finish the current quest step |
| `/quest make_camp` | Finish the whole first quest (builds the camp) |
