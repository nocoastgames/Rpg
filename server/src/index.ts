/**
 * Game server entry point.
 *  - Colyseus handles matchmaking + WebSocket rooms.
 *  - In production the same HTTP server also serves the built client (client/dist),
 *    so a single process/port is enough to deploy.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT, normalizeWorldCode } from "@rpg/shared";
import { ForestRoom } from "./rooms/ForestRoom.ts";
import { lookupWorld } from "./worlds.ts";

const port = Number(process.env.PORT ?? SERVER_PORT);
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
    // Find a world by its share code (the client then joins that room by id).
    app.get("/api/worlds/:code", (req, res) => {
      const code = normalizeWorldCode(String(req.params.code ?? ""));
      const roomId = code ? lookupWorld(code) : undefined;
      if (!roomId) {
        res.status(404).json({ error: "No open world has that code." });
        return;
      }
      res.json({ code, roomId });
    });
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));
      console.log(`[server] serving client build from ${clientDist}`);
    }
  },
});

server.define(ROOM_NAME, ForestRoom);

await server.listen(port);
console.log(`[server] listening on http://localhost:${port} (room "${ROOM_NAME}")`);
