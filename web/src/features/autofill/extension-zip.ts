import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";

/**
 * The autofill extension as a zip, with this app's address written into it (ADR 0005),
 * so each self-hosted instance hands out an extension that talks only to itself.
 */
export async function extensionZip(appOrigin: string): Promise<Uint8Array | null> {
  const dist = join(process.cwd(), "extension", "dist");
  let names: string[];
  try {
    names = await readdir(dist);
  } catch {
    return null;
  }
  const files: Record<string, Uint8Array> = {};
  for (const name of names) {
    const text = await readFile(join(dist, name), "utf8");
    files[`job-search-autofill/${name}`] = strToU8(text.replaceAll("__APP_ORIGIN__", appOrigin));
  }
  return zipSync(files);
}
