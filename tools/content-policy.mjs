import { readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parse, serialize } from "parse5";
import { parse as parseJavaScript } from "acorn";

export const excludedRoutes = [
  "/generative",
  "/carousel",
  "/circular-text",
  "/trail",
  "/scroll-mock",
  "/conic-gradient",
  "/small-p",
  "/making-fun-interfaces",
  "/figma-make",
  "/springen2",
  "/wxad11",
  "/svg-liquid-glass",
  "/quality-of-ui",
  "/spross",
  "/springen",
  "/making-fluid-interfaces",
  "/deng",
  "/drawer",
  "/shadcn",
  "/designing-depth",
  "/bm",
  "/wxad",
  "/adui",
  "/functional-motion",
  "/likes",
  "/2023",
  "/font-family"
];
const excludedSlugs = new Set(excludedRoutes.map(route => route.slice(1)));
export const standaloneRoutes = ["/", "/crafts", "/github", "/about"];
const personalSlugs = new Set(["", "crafts", "github", "about", "wxad12", "gamestation", "weather-recreation", "blueprint-design-skill", "shirota-weather.html", "interactive-design-in-ai"]);

export function isExcludedRoute(route) {
  const slug = route.replace(/^\/+/, "").split(/[/?#]/)[0];
  return excludedSlugs.has(slug) || (!personalSlugs.has(slug) && !slug.startsWith("_") && !slug.startsWith("["));
}

export function isRetiredClientRoute(route) {
  return isExcludedRoute(route)
    || standaloneRoutes.some(path => route === path || route.startsWith(`${path}/`));
}

function isExcludedArticleLink(href, base) {
  return typeof href === "string" && href.startsWith(`${base}/`)
    && !href.startsWith(`${base}/assets/`)
    && isExcludedRoute(href.slice(base.length));
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

export function useStandaloneNavigation(source, base) {
  if (!source.includes('"data-role":"footer-item"')) return source;
  const edits = [];
  let footerLink;
  walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
    if (node.type !== "CallExpression" || node.arguments.length < 2) return;
    const props = node.arguments[1];
    if (props.type !== "ObjectExpression"
      || !props.properties.some(property => property.key?.value === "data-role" && property.value?.value === "footer-item")) return;
    const href = props.properties.find(property => property.key?.name === "href")?.value;
    const link = href?.type === "Identifier" ? href : props.properties.find(property => property.key?.value === "aria-label")?.value;
    if (link?.type !== "Identifier") return;
    footerLink = link.name;
    const condition = standaloneRoutes.map(route => `${link.name}===${JSON.stringify(route)}`).join("||");
    const component = node.arguments[0];
    const fallback = component.type === "ConditionalExpression" ? component.alternate : component;
    edits.push(
      { start: component.start, end: component.end, value: `${condition}?"a":${source.slice(fallback.start, fallback.end)}` },
      { start: href.start, end: href.end, value: `${condition}?${JSON.stringify(base)}+${link.name}+(${link.name}==="/"? "":"/"):${link.name}` }
    );
  });
  if (footerLink) {
    walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
      if (node.type !== "CallExpression" || node.arguments[0]?.value !== "div") return;
      const props = node.arguments[1];
      if (props?.type !== "ObjectExpression"
        || !props.properties.some(property => property.key?.name === "className" && property.value?.value === "absolute-full flex items-center justify-center z-10")) return;
      const child = props.properties.find(property => property.key?.name === "children")?.value;
      if (child?.type !== "Identifier") return;
      const factory = source.slice(node.callee.start, node.callee.end);
      const path = "M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.8A5.3 5.3 0 0 0 18.7 5a5 5 0 0 0-.1-3.6S17.4 1 15 2.8a13.4 13.4 0 0 0-6 0C6.6 1 5.4 1.4 5.4 1.4A5 5 0 0 0 5.3 5a5.3 5.3 0 0 0-1.5 3.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 9 18.1V22";
      const icon = `(${factory})("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round",className:"size-1/2 text-neutral-600 workbook-github-icon","aria-hidden":!0,children:(${factory})("path",{d:${JSON.stringify(path)}})})`;
      edits.push({ start: child.start, end: child.end, value: `${footerLink}==="/github"?${icon}:${child.name}` });
    });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  }
  return source;
}

