import { readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parse, serialize } from "parse5";
import { parse as parseJavaScript } from "acorn";

export const excludedRoutes = [
  "/crafts",
  "/generative",
  "/carousel",
  "/circular-text",
  "/trail",
  "/scroll-mock",
  "/conic-gradient"
];
const excludedSlugs = new Set(excludedRoutes.map(route => route.slice(1)));

export function isExcludedRoute(route) {
  return excludedSlugs.has(route.replace(/^\/+/, "").split(/[/?#]/)[0]);
}

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function walk(node, visit) {
  if (visit(node) === false) return;
  for (const child of [...node.childNodes || []]) walk(child, visit);
}
function walkJavaScript(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type && visit(node) === false) return;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walkJavaScript(child, visit));
    else if (value && typeof value === "object") walkJavaScript(value, visit);
  }
}
function removeNode(node) {
  const siblings = node.parentNode?.childNodes;
  const index = siblings?.indexOf(node) ?? -1;
  if (index >= 0) siblings.splice(index, 1);
}

// Remove complete cover components and route registrations, including archived chunks.
function pruneJavaScript(source, collectRemoved) {
  const original = source;
  const edits = [];
  walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
    if (node.type === "ArrayExpression") {
      const keep = node.elements.filter(element => {
        if (element?.type === "Literal") return !(typeof element.value === "string" && element.value.startsWith("/") && isExcludedRoute(element.value));
        const slug = element?.properties?.find(property => property.key?.name === "slug");
        return !excludedSlugs.has(slug?.value.value);
      });
      if (keep.length !== node.elements.length) {
        for (const element of node.elements) {
          if (element && !keep.includes(element)) collectRemoved(source.slice(element.start, element.end));
        }
        edits.push({ start: node.start, end: node.end, value: `[${keep.map(element => element ? source.slice(element.start, element.end) : "").join(",")}]` });
        return false;
      }
    }
    if (node.type === "ObjectExpression") {
      const keep = node.properties.filter(property => {
        const key = property.key?.value;
        return !(typeof key === "string" && key.startsWith("/") && isExcludedRoute(key));
      });
      if (keep.length !== node.properties.length) {
        edits.push({ start: node.start, end: node.end, value: `{${keep.map(property => source.slice(property.start, property.end)).join(",")}}` });
        return false;
      }
    }
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  }
  source = source.replaceAll('link:"/crafts"', 'link:"/about/#works-title"');
  return source === original ? source : pruneJavaScript(source, collectRemoved);
}

function pruneContentCode(source, base) {
  if (!excludedRoutes.some(route => source.includes(`${base}${route}`))) return source;
  const edits = [];
  walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest", allowReturnOutsideFunction: true }), node => {
    if (node.type !== "Property" || (node.key?.name || node.key?.value) !== "href") return;
    const href = node.value?.value;
    if (typeof href === "string" && href.startsWith(`${base}/`) && isExcludedRoute(href.slice(base.length))) {
      edits.push(node.value);
    }
  });
  for (const node of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, node.start) + "void 0" + source.slice(node.end);
  }
  return source;
}

function prunePageData(data, base) {
  const content = data.pageProps?.content || data.props?.pageProps?.content;
  if (!content?.code) return false;
  const code = pruneContentCode(content.code, base);
  if (code === content.code) return false;
  content.code = code;
  return true;
}

function pruneDocument(source, base) {
  const document = parse(source);
  walk(document, node => {
    if (node.tagName === "script" && attr(node, "id") === "__NEXT_DATA__") {
      const data = JSON.parse(node.childNodes.map(child => child.value || "").join(""));
      if (prunePageData(data, base)) node.childNodes[0].value = JSON.stringify(data).replaceAll("<", "\\u003c");
    }
    if (node.tagName !== "a") return;
    const href = attr(node, "href");
    if (!href?.startsWith(`${base}/`) || !isExcludedRoute(href.slice(base.length))) return;
    let card = node.parentNode;
    while (card && attr(card, "class") !== "mb-12") card = card.parentNode;
    if (card) {
      removeNode(card);
      return false;
    }
    if (href.replace(/\/$/, "") === `${base}/crafts`) {
      node.attrs.find(item => item.name === "href").value = `${base}/about/#works-title`;
    } else {
      node.attrs = node.attrs.filter(item => item.name !== "href");
    }
  });
  return serialize(document);
}

