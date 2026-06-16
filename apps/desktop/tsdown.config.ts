import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: { main: "src/main.ts" },
    format: "cjs",
    outDir: "dist",
    external: ["electron"],
    platform: "node",
    clean: true,
  },
  {
    entry: { preload: "src/preload.ts" },
    format: "cjs",
    outDir: "dist",
    external: ["electron"],
    platform: "node",
  },
  {
    entry: { server: "../server/src/index.ts" },
    format: "cjs",
    outDir: "dist",
    external: ["electron"],
    platform: "node",
    noExternal: [/.*/],
  },
]);