// Standalone pages keep their HTML but retire the previous Next route and data.
function pruneJavaScript(source, collectRemoved) {
  const original = source;
  const edits = [];
  walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
    if (node.type === "ArrayExpression") {
      const keep = node.elements.filter(element => {
        if (element?.type === "Literal") return !(typeof element.value === "string" && element.value.startsWith("/") && isRetiredClientRoute(element.value));
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
        return !(typeof key === "string" && key.startsWith("/") && isRetiredClientRoute(key));
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
  return source === original ? source : pruneJavaScript(source, collectRemoved);
}

function pruneContentCode(source, base) {
  if (!excludedRoutes.some(route => source.includes(`${base}${route}`))) return source;
  const edits = [];
  walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest", allowReturnOutsideFunction: true }), node => {
    if (node.type !== "Property" || (node.key?.name || node.key?.value) !== "href") return;
    const href = node.value?.value;
    if (isExcludedArticleLink(href, base)) {
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
    if (!isExcludedArticleLink(href, base)) return;
    let card = node.parentNode;
    while (card && attr(card, "class") !== "mb-12") card = card.parentNode;
    if (card) {
      removeNode(card);
      return false;
    }
    node.attrs = node.attrs.filter(item => item.name !== "href");
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
  const removedPages = manifest.pages.filter(page => isExcludedRoute(page.route));
  for (const page of removedPages) {
    collectAssets(await readFile(join(out, page.file), "utf8"));
  }
  manifest.pages = manifest.pages.filter(page => !isExcludedRoute(page.route));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  for (const route of new Set([...excludedRoutes, ...removedPages.map(page => page.route)])) {
    await rm(join(out, route.slice(1)), { recursive: true, force: true });
  }
  const dataRoot = join(out, "_next", "data");
  for (const build of await readdir(dataRoot)) {
    for (const slug of excludedSlugs) await rm(join(dataRoot, build, `${slug}.json`), { force: true });
    for (const file of await readdir(join(dataRoot, build))) {
      if (!file.endsWith(".json")) continue;
      const path = join(dataRoot, build, file);
      if (isExcludedRoute(file === "index.json" ? "/" : `/${file.slice(0, -5)}`)) {
        await rm(path);
        continue;
      }
      const data = JSON.parse(await readFile(path, "utf8"));
      if (prunePageData(data, base)) await writeFile(path, JSON.stringify(data));
    }
  }

  const staticRoot = join(out, "_next", "static");
  const retiredChunks = new Set();
  const retainedChunks = new Set();
  for (const file of await readdir(staticRoot)) {
    if (file === "chunks") continue;
    const path = join(staticRoot, file, "_buildManifest.js");
    let source;
    try { source = await readFile(path, "utf8"); } catch { continue; }
    walkJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
      if (node.type !== "ObjectExpression") return;
      const registry = node.properties.filter(property => String(property.key?.value || "").startsWith("/"));
      for (const property of registry) {
        walkJavaScript(property.value, value => {
          if (value.type === "Literal" && typeof value.value === "string" && value.value.startsWith("static/chunks/")) {
            (isRetiredClientRoute(property.key.value) ? retiredChunks : retainedChunks).add(value.value);
          }
        });
      }
    });
  }
  const galleryChunks = new Set([...retiredChunks].filter(chunk => !retainedChunks.has(chunk)));
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
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...manifest.pages.map(page => page.route), "/about", "/github"].map(route => `<url><loc>${url}${route === "/" ? "/" : `${route}/`}</loc></url>`).join("")}</urlset>`
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

export async function pruneRetiredAssets({ out, base, retiredContent }) {
  const candidates = new Set();
  for (const source of retiredContent) {
    for (const match of source.matchAll(/\/media\/([^/"'<>\\\s?]+)(?:\?[^"'<>\\\s]*)?/g)) {
      candidates.add(match[1]);
    }
  }
  const retained = [];
  for (const file of await readdir(out, { recursive: true })) {
    if (!/\.(?:html|js|json|css|svg)$/.test(file) || (file.startsWith("media/") && candidates.has(file.slice(6)))) continue;
    retained.push(await readFile(join(out, file), "utf8"));
  }
  let removed = 0;
  for (const file of candidates) {
    if (retained.some(source => source.includes(file))) continue;
    await rm(join(out, "media", file), { force: true });
    removed++;
  }
  console.log(`Removed ${removed} unreferenced assets from replaced articles.`);
}
