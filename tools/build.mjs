import { mkdir, readFile, readdir, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse, parseFragment, serialize } from "parse5";
import sharp from "sharp";
import { personalizePortfolio } from "./portfolio.mjs";
import { writeAboutPage } from "./about.mjs";
import { writeCraftsPage } from "./crafts.mjs";
import { writeGitHubPage } from "./github.mjs";
import { writeCursorAssets } from "./cursor.mjs";
import { isExcludedRoute, pruneExcludedContent, pruneUnusedBranding, pruneRetiredAssets, useStandaloneNavigation } from "./content-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));
const assetVersion = async file => createHash("sha256")
  .update(await readFile(join(root, "src", file)))
  .digest("hex")
  .slice(0, 8);
const cssVersion = await assetVersion("workbook.css");
const jsVersion = await assetVersion("workbook.js");
const securityVersion = await assetVersion("security.js");
const cursorVersion = await assetVersion("cursor.css");
const transitionCSSVersion = await assetVersion("page-transitions.css");
const transitionJSVersion = await assetVersion("page-transitions.js");
const source = new URL(config.source);
const base = config.basePath;
const cache = join(root, ".cache", "reference");
const out = join(root, "docs");
const logoVersion = await assetVersion("assets/intensea-logo.png");
const logoSrc = `${base}/assets/intensea-logo.png?v=${logoVersion}`;
const faviconSrc = `${base}/assets/intensea-favicon.png?v=${logoVersion}`;
const browserTitle = config.browserTitle || config.title;
const headerTitle = config.headerTitle || config.title;
const headerClasses = "relative w-12 h-12 74:top-[0.15rem] 74:mr-2 74:w-10 74:h-10 opacity-80";
const logoClasses = `${headerClasses} workbook-header-logo`;
const homeLogoClasses = "size-1/2 workbook-home-logo";
const securityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self'",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join("; ");

await mkdir(join(out, "assets"), { recursive: true });
await writeCursorAssets({ root, out });

async function writeFavicon() {
  const logo = join(root, "src", "assets", "intensea-logo.png");
  const alpha = await sharp(logo).extractChannel(3).resize(56, 34, { fit: "fill" }).png().toBuffer();
  const silhouette = await sharp({
    create: { width: 56, height: 34, channels: 3, background: "#000" }
  }).joinChannel(alpha).png().toBuffer();
  const favicon = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{ input: silhouette, left: 4, top: 15 }]).png().toBuffer();
  await writeFile(join(out, "assets", "intensea-favicon.png"), favicon);
}

