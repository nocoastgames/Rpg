/** People in the world. For now: Haskel, the peddler stranded by the rockslide, camped west of the stream. */

export interface ShopEntry {
  item: string;
  /** How many you get for the price. */
  qty: number;
  price: number;
}

export interface NpcDef {
  /** Landmark id where they stand. */
  id: string;
  name: string;
  title: string;
  shop: readonly ShopEntry[];
}

export const VENDOR_NPC: NpcDef = {
  id: "vendor",
  name: "Haskel",
  title: "Traveling Peddler",
  shop: [
    { item: "trail_ration", qty: 1, price: 3 },
    { item: "healing_draught", qty: 1, price: 25 },
    { item: "throwing_knife", qty: 5, price: 8 },
    { item: "arrows", qty: 20, price: 4 },
    { item: "valley_map", qty: 1, price: 12 },
    { item: "book_bestiary", qty: 1, price: 10 },
    { item: "book_hymns", qty: 1, price: 10 },
  ],
};

/** What Haskel says, depending on where you are in his story. */
export const VENDOR_LINES = {
  /** While you're building your campfire. */
  welcome: [
    "\"Haskel. I bring salt, needles and news over the pass twice a year. These four are stuck here with me.\"",
    "\"Stay near the caravan, friend, you're welcome to. But wood's dear and we've none to spare: build your own campfire, in the clearing just beside us.\"",
    "\"Dry branches from the woods round about. Stones from the stream to ring it. And hides for a lean-to: the boars in the meadow across the ford have plenty.\"",
  ],
  intro: [
    "\"That's a proper fire. You'll do.\"",
    "\"Here's how things stand. Half the mountain came down on the pass road behind my cart. It's buried, and we're stuck in this valley until the kingdom's men dig it out. I pulled back here to wait.\"",
    "\"And worse. Ashford, the village on the old road east of the ford: I've traded there twenty years. I went first thing. It's full of the dead. Walking dead, friend.\"",
  ],
  /** Once the wolves are dealt with. */
  ready: "\"That's the old grey's hide, right enough. You'll do.\"",
  /** Before Ashford: he wants to see you can handle yourself. */
  wolves: [
    "\"But you're green, friend, and Ashford would eat you alive. Prove me wrong first.\"",
    "\"Wolves out of Greypine Wood have been at my mules every night, and there's an old grey brute leading them. Thin the pack and bring me that one's hide.\"",
  ],
  wolvesDuring: "\"Greypine's north of here, the dark woods. The old grey one dens somewhere at its southern edge. Bring me his hide.\"",
  notYet: "\"You did well with the wolves. Get a little more seasoning first; Ashford's no place to learn.\"",
  ask: "\"Would you go and find out what happened in Ashford? I'm too old for it. I'll make it worth your while.\"",
  during: "\"Ashford's across the ford and east along the old road. Mind yourself.\"",
  after: "\"The road's open, thanks to you. I'll be on my way soon enough. Still buying, still selling.\"",
  noWeapon: "\"No weapon? Out here? Take this. It's not much, but it's better than your fists.\"",
};

/** Flag in the quest log once you own a map of the valley. */
export const MAP_FLAG = "map_valley";

/** How close to Haskel you must be to trade or talk with his camp (the adventurers stand around him). */
export const TRADE_RANGE = 14;
