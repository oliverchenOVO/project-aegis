import { build } from "esbuild";
await build({
  entryPoints: [
    "apps/desktop/electron/main.ts",
    "apps/desktop/electron/preload.ts",
  ],
  outdir: "apps/desktop/dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
});
