// Bundles the autofill extension into extension/dist. The app's address is filled in when
// the zip is downloaded (see /autofill/extension.zip), so one build serves any instance.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
await mkdir(out, { recursive: true });
await build({
  entryPoints: {
    background: join(here, "src/background.ts"),
    bridge: join(here, "src/bridge.ts"),
    filler: join(here, "src/filler.ts"),
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome120",
  alias: { "@": join(here, "../src") },
  logLevel: "warning",
});
await copyFile(join(here, "manifest.json"), join(out, "manifest.json"));
console.log("extension built");
