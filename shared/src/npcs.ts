/** People in the world. For now: Haskel, the peddler stranded by the rockslide. */

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
  intro: [
    "\"Easy there, friend. Haskel. I bring salt, needles and news over the pass twice a year.\"",
    "\"Not this year. Half the mountain came down behind my cart. The road's buried, and we're stuck in this valley until the kingdom's men dig it out.\"",
    "\"And worse. Ashford, the village down the old west road: I've traded there twenty years. I went first thing. It's full of the dead. Walking dead, friend.\"",
  ],
  ask: "\"Would you go and find out what happened there? I'm too old for it. I'll make it worth your while.\"",
  during: "\"Ashford's a short walk down the old west road, toward the ford. Mind yourself.\"",
  after: "\"The road's open, thanks to you. I'll be on my way soon enough. Still buying, still selling.\"",
  noWeapon: "\"No weapon? Out here? Take this. It's not much, but it's better than your fists.\"",
};

/** Flag in the quest log once you own a map of the valley. */
export const MAP_FLAG = "map_valley";

/** How close to Haskel you must be to trade or talk with his camp (the adventurers stand around him). */
export const TRADE_RANGE = 14;
