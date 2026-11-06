import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export const cursorMarkup = '<span class="cicada-pointer" aria-hidden="true"></span>';

export async function writeCursorAssets({ root, out }) {
  const svg = await readFile(join(root, "src", "assets", "cicada-cursor.svg"));
  await writeFile(join(out, "assets", "cicada-cursor.svg"), svg);
  await sharp(svg).png().toFile(join(out, "assets", "cicada-cursor.png"));
}