async function brandClientHeader() {
  const chunks = join(out, "_next", "static", "chunks");
  const renamed = [];
  // Keep React's branding consistent with the static HTML during hydration.
  const component = /(\(0,\w+\.jsx\))\((?:\w+\.f|"img"),\{(?:src:"[^"]*",alt:"","aria-hidden":!0,)?className:"relative w-12 h-12 74:top-\[0\.15rem\] 74:mr-2 74:w-10 74:h-10 opacity-80(?: workbook-header-logo)?"\}\)/;
  const headerTitleComponent = /(\(0,\w+\.jsx\)\("h1",\{className:"relative -left-px font-\[Weixin\][^"]*",children:)"[^"]*"(\}\))/;
  const homeComponent = /(\(0,\w+\.jsx\))\((?:\w+\.f,\{width:void 0,height:void 0,className:"size-1\/2 text-neutral-600"|"img",\{src:"[^"]*",alt:"","aria-hidden":!0,className:"size-1\/2 workbook-home-logo")\}\)/;
  const sidebarComponent = /(\(0,\w+\.jsx\))\((?:\w+\.f|"img"),\{(?:src:"[^"]*",alt:"","aria-hidden":!0,)?className:"size-12(?: workbook-sidebar-logo)?"\}\)/;
  for (const file of await readdir(chunks)) {
    if (!file.endsWith(".js") || file.includes("-workbook-")) continue;
    const path = join(chunks, file);
    const source = await readFile(path, "utf8");
    let branded = source.replace(component, (_, factory) =>
      `${factory}("img",{src:${JSON.stringify(logoSrc)},alt:"","aria-hidden":!0,className:${JSON.stringify(logoClasses)}})`
    );
    branded = branded.replace(headerTitleComponent, (_, open, close) =>
      `${open}${JSON.stringify(headerTitle)}${close}`
    );
    if (source.includes('"data-role":"footer-item"')) {
      branded = branded.replaceAll('link:"https://codepen.io/aragakey"', 'link:"/github"')
        .replaceAll('link:"https://jiangyijie27.github.io/aragakey/"', 'link:"/about"');
      branded = branded.replace(homeComponent, (_, factory) =>
        `${factory}("img",{src:${JSON.stringify(logoSrc)},alt:"","aria-hidden":!0,className:${JSON.stringify(homeLogoClasses)}})`
      );
      branded = useStandaloneNavigation(branded, base);
    }
    if (source.includes("fixed hidden 74:flex")) {
      branded = branded.replace(sidebarComponent, (_, factory) =>
        `${factory}("img",{src:${JSON.stringify(logoSrc)},alt:"","aria-hidden":!0,className:"size-12 workbook-sidebar-logo"})`
      );
    }
    branded = branded.replace(
      /href:"[^"]*abc-favicon\.svg",type:"image\/svg\+xml"/,
      `href:${JSON.stringify(faviconSrc)},type:"image/png"`
    );
    branded = branded.replace(
      /(\(0,\w+\.jsx\)\("title",\{children:)("theageofadzz"|et\.title)(\}\))/,
      (_, open, _title, close) => `${open}${JSON.stringify(browserTitle)}${close}`
    );
    const alreadyBranded = source.includes(`src:${JSON.stringify(logoSrc)}`)
      || source.includes(`href:${JSON.stringify(faviconSrc)}`)
      || source.includes(`title",{children:${JSON.stringify(browserTitle)}`);
    if (branded === source && !alreadyBranded) continue;
    const version = createHash("sha256").update(branded).digest("hex").slice(0, 8);
    const stem = file.slice(0, -3);
    const name = `${stem}-workbook-${version}.js`;
    if (source !== branded) await writeFile(path, branded);
    await writeFile(join(chunks, name), branded);
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    renamed.push([new RegExp(`${escaped}(?:-workbook-[a-f0-9]{8})?\\.js`, "g"), name]);
  }
  if (!renamed.length) throw new Error("Could not locate the client header to apply the personal logo.");
  for (const file of await readdir(out, { recursive: true })) {
    if (!/\.(?:html|js|json)$/.test(file)) continue;
    const path = join(out, file);
    const source = await readFile(path, "utf8");
    let branded = source;
    for (const [pattern, name] of renamed) branded = branded.replace(pattern, name);
    if (source !== branded) await writeFile(path, branded);
  }
}

async function refreshRuntimeLinks(files) {
  for (const file of files) {
    const path = join(out, file);
    const document = parse(await readFile(path, "utf8"));
    let footerIndex = 0;
    const crafts = normalizeCrafts(document);
    if (crafts) {
      await writeFile(
        join(out, "_next", "data", crafts.buildId, "crafts.json"),
        JSON.stringify(crafts.props)
      );
    }
    let hasIcon = false;
    walk(document, node => {
      if (node.tagName === "a" && node.attrs?.some(attr => attr.name === "data-role" && attr.value === "footer-item")) {
        const index = footerIndex++;
        const destination = [`${base}/`, `${base}/crafts/`, `${base}/github/`, `${base}/about/`][index];
        const label = ["首页", "作品", "GitHub 个人主页", `关于 ${config.title}`][index];
        if (destination) {
          node.attrs = node.attrs.filter(attr => !["href", "target", "rel", "aria-label", "data-tooltip"].includes(attr.name));
          node.attrs.push({ name: "href", value: destination }, { name: "aria-label", value: label }, { name: "data-tooltip", value: label });
        }
        if (index === 2) {
          walk(node, mark => {
            if (mark.tagName !== "svg") return;
            const icon = parseFragment('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-1/2 text-neutral-600 workbook-github-icon" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.8A5.3 5.3 0 0 0 18.7 5a5 5 0 0 0-.1-3.6S17.4 1 15 2.8a13.4 13.4 0 0 0-6 0C6.6 1 5.4 1.4 5.4 1.4A5 5 0 0 0 5.3 5a5.3 5.3 0 0 0-1.5 3.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 9 18.1V22"/></svg>').childNodes[0];
            icon.parentNode = mark.parentNode;
            const siblings = mark.parentNode.childNodes;
            siblings.splice(siblings.indexOf(mark), 1, icon);
          });
        }
      }
      if (node.tagName === "title" && node.parentNode?.tagName === "head") {
        node.childNodes = [{ nodeName: "#text", value: browserTitle, parentNode: node }];
      }
      if (node.tagName === "link" && node.attrs?.some(attr => attr.name === "rel" && attr.value.split(/\s+/).includes("icon"))) {
        hasIcon = true;
        node.attrs = node.attrs.filter(attr => !["href", "type"].includes(attr.name));
        node.attrs.push({ name: "href", value: faviconSrc }, { name: "type", value: "image/png" });
      }
      if (node.tagName === "h1") {
        const group = node.parentNode;
        const siblings = group.parentNode?.childNodes || [];
        const mark = siblings.slice(0, siblings.indexOf(group)).findLast(sibling => sibling.tagName);
        if (mark?.attrs?.some(attr => attr.name === "class" && /lucide-pyramid|workbook-header-logo/.test(attr.value))) {
          node.childNodes = [{ nodeName: "#text", value: headerTitle, parentNode: node }];
          const logo = parseFragment(`<img src="${logoSrc}" alt="" aria-hidden="true" class="${logoClasses}">`).childNodes[0];
          logo.parentNode = group.parentNode;
          siblings.splice(siblings.indexOf(mark), 1, logo);
        }
      }
      if (node.tagName === "a"
        && node.attrs?.some(attr => attr.name === "data-role" && attr.value === "footer-item")
        && node.attrs.some(attr => attr.name === "href" && attr.value.replace(/\/$/, "") === base)) {
        walk(node, mark => {
          if (!mark.attrs?.some(attr => attr.name === "class" && /lucide-pyramid|workbook-home-logo/.test(attr.value))) return;
          const logo = parseFragment(`<img src="${logoSrc}" alt="" aria-hidden="true" class="${homeLogoClasses}">`).childNodes[0];
          logo.parentNode = mark.parentNode;
          const siblings = mark.parentNode.childNodes;
          siblings.splice(siblings.indexOf(mark), 1, logo);
        });
      }
      if (node.tagName === "a" && node.parentNode?.tagName === "h2"
        && node.attrs?.some(attr => attr.name === "href" && attr.value.replace(/\/$/, "") === base)) {
        const mark = node.childNodes.find(child => child.attrs?.some(attr =>
          attr.name === "class" && /lucide-pyramid|workbook-sidebar-logo/.test(attr.value)));
        if (mark) {
          const logo = parseFragment(`<img src="${logoSrc}" alt="" aria-hidden="true" class="size-12 workbook-sidebar-logo">`).childNodes[0];
          logo.parentNode = node;
          node.childNodes.splice(node.childNodes.indexOf(mark), 1, logo);
        }
      }
      for (const attr of node.attrs || []) {
        if (attr.name === "href" && /\/cursor\.css(?:\?|$)/.test(attr.value)) {
          attr.value = `${base}/cursor.css?v=${cursorVersion}`;
        }
        if (attr.name === "href" && /\/workbook\.css(?:\?|$)/.test(attr.value)) {
          attr.value = `${base}/workbook.css?v=${cssVersion}`;
        }
        if (attr.name === "src" && /\/workbook\.js(?:\?|$)/.test(attr.value)) {
          attr.value = `${base}/workbook.js?v=${jsVersion}`;
        }
      }
    });
    if (!hasIcon) {
      let head;
      walk(document, node => { if (node.tagName === "head") head = node; });
      const icon = parseFragment(`<link rel="icon" href="${faviconSrc}" type="image/png">`).childNodes[0];
      icon.parentNode = head;
      head.childNodes.push(icon);
    }
    let head;
    let hasCursorStyle = false;
    walk(document, node => {
      if (node.tagName === "head") head = node;
      if (node.tagName === "link" && node.attrs?.some(attr => attr.name === "href" && attr.value.includes("/cursor.css?"))) hasCursorStyle = true;
    });
    if (!hasCursorStyle) {
      const style = parseFragment(`<link rel="stylesheet" href="${base}/cursor.css?v=${cursorVersion}">`).childNodes[0];
      style.parentNode = head;
      head.childNodes.push(style);
    }
    head.childNodes = head.childNodes.filter(node => !node.attrs?.some(attr =>
      ["src", "href"].includes(attr.name) && /\/page-transitions\.(?:css|js)(?:\?|$)/.test(attr.value)
    ));
    const transitions = parseFragment(
      `<link rel="stylesheet" href="${base}/page-transitions.css?v=${transitionCSSVersion}"><script src="${base}/page-transitions.js?v=${transitionJSVersion}"></script>`
    ).childNodes;
    for (const node of transitions) node.parentNode = head;
    const firstScript = head.childNodes.findIndex(node => node.tagName === "script");
    head.childNodes.splice(firstScript < 0 ? head.childNodes.length : firstScript, 0, ...transitions);
    hardenDocument(document);
    await writeFile(path, serialize(document));
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(join(cache, "manifest.json"), "utf8"));
} catch {
  // Checked-in docs are a complete, ready-to-publish static build.
  await accessBuild();
  for (const file of ["workbook.css", "workbook.js", "security.js", "cursor.css", "page-transitions.css", "page-transitions.js", "grid.svg"]) await copyFile(join(root, "src", file), join(out, file));
  await mkdir(join(out, "assets"), { recursive: true });
  await copyFile(join(root, "src", "assets", "intensea-logo.png"), join(out, "assets", "intensea-logo.png"));
  await writeFavicon();
  const retiredArticles = await personalizePortfolio({ root, out, base });
  await writeAboutPage({ root, out, base, browserTitle, faviconSrc });
  await pruneExcludedContent({ out, base, url: config.url });
  const builtPages = JSON.parse(await readFile(join(out, "site-manifest.json"), "utf8"));
  await brandClientHeader();
  await writeCraftsPage({ root, out, base, browserTitle, faviconSrc, logoSrc });
  await writeGitHubPage({ root, out, base, browserTitle, faviconSrc, logoSrc });
  await refreshRuntimeLinks([...builtPages.pages.map(page => page.file), "about/index.html", "github/index.html", "404.html"]);
  await pruneUnusedBranding({ out });
  await pruneRetiredAssets({ out, base, retiredContent: retiredArticles });
  await writeFile(join(out, "config.json"), JSON.stringify(config, null, 2));
  console.log("Using the checked-in static build. Run npm run sync to refresh the reference snapshot.");
  process.exit(0);
}
const mapping = new Map(manifest.files.map(file => [file.url, `${base}/${file.local}`]));
const replacements = [...mapping].filter(([url]) => !url.startsWith(config.source)).sort((a, b) => b[0].length - a[0].length);

async function accessBuild() {
  await readFile(join(out, "index.html"));
  await readFile(join(out, "site-manifest.json"));
}

function rewrite(value) {
  const remoteMedia = [];
  const sourcePattern = config.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  value = value.replace(new RegExp(`${sourcePattern}/[^\\s"'<>\\\\\`]+\\.(?:mp4|webm|mov|mp3|wav|ogg)(?![a-zA-Z0-9.])`, "g"), url => {
    remoteMedia.push(url);
    return `__WORKBOOK_REMOTE_MEDIA_${remoteMedia.length - 1}__`;
  });
  for (const [url, local] of replacements) value = value.replaceAll(url, local);
  value = value.replaceAll(config.source, base);
  value = value.replace(/\/abc(?=\/|["'`\\?#]|$)/g, base);
  value = value.replaceAll('"设计垂点"', JSON.stringify(config.title));
  value = value.replaceAll('"过设计点 A，作业务目标 BC 的思考辅助垂线。"', JSON.stringify(config.subtitle));
  value = value.replaceAll('"它们的交点即设计垂点。"', '""');
  value = value.replace(/__WORKBOOK_REMOTE_MEDIA_(\d+)__/g, (_, index) => remoteMedia[Number(index)]);
  return value;
}

function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes || []) walk(child, callback);
}

function hardenDocument(document) {
  let head;
  walk(document, node => {
    if (node.tagName === "head") head = node;
    if (node.tagName === "a" && node.attrs?.some(attr => attr.name === "target" && attr.value === "_blank")) {
      const rel = node.attrs.find(attr => attr.name === "rel");
      const values = new Set((rel?.value || "").split(/\s+/).filter(Boolean));
      values.add("noopener");
      values.add("noreferrer");
      if (rel) rel.value = [...values].join(" ");
      else node.attrs.push({ name: "rel", value: "noopener noreferrer" });
    }
  });
  if (!head) throw new Error("Could not locate document head for security hardening.");
  const hasCsp = head.childNodes.some(node =>
    node.tagName === "meta"
    && node.attrs?.some(attr =>
      attr.name === "http-equiv" && attr.value.toLowerCase() === "content-security-policy"
    )
  );
  if (hasCsp) return;
  const security = parseFragment(
    `<meta http-equiv="Content-Security-Policy" content="${securityPolicy}"><meta name="referrer" content="strict-origin-when-cross-origin"><meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"><script src="${base}/security.js?v=${securityVersion}" defer></script>`
  ).childNodes;
  for (const node of security.reverse()) {
    node.parentNode = head;
    head.childNodes.unshift(node);
  }
}

function nextData(document) {
  let result;
  walk(document, node => {
    if (node.tagName === "script" && node.attrs?.some(a => a.name === "id" && a.value === "__NEXT_DATA__")) result = node;
  });
  return result;
}

function normalizeCrafts(document) {
  const script = nextData(document);
  if (!script) return;
  const data = JSON.parse(script.childNodes.map(node => node.value || "").join(""));
  if (data.page !== "/crafts") return;
  for (const item of data.props.pageProps.dataSource) {
    for (const key of ["imageUrl", "posterUrl", "videoUrl"]) {
      const value = item[key];
      if (!value || value.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(value)) continue;
      // Local posters and remote videos must resolve equally with or without a trailing slash.
      item[key] = key === "videoUrl"
        ? new URL(value, `${config.source}/`).href
        : `${base}/${value}`;
    }
  }
  script.childNodes[0].value = JSON.stringify(data).replaceAll("<", "\\u003c");
  return data;
}

await mkdir(out, { recursive: true });
const pages = [];
const retiredContent = [];
for (const record of manifest.files) {
  const input = join(cache, record.local);
  if (record.kind === "page") {
    const route = new URL(record.url).pathname.slice(source.pathname.length).replace(/\/$/, "") || "/";
    if (isExcludedRoute(route)) {
      retiredContent.push(rewrite(await readFile(input, "utf8")));
      continue;
    }
    const output = join(out, route === "/" ? "index.html" : `${route.slice(1)}/index.html`);
    let html = await readFile(input, "utf8");
    const document = parse(html);
    walk(document, node => {
      if (node.nodeName !== "#text") return;
      if (node.value === "设计垂点") node.value = config.title;
      if (node.value === "过设计点 A，作业务目标 BC 的思考辅助垂线。") node.value = config.subtitle;
      if (node.value === "它们的交点即设计垂点。") node.value = "";
    });
    const script = nextData(document);
    const data = JSON.parse(script.childNodes.map(node => node.value || "").join(""));
    script.childNodes[0].value = JSON.stringify(data).replaceAll("<", "\\u003c");
    html = rewrite(serialize(document));
    html = html.replace(/(<title[^>]*>)(.*?)(<\/title>)/, (_, open, title, close) => `${open}${title === "设计垂点" || title === config.title ? config.title : `${title} · ${config.title}`}${close}`);
    html = html.replace(/(<meta name="description" content=")[^"]*"/, `$1${config.subtitle}"`);
    html = html.replace("</head>", `<link rel="stylesheet" href="${base}/workbook.css?v=${cssVersion}"><script src="${base}/workbook.js?v=${jsVersion}" defer></script><meta name="theme-color" content="#f3f3f3"></head>`);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html);
    const transformed = parse(html);
    const json = JSON.parse(nextData(transformed).childNodes.map(node => node.value || "").join(""));
    if (json.gsp) {
      const path = join(out, "_next", "data", json.buildId, `${route === "/" ? "index" : route.slice(1)}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(json.props));
    }
    pages.push({ route, title: html.match(/<title[^>]*>(.*?)<\/title>/)?.[1] || config.title, file: output.slice(out.length + 1) });
  } else {
    if (record.originalLocal) await rm(join(out, record.originalLocal), { force: true });
    const output = join(out, record.local);
    await mkdir(dirname(output), { recursive: true });
    if (/\.(?:js|css|json|svg)$/i.test(record.local)) {
      await writeFile(output, rewrite(await readFile(input, "utf8")));
    } else {
      await copyFile(input, output);
    }
  }
}

for (const file of ["workbook.css", "workbook.js", "security.js", "cursor.css", "page-transitions.css", "page-transitions.js", "grid.svg"]) await copyFile(join(root, "src", file), join(out, file));
await mkdir(join(out, "assets"), { recursive: true });
await copyFile(join(root, "src", "assets", "intensea-logo.png"), join(out, "assets", "intensea-logo.png"));
await writeFavicon();
await writeFile(join(out, "config.json"), JSON.stringify(config, null, 2));
await writeFile(join(out, ".nojekyll"), "");
await writeFile(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);
await writeFile(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages.map(p => p.route), "/about"].map(route => `<url><loc>${config.url}${route === "/" ? "/" : `${route}/`}</loc></url>`).join("")}</urlset>`);
await writeFile(join(out, "site-manifest.json"), JSON.stringify({
  title: config.title,
  source: config.source,
  capturedAt: manifest.capturedAt,
  basePath: base,
  pages,
  localFiles: manifest.files.length,
  localBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  externalMedia: manifest.externalMedia,
  unavailableAssets: manifest.failures
}, null, 2));
await writeFile(join(out, "404.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>页面未找到 · ${config.title}</title><link rel="stylesheet" href="${base}/workbook.css?v=${cssVersion}"></head><body class="workbook-about"><main><p class="eyebrow">404</p><h1>这一页暂时不在。</h1><p class="lead">继续探索其他作品与设计记录。</p><a class="back" href="${base}/">← 返回作品集</a></main></body></html>`);
const retiredArticles = await personalizePortfolio({ root, out, base });
await writeAboutPage({ root, out, base, browserTitle, faviconSrc });
await pruneExcludedContent({ out, base, url: config.url, retiredContent });
await brandClientHeader();
await writeCraftsPage({ root, out, base, browserTitle, faviconSrc, logoSrc });
await writeGitHubPage({ root, out, base, browserTitle, faviconSrc, logoSrc });
const publishedPages = JSON.parse(await readFile(join(out, "site-manifest.json"), "utf8"));
await refreshRuntimeLinks([...publishedPages.pages.map(page => page.file), "about/index.html", "github/index.html", "404.html"]);
await pruneUnusedBranding({ out });
await pruneRetiredAssets({ out, base, retiredContent: retiredArticles });
console.log(`Built ${pages.length + 1} pages for ${config.url}/`);
