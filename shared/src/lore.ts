/**
 * Valley lore: places that tell the valley's story to anyone who stops to
 * look. Each is a landmark you read (interact); the first read is worth a
 * little experience, it goes into the Lore section of your quest diary, and
 * it tells of one god's epic quest.
 *
 * Act I lore only plants seeds (see docs/WORLD.md): everything reads as
 * folk tale, soldier's grumbling or a hermit's ramblings. Nothing here says
 * "machine" out loud.
 */

export type LoreSiteKind =
  | "drowned_mill"
  | "watchtower"
  | "standing_stones"
  | "barrow"
  | "hermit_hut"
  | "blackened_field"
  | "waystone"
  | "giant_ribs"
  | "glass_hollow";

export interface LoreSite {
  id: string;
  /** Structure drawn there. */
  kind: LoreSiteKind;
  name: string;
  /** Where (valley u/v; the mill is placed beside the stream by the world). */
  u: number;
  v: number;
  rotation: number;
  /** Prompt, e.g. "Read the ledger". */
  verb: string;
  /** What you read. */
  title: string;
  text: readonly string[];
  /** The god whose epic quest this tells of. */
  reveals: string;
  /** Solid core for collisions (m). */
  radius: number;
}

/** Experience for reading a lore site the first time. */
export const LORE_XP = 25;

/** The quest-log flag recorded once you've read a lore site. */
export function loreReadFlag(id: string): string {
  return `lore_${id}`;
}

