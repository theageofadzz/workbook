import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const cursorMarkup = '<span class="cicada-pointer" aria-hidden="true"></span>';

export async function writeCursorAssets({ root, out }) {
  const svg = await readFile(join(root, "src", "assets", "cicada-cursor.svg"));
  await writeFile(join(out, "assets", "cicada-cursor.svg"), svg);
  await rm(join(out, "assets", "cicada-cursor.png"), { force: true });
}
