import { defineConfig } from "vite";

/**
 * `vite build` makes the multiplayer client (served by the game server).
 * `vite build --mode offline` makes a single-player build into dist-offline/
 * with relative paths, which runs the game rules in the page and can be
 * hosted as static files anywhere.
 */
export default defineConfig(({ mode }) => ({
  base: mode === "offline" ? "./" : "/",
  plugins: [
    {
      name: "offline-title",
      transformIndexHtml: (html: string) => (mode === "offline" ? html.replace("<title>The Returned</title>", "<title>The Returned: Playtest</title>") : html),
    },
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    outDir: mode === "offline" ? "dist-offline" : "dist",
    // One script file for the offline build, so it can be hosted as a couple of static files.
    rollupOptions: mode === "offline" ? { output: { inlineDynamicImports: true } } : undefined,
  },
}));