export async function pruneExcludedContent({ out, base, url, retiredContent = [] }) {
  const manifestPath = join(out, "site-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assetCandidates = new Set();
  const collectAssets = source => {
    const prefix = `${base}/`;
    for (const match of source.matchAll(/(?:\/[^/\s"'<>`\\()]+)+\.(?:png|jpe?g|webp|gif|svg|js|css|woff2?)(?:\?[^"'<>\\\s]*)?/g)) {
      if (!match[0].startsWith(prefix)) continue;
      const path = match[0].slice(prefix.length).split(/[?#]/)[0];
      if (/^(?:media|crafts)\//.test(path)) assetCandidates.add(path);
    }
  };
  for (const source of retiredContent) collectAssets(source);
  for (const page of manifest.pages.filter(page => isExcludedRoute(page.route))) {
    collectAssets(await readFile(join(out, page.file), "utf8"));
  }
  manifest.pages = manifest.pages.filter(page => !isExcludedRoute(page.route));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  for (const route of excludedRoutes) {
    await rm(join(out, route.slice(1)), { recursive: true, force: true });
  }
  const dataRoot = join(out, "_next", "data");
  for (const build of await readdir(dataRoot)) {
    for (const slug of excludedSlugs) await rm(join(dataRoot, build, `${slug}.json`), { force: true });
    for (const file of await readdir(join(dataRoot, build))) {
      if (!file.endsWith(".json")) continue;
      const path = join(dataRoot, build, file);
      const data = JSON.parse(await readFile(path, "utf8"));
      if (prunePageData(data, base)) await writeFile(path, JSON.stringify(data));
    }
  }

  const staticRoot = join(out, "_next", "static");
  const galleryChunks = new Set();
  for (const file of await readdir(staticRoot)) {
    if (file === "chunks") continue;
    const path = join(staticRoot, file, "_buildManifest.js");
    let source;
    try { source = await readFile(path, "utf8"); } catch { continue; }
    walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
      if (node.type !== "ObjectExpression") return;
      const registry = node.properties.filter(property => String(property.key?.value || "").startsWith("/"));
      if (!registry.some(property => isExcludedRoute(property.key.value))) return;
      const retained = new Set();
      const removed = new Set();
      for (const property of registry) {
        walkJavaScript(property.value, value => {
          if (value.type === "Literal" && typeof value.value === "string" && value.value.startsWith("static/chunks/")) {
            (isExcludedRoute(property.key.value) ? removed : retained).add(value.value);
          }
        });
      }
      for (const chunk of removed) if (!retained.has(chunk)) galleryChunks.add(chunk);
    });
  }
  for (const chunk of galleryChunks) await rm(join(out, "_next", chunk), { force: true });

  let changedChunks = 0;
  for (const file of await readdir(staticRoot, { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    const path = join(staticRoot, file);
    const source = await readFile(path, "utf8");
    const pruned = pruneJavaScript(source, collectAssets);
    if (pruned !== source) {
      await writeFile(path, pruned);
      changedChunks++;
    }
  }
  for (const page of [...manifest.pages, { file: "about/index.html" }]) {
    const path = join(out, page.file);
    const source = await readFile(path, "utf8");
    await writeFile(path, pruneDocument(source, base));
  }
  await writeFile(join(out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...manifest.pages.map(page => page.route), "/about"].map(route => `<url><loc>${url}${route === "/" ? "/" : `${route}/`}</loc></url>`).join("")}</urlset>`
  );

  const retainedText = [];
  for (const file of await readdir(out, { recursive: true })) {
    if (!/\.(?:html|js|css|json|svg)$/.test(file) || assetCandidates.has(file)) continue;
    retainedText.push(await readFile(join(out, file), "utf8"));
  }
  let removedAssets = 0;
  for (const path of assetCandidates) {
    if (path.startsWith("crafts/")) continue;
    if (retainedText.some(text => text.includes(`${base}/${path}`))) continue;
    await rm(join(out, path), { force: true });
    removedAssets++;
  }
  console.log(`Removed excluded pages, ${galleryChunks.size} gallery chunks and ${removedAssets} unused assets; updated ${changedChunks} client bundles.`);
}

export async function pruneUnusedBranding({ out }) {
  const branded = /-workbook-[a-f0-9]{8}\.js$/;
  const text = [];
  for (const file of await readdir(out, { recursive: true })) {
    if (!/\.(?:html|js|json)$/.test(file) || branded.test(file)) continue;
    text.push(await readFile(join(out, file), "utf8"));
  }
  const chunks = join(out, "_next", "static", "chunks");
  for (const file of await readdir(chunks)) {
    if (branded.test(file) && !text.some(source => source.includes(file))) {
      await rm(join(chunks, file));
    }
  }
}
