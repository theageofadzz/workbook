import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";

export async function buildCells(root) {
  const icons = {};
  for (const name of ["volume-2", "volume-x", "maximize", "minimize", "pause", "play", "rotate-ccw", "plus", "minus"]) {
    icons[name] = await readFile(join(root, "node_modules", "lucide-static", "icons", `${name}.svg`), "utf8");
  }
  const result = await build({
    entryPoints: [join(root, "src", "cells", "main.js")],
    bundle: true, minify: true, format: "iife", write: false,
    target: "es2020", legalComments: "inline",
    define: { CELLS_ICONS: JSON.stringify(icons) }
  });
  const template = await readFile(join(root, "src", "cells", "template.html"), "utf8");
  const license = await readFile(join(root, "node_modules", "lucide-static", "LICENSE"), "utf8");
  const js = `/* ${license.replaceAll("*/", "* /")} */\n${result.outputFiles[0].text}`
    .replaceAll("</script", "<\\/script").replace(/[ \t]+$/gm, "");
  const html = template.replace("/* APP_SCRIPT */", js);
  await writeFile(join(root, "src", "cells", "index.html"), html);
  return createHash("sha256").update(html).digest("hex").slice(0, 8);
}
