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

## Faiths and blessings

Faith never restricts your class. Each god (except for the Faithless) grants
a **minor but noticeable blessing**. Every calling starts neutral, and
alignment comes from your path (for example Knight and Paladin are good;
Marauder, Dark Knight and Lich are evil; Archmage is neutral), so a
blessing can change when you advance.

| Your path vs. your god | Blessing |
| --- | --- |
| Same (good/good, neutral/neutral, evil/evil) | Automatic |
| One step apart (good/neutral or neutral/evil) | Earned by completing the god's **epic quest** |
| Opposite (good/evil) | Never from your own god, but a **neutral** god's epic quest (*The Endless Road*, *The Unwritten Page* or *The Far Shore*) earns that neutral god's blessing instead |

So no one is left out: a neutral Archmage of Solenne can win the Dawn
Mother's favour through *The Long Dawn*; a Lich of Solenne never can, but
can earn Orren's, Mirevel's or the Ferryman's blessing as a patron. You
only ever have one blessing: your own god's when it applies, otherwise the
first neutral patron you earned. Favour, once won, is kept and applies
again whenever the path makes it possible. You are told when a blessing turns on or off, and the Past
section of the character panel shows its status and what to do.

| Faith | Domain | Leaning | Blessing | Epic quest |
| --- | --- | --- | --- | --- |
| Solenne, the Dawn Mother | Light, mercy and healing | Good | +8% healing received | The Long Dawn |
| Valdris, the Oathshield | Law, duty and protection | Good | +4% armour | The Unbroken Oath |
| The Green Mother | Nature, growth and renewal | Good | Natural health regeneration 60% faster | Roots of the World |
| Orren, Keeper of Roads | Travel, luck and trade | Neutral | +4% movement speed | The Endless Road |
| Mirevel of the Hidden Ledger | Knowledge and secrets | Neutral | +8% maximum resource | The Unwritten Page |
| The Grey Ferryman | Death and balance | Neutral | Return from death 2 seconds sooner | The Far Shore |
| Kaelthar, the Hunger | Blood, war and conquest | Evil | Heal for 3% of the damage you deal | The Red Tithe |
| The Veiled One | Shadow, deceit and poison | Evil | +3% critical hit chance | Behind the Veil |
| The Rot Below | Decay, plague and thorns | Evil | +6% damage with area abilities | The Deep Rot |
| Faithless | No god | None | None | — |

The epic quests themselves aren't built yet; their ids (`favor_<faith>`)
already gate the blessing. In dev mode `/quest favor` completes your own
god's quest and `/quest favor_orren` (etc.) any other.

Blessings stack with your background's passive. All of this is data in
`shared/src/character.ts` and validated on the server (`validateCreation`).