export const LORE_SITES: readonly LoreSite[] = [
  {
    id: "drowned_mill",
    kind: "drowned_mill",
    name: "The Drowned Mill",
    u: 0, // set beside the stream (see loreSitePosition)
    v: 1100,
    // Front (+z) faces away from the stream, east; the wheel turns in the water behind.
    rotation: 2.356,
    verb: "Read the miller's ledger",
    title: "The Miller's Ledger",
    text: [
      "A ledger in a tin box, wedged high in the rafters where the water never reached. Most of it is sacks of barley and who owes what.",
      "The last pages are different. \"Spring. The stream ran black for three days. The eels died, then the frogs. The wheel turned on its own in the night with no water on it. Took the family to my sister's in Ashford.\"",
      "Tucked into the back cover, in a different hand: a list of names and dates going back two hundred years, each with a tick beside it. Someone has been keeping count of something. The heading just says: THE HIDDEN LEDGER. MIREVEL KEEPS WHAT WE FORGET.",
    ],
    reveals: "mirevel",
    radius: 2.6,
  },
  {
    id: "watchtower",
    kind: "watchtower",
    name: "The Old Watchtower",
    u: 520,
    v: 300,
    rotation: 0.5,
    verb: "Read the carving",
    title: "Carved by the Watchtower Door",
    text: [
      "Words cut into the doorframe with a knife, over and over, by bored men on long nights.",
      "\"Ordered to hold the road and let NOTHING out. Not to ask why. Third winter.\" — \"Valdris keeps the oath. So do we.\" — \"Sergeant Ossery, the King's Watch. If you read this, the relief never came.\"",
      "Below, newer and shakier: \"They brought the oath-stone down from the pass and set it at the gate. The Oathshield's own seal. Swear on it and you cannot leave. I did not swear.\"",
    ],
    reveals: "valdris",
    radius: 2.4,
  },
  {
    id: "standing_stones",
    kind: "standing_stones",
    name: "The Eight Stones",
    u: -560,
    v: 560,
    rotation: 0.2,
    verb: "Touch the stones",
    title: "The Eight Stones",
    text: [
      "Eight grey stones in a perfect ring, each cut square. Lichen covers the outsides. The inside faces are smooth as river ice, as if no weather has ever touched them.",
      "Shepherds' rags are tied to the stones, and little offerings of seed. A child's verse is scratched at the foot of one: \"Green Mother, green and deep, wake the seed and rock the sleep.\"",
      "When you lay your palm flat against the stone it is warm, and very faintly, it hums.",
    ],
    reveals: "green_mother",
    radius: 0,
  },
  {
    id: "barrow",
    kind: "barrow",
    name: "The Barrow of the River's Dead",
    u: -300,
    v: 1500,
    rotation: -0.4,
    verb: "Read the barrow stone",
    title: "The Barrow Stone",
    text: [
      "A long green mound with a stone door, sealed with clay and old coins. The door stone is carved:",
      "\"HERE LIE THOSE THE RIVER GAVE BACK. FERRYMAN, KEEP THEM.\"",
      "The carving is crisp. The mound is ancient, and the door stone is not. Someone has been burying people here, people who came out of the river, for a very long time.",
    ],
    reveals: "ferryman",
    radius: 3.2,
  },
  {
    id: "hermit_hut",
    kind: "hermit_hut",
    name: "The Hermit's Hut",
    u: -150,
    v: -1150,
    rotation: 2.4,
    verb: "Read the hermit's journal",
    title: "The Hermit's Journal",
    text: [
      "The hut has been empty a season at least. On the table, under a mug gone green: a journal.",
      "\"They come out of the stream sometimes. Pale, coughing, remembering nothing. I give them soup and a blanket and point them at the road. None ever come back to say thank you.\"",
      "\"Solenne's Long Dawn, the priests call it, when the sick rise up whole. These are not sick. They are new. Their hands have no calluses.\"",
      "The last entry: \"Today's one had my brother's face. He's been dead nine years. He didn't know me.\"",
    ],
    reveals: "solenne",
    radius: 2.4,
  },
  {
    id: "blackened_field",
    kind: "blackened_field",
    name: "The Blackened Field",
    u: -560,
    v: -900,
    rotation: 0,
    verb: "Read the warning",
    title: "A Warning on a Stake",
    text: [
      "A field where nothing grows. The earth is black and glassy, and the stubs of thorns push up through it like broken teeth. A board is nailed to a stake at the edge:",
      "\"DON'T PLOUGH HERE. Pa ploughed it. The thorns came up the next morning, right through his boots. They go DOWN, the priest says, deeper than any root. Down to the Rot Below.\"",
      "Something has scratched the board from the field side, many times.",
    ],
    reveals: "rot_below",
    radius: 0,
  },
  {
    id: "waystone",
    kind: "waystone",
    name: "The Broken Waystone",
    u: 495,
    v: 435,
    rotation: 0.9,
    verb: "Read the waystone",
    title: "The Waystone",
    text: [
      "A milestone snapped in half and propped back up. The distances are still legible:",
      "\"ASHFORD 2 · KING'S BRIDGE 31 · VALDRISGATE 58 · THE SEA 140.\" — A whole kingdom out there, on the other side of the mountains.",
      "A traveller's charm hangs from it, a little bronze key. On the back, a prayer: \"Orren, keeper of roads, you know where every road goes, even the ones under the ground. Bring me home.\"",
    ],
    reveals: "orren",
    radius: 0.7,
  },
  {
    id: "giant_ribs",
    kind: "giant_ribs",
    name: "The Giant's Ribs",
    u: 1250,
    v: 1100,
    rotation: -0.3,
    verb: "Knock on a rib",
    title: "The Giant's Ribs",
    text: [
      "Huge pale ribs arch out of the hillside, taller than a house, each as straight as a ruler. Children dare each other to touch them.",
      "They are cold even in the sun, and when you knock on one it rings like a struck bell, long and low.",
      "Someone has painted a red hand on the biggest rib, and under it: \"KAELTHAR'S BEAST. IT FELL IN THE OLD WAR, AND IT WILL RISE IN THE NEXT. PAY THE RED TITHE.\"",
    ],
    reveals: "kaelthar",
    radius: 0,
  },
  {
    id: "glass_hollow",
    kind: "glass_hollow",
    name: "The Glass Hollow",
    u: 900,
    v: -1200,
    rotation: 0,
    verb: "Look into the hollow",
    title: "The Glass Hollow",
    text: [
      "A round dip in the forest floor, its bottom fused into green glass. Nothing grows within a stone's throw.",
      "Haskel's people tell it like this: in my grandfather's time a star fell here, and before it fell it stopped in the sky and looked down at the valley for a whole night.",
      "\"The stars that move are the Veiled One's eyes,\" the saying goes. \"Don't wave.\" A cracked little mirror lies face down in the glass, as if someone threw it there.",
    ],
    reveals: "veiled_one",
    radius: 0,
  },
];
