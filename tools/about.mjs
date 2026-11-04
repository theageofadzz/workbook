import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseFragment, serialize } from "parse5";

export async function writeAboutPage({ root, out, base, browserTitle, faviconSrc }) {
  const css = await readFile(join(root, "src", "about.css"), "utf8");
  const js = await readFile(join(root, "src", "about.js"), "utf8");
  const version = value => createHash("sha256").update(value).digest("hex").slice(0, 8);
  const replacements = {
    base,
    browserTitle,
    favicon: faviconSrc,
    portraitVersion: version(await readFile(join(root, "src", "assets", "about-portrait.webp"))),
    cssVersion: version(css),
    jsVersion: version(js)
  };
  let html = await readFile(join(root, "src", "content", "about.html"), "utf8");
  for (const name of new Set([...html.matchAll(/\{\{icon:([\w-]+)\}\}/g)].map(match => match[1]))) {
    const document = parseFragment(await readFile(join(root, "node_modules", "lucide-static", "icons", `${name}.svg`), "utf8"));
    const icon = document.childNodes.find(node => node.tagName === "svg");
    icon.attrs.push({ name: "aria-hidden", value: "true" }, { name: "focusable", value: "false" });
    html = html.replaceAll(`{{icon:${name}}}`, serialize({ nodeName: "#document-fragment", childNodes: [icon] }));
  }
  for (const [name, value] of Object.entries(replacements)) html = html.replaceAll(`{{${name}}}`, value);
  await mkdir(join(out, "about"), { recursive: true });
  await writeFile(join(out, "about", "index.html"), html);
  await writeFile(join(out, "about.css"), css);
  await writeFile(join(out, "about.js"), js);
  for (const file of ["about-inter.woff2", "about-grid.webp", "about-portrait.webp"]) {
    await copyFile(join(root, "src", "assets", file), join(out, "assets", file));
  }
  await copyFile(
    join(root, "node_modules", "lucide-static", "LICENSE"),
    join(out, "assets", "about-icons-LICENSE.txt")
  );
}
