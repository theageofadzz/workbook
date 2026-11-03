import { readFile, access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "parse5";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..", "docs");
const manifest = JSON.parse(await readFile(join(root, "site-manifest.json"), "utf8"));
let checked = 0;
const missing = new Set();
for (const page of manifest.pages) {
  const html = await readFile(join(root, page.file), "utf8");
  const document = parse(html);
  const urls = [];
  function visit(node) {
    for (const attr of node.attrs || []) {
      if (["src", "href", "poster"].includes(attr.name) && attr.value.startsWith(`${manifest.basePath}/`)) urls.push(attr.value);
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.tagName === "script" && node.attrs?.some(attr => attr.name === "id" && attr.value === "__NEXT_DATA__")) {
      const data = JSON.parse(node.childNodes.map(child => child.value || "").join(""));
      for (const item of data.props?.pageProps?.dataSource || []) {
        for (const key of ["imageUrl", "posterUrl", "videoUrl"]) {
          if (item[key]?.startsWith(`${manifest.basePath}/`)) urls.push(item[key]);
        }
      }
    }
  }
  visit(document);
  for (const url of urls) {
    let path = decodeURIComponent(url.split(/[?#]/)[0].slice(manifest.basePath.length));
    if (!path.split("/").pop().includes(".")) path = `${path.replace(/\/$/, "")}/index.html`;
    try { await access(join(root, path)); } catch { missing.add(`${page.route}: ${url}`); }
  }
  assert(!html.includes('src="/abc/'), `Old script path in ${page.route}`);
  assert(!html.includes('href="/abc/'), `Old link path in ${page.route}`);
  checked++;
}
assert.equal(missing.size, 0, `Missing local resources:\n${[...missing].join("\n")}`);
assert(checked >= 30, "Expected all article pages and the crafts page");
await access(join(root, ".nojekyll"));
await access(join(root, "about", "index.html"));
console.log(`Validated ${checked} pages, their local links and assets, and the GitHub Pages configuration.`);
