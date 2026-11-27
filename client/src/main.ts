import "./ui/styles.css";
import { GameClient } from "./game/GameClient.ts";
import { joinWorld, worldFromUrl, type GameRoom } from "./net.ts";
import { AssetLibrary } from "./scene/Assets.ts";
import { showCharacterCreate } from "./ui/CharacterCreate.ts";
import { h } from "./ui/dom.ts";

const viewport = document.getElementById("viewport")!;
const overlay = document.getElementById("overlay")!;
const ui = document.getElementById("ui")!;

function loading(text: string): void {
  ui.replaceChildren(h("div.screen.loading", null, h("div.loading-text", null, text)));
}

async function boot(): Promise<void> {
  const assets = new AssetLibrary();
  const assetsReady = assets.load();

  let error: string | undefined;
  let room: GameRoom | null = null;
  while (!room) {
    const offline = import.meta.env.MODE === "offline";
    const { options, world } = await showCharacterCreate(ui, error, offline ? null : { mode: worldFromUrl() ? "join" : "new", code: worldFromUrl() ?? "" }, assets);
    loading("Waking up…");
    try {
      await assetsReady;
      // The offline build runs the game rules in the page (single player); otherwise join the server.
      room = offline ? (await import("./local/LocalRoom.ts")).joinLocal(options) : await joinWorld(options, world ?? { mode: "new" });
      // Wait for the first full state so the world seed is known.
      await new Promise<void>((resolve) => {
        if (room!.state && room!.state.players?.has(room!.sessionId)) resolve();
        else room!.onStateChange.once(() => resolve());
      });
    } catch (err) {
      console.error(err);
      const msg = String((err as Error).message ?? err);
      error = /world|code|full/i.test(msg) ? msg : `Could not reach the game server. Is it running? (${msg})`;
      room = null;
    }
  }

  ui.replaceChildren();
  new GameClient(room, assets, viewport, overlay, ui);
}

void boot();
