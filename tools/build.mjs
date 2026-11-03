import { mkdir, readFile, readdir, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse, parseFragment, serialize } from "parse5";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));
const assetVersion = async file => createHash("sha256")
  .update(await readFile(join(root, "src", file)))
  .digest("hex")
  .slice(0, 8);
const cssVersion = await assetVersion("workbook.css");
const jsVersion = await assetVersion("workbook.js");
const source = new URL(config.source);
const base = config.basePath;
const cache = join(root, ".cache", "reference");
const out = join(root, "docs");
const logoVersion = await assetVersion("assets/intensea-logo.png");
const logoSrc = `${base}/assets/intensea-logo.png?v=${logoVersion}`;
const headerClasses = "relative w-12 h-12 74:top-[0.15rem] 74:mr-2 74:w-10 74:h-10 opacity-80";
const logoClasses = `${headerClasses} workbook-header-logo`;

async function brandClientHeader() {
  const chunks = join(out, "_next", "static", "chunks");
  const renamed = [];
  // Keep React's header consistent with the static HTML during hydration.
  const component = /(\(0,\w+\.jsx\))\((?:\w+\.f|"img"),\{(?:src:"[^"]*",alt:"","aria-hidden":!0,)?className:"relative w-12 h-12 74:top-\[0\.15rem\] 74:mr-2 74:w-10 74:h-10 opacity-80(?: workbook-header-logo)?"\}\)/;
  for (const file of await readdir(chunks)) {
    if (!file.endsWith(".js") || file.includes("-workbook-")) continue;
    const path = join(chunks, file);
    const source = await readFile(path, "utf8");
    if (!component.test(source)) continue;
    const branded = source.replace(component, (_, factory) =>
      `${factory}("img",{src:${JSON.stringify(logoSrc)},alt:"","aria-hidden":!0,className:${JSON.stringify(logoClasses)}})`
    );
    const version = createHash("sha256").update(branded).digest("hex").slice(0, 8);
    const stem = file.slice(0, -3);
    const name = `${stem}-workbook-${version}.js`;
    await writeFile(path, branded);
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
    walk(document, node => {
      if (node.tagName === "h1") {
        const group = node.parentNode;
        const siblings = group.parentNode?.childNodes || [];
        const mark = siblings.slice(0, siblings.indexOf(group)).findLast(sibling => sibling.tagName);
        if (mark?.attrs?.some(attr => attr.name === "class" && /lucide-pyramid|workbook-header-logo/.test(attr.value))) {
          const logo = parseFragment(`<img src="${logoSrc}" alt="" aria-hidden="true" class="${logoClasses}">`).childNodes[0];
          logo.parentNode = group.parentNode;
          siblings.splice(siblings.indexOf(mark), 1, logo);
        }
      }
      for (const attr of node.attrs || []) {
        if (attr.name === "href" && /\/workbook\.css(?:\?|$)/.test(attr.value)) {
          attr.value = `${base}/workbook.css?v=${cssVersion}`;
        }
        if (attr.name === "src" && /\/workbook\.js(?:\?|$)/.test(attr.value)) {
          attr.value = `${base}/workbook.js?v=${jsVersion}`;
        }
      }
    });
    await writeFile(path, serialize(document));
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(join(cache, "manifest.json"), "utf8"));
} catch {
  // Checked-in docs are a complete, ready-to-publish static build.
  await accessBuild();
  for (const file of ["workbook.css", "workbook.js"]) await copyFile(join(root, "src", file), join(out, file));
  await mkdir(join(out, "assets"), { recursive: true });
  await copyFile(join(root, "src", "assets", "intensea-logo.png"), join(out, "assets", "intensea-logo.png"));
  const builtPages = JSON.parse(await readFile(join(out, "site-manifest.json"), "utf8"));
  await brandClientHeader();
  await refreshRuntimeLinks([...builtPages.pages.map(page => page.file), "about/index.html", "404.html"]);
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

function nextData(document) {
  let result;
  walk(document, node => {
    if (node.tagName === "script" && node.attrs?.some(a => a.name === "id" && a.value === "__NEXT_DATA__")) result = node;
  });
  return result;
}

function normalizeCrafts(data) {
  for (const item of data.props?.pageProps?.dataSource || []) {
    for (const key of ["posterUrl", "imageUrl", "videoUrl"]) {
      if (item[key] && !item[key].startsWith("http") && !item[key].startsWith("/")) {
        const url = new URL(item[key], `${config.source}/`).href;
        item[key] = mapping.get(url) || url;
      }
    }
  }
}

await mkdir(out, { recursive: true });
const pages = [];
for (const record of manifest.files) {
  const input = join(cache, record.local);
  if (record.kind === "page") {
    const route = new URL(record.url).pathname.slice(source.pathname.length).replace(/\/$/, "") || "/";
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
    normalizeCrafts(data);
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

for (const file of ["workbook.css", "workbook.js"]) await copyFile(join(root, "src", file), join(out, file));
await mkdir(join(out, "assets"), { recursive: true });
await copyFile(join(root, "src", "assets", "intensea-logo.png"), join(out, "assets", "intensea-logo.png"));
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
await mkdir(join(out, "about"), { recursive: true });
await writeFile(join(out, "about", "index.html"), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>关于 · ${config.title}</title><link rel="stylesheet" href="${base}/workbook.css?v=${cssVersion}"></head>
<body class="workbook-about"><main><a class="back" href="${base}/">← 返回作品集</a><p class="eyebrow">DESIGN &amp; ENGINEERING</p><h1>${config.title}.</h1><p class="lead">${config.subtitle}</p><hr><h2>关于这个网站</h2><p>这里收集关于界面、交互、动效与设计工程的探索。</p><p>此版本按照「设计垂点」的公开页面复刻视觉与交互，部署于 ${config.title}。示例文章、作品及其原作者署名予以保留，内容版权归各自权利人所有。</p><p><a href="${config.source}/" target="_blank" rel="noreferrer">设计参考：设计垂点 / Aragakey. ↗</a></p><p><a href="${config.repository}" target="_blank" rel="noreferrer">GitHub 仓库 ↗</a></p></main></body></html>`);
await writeFile(join(out, "404.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>页面未找到 · ${config.title}</title><link rel="stylesheet" href="${base}/workbook.css?v=${cssVersion}"></head><body class="workbook-about"><main><p class="eyebrow">404</p><h1>这一页暂时不在。</h1><p class="lead">继续探索其他作品与设计记录。</p><a class="back" href="${base}/">← 返回作品集</a></main></body></html>`);
await brandClientHeader();
await refreshRuntimeLinks([...pages.map(page => page.file), "about/index.html", "404.html"]);
console.log(`Built ${pages.length + 1} pages for ${config.url}/`);
