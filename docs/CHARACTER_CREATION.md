# Character creation

Six steps, playable with mouse, controller (D-pad/stick to move, A to select,
LB/RB to change step, Menu to wake up) or touch. A rotating 3D preview shows the
character as you build it.

| Step | What you choose |
| --- | --- |
| 1. Appearance | Name, build (slight/average/broad), skin tone, hair style and colour, beard, and the dye of your ragged clothes |
| 2. Calling | One of the four base classes (Fighter, Mage, Priest, Thief) with a preview of the whole class tree |
| 3. First memory | One half-remembered image. This secretly picks your **background** |
| 4. Faith | The god a prayer on your lips still calls to (flavour only) |
| 5. Attributes | Point-buy: 10 points, raise a stat by up to +5, lower stats by up to 2 in total to get points back. Live preview of health, resource, damage and crit |
| 6. Wake up | Review and start |

Everyone starts in the same ragged clothes. Equipment that shows on the
character will come later; for now only the weapon in hand is visible.

## Backgrounds (hidden)

Your first memory decides who you were, but the game doesn't tell you. The
background applies from the start:

- +3 to stats
- a keepsake in your pack (a clue)
- a modest passive

Memories return at **levels 3, 8 and 15**. The last one names your background
and explains the passive. Everything recovered is kept under **Past** in the
character panel.

| First memory | Background | Stats | Keepsake | Passive |
| --- | --- | --- | --- | --- |
| The weight of a shield on your arm… | Soldier | +2 Vit, +1 Mig | Worn Whetstone | +5% armour |
| Warm bread, turned earth… | Farmhand | +2 Vit, +1 Spi | Stale Bread | Food heals 50% more |
| Cold mornings checking snares… | Trapper | +2 Agi, +1 Mig | Wire Snare | +10% damage to beasts |
| Ink on your fingers… | Scholar | +2 Int, +1 Spi | Torn Journal | +10% experience |
| Incense, cold flagstones… | Acolyte | +2 Spi, +1 Int | Prayer Beads | +10% healing received |
| Rooftops, alleyways… | Street Urchin | +2 Agi, +1 Int | Bent Lockpick | +5% movement speed |
| The ring of a hammer on hot iron… | Smith | +2 Mig, +1 Vit | Hammer Charm | Weapons deal +1 damage |
| Salt spray, creaking timbers… | Sailor | +1 Mig, +1 Agi, +1 Vit | Coil of Rope | Wading slows you half as much |
| A face on a wanted poster… | Outlaw | +2 Agi, +1 Mig | Wanted Poster | +3% crit chance |
| Silk sheets, a long table… | Noble | +1 Int, +1 Spi, +1 Vit | Signet Ring | +10% maximum resource |

## Faiths (flavour)

No class restrictions and no mechanical effect yet; shrines, prayers and story
come later.

| Faith | Domain | Leaning |
| --- | --- | --- |
| Solenne, the Dawn Mother | Light, mercy and healing | Good |
| Valdris, the Oathshield | Law, duty and protection | Good |
| The Green Mother | Nature, growth and renewal | Good |
| Orren, Keeper of Roads | Travel, luck and trade | Neutral |
| Mirevel of the Hidden Ledger | Knowledge and secrets | Neutral |
| The Grey Ferryman | Death and balance | Neutral |
| Kaelthar, the Hunger | Blood, war and conquest | Evil |
| The Veiled One | Shadow, deceit and poison | Evil |
| The Rot Below | Decay, plague and thorns | Evil |
| Faithless | No god | None |

All of this is data in `shared/src/character.ts` and validated on the server
(`validateCreation`).
