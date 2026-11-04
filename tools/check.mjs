import { readFile, access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "parse5";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..", "docs");
const manifest = JSON.parse(await readFile(join(root, "site-manifest.json"), "utf8"));
const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
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
assert.equal(config.title, "theageofadzz", "Expected the site to use the personal brand");
assert.equal(config.headerTitle, "奥兹时代", "Expected the requested Chinese header name");
assert.equal(config.browserTitle, "workbook of theageofadzz", "Expected the browser tab to use the requested title");
assert.equal(config.repository, "https://github.com/theageofadzz/workbook");
assert(
  await readFile(join(root, "workbook.js"), "utf8").then(source => source.includes('const profile = "https://github.com/theageofadzz"')),
  "Expected the footer GitHub link to point to the profile"
);
await access(join(root, ".nojekyll"));
await access(join(root, "about", "index.html"));
await access(join(root, "assets", "intensea-logo.png"));
await access(join(root, "assets", "intensea-favicon.png"));
const favicon = await readFile(join(root, "assets", "intensea-favicon.png"));
assert.equal(favicon.readUInt32BE(16), 64, "Expected a 64px favicon");
assert.equal(favicon.readUInt32BE(20), 64, "Expected a square favicon");
assert(
  await readFile(join(root, "workbook.js"), "utf8").then(source => source.includes('config.browserTitle || "workbook of theageofadzz"')),
  "Expected client-side navigation to keep the requested browser title"
);
const home = await readFile(join(root, "index.html"), "utf8");
assert.match(home, /<title[^>]*>workbook of theageofadzz<\/title>/);
assert.match(home, /href="\/workbook\/assets\/intensea-favicon\.png\?v=[a-f0-9]{8}"/);
assert(!home.includes("49695834240a-abc-favicon.svg"), "Expected the reference triangle favicon to be removed");
const brandedChunks = (await readdir(join(root, "_next", "static", "chunks"))).filter(file =>
  /-workbook-[a-f0-9]{8}\.js$/.test(file)
);
const brandedChunkSources = await Promise.all(brandedChunks.map(file => readFile(join(root, "_next", "static", "chunks", file), "utf8")));
assert(
  brandedChunkSources.some(source => source.includes("intensea-favicon.png?v=")),
  "Expected client-side navigation to keep the custom favicon"
);
assert(
  brandedChunkSources.some(source => source.includes('title",{children:"workbook of theageofadzz"')),
  "Expected client-side navigation to keep the requested browser title"
);
assert(
  brandedChunkSources.some(source => source.includes('"data-role":"footer-item"') && source.includes('className:"size-1/2 workbook-home-logo"')),
  "Expected the React navigation to render the personal home logo during hydration"
);
for (const page of [...manifest.pages.map(page => page.file), "about/index.html", "404.html"]) {
  const document = parse(await readFile(join(root, page), "utf8"));
  let title = "";
  let icon;
  let homeLink;
  let homeLogo;
  let homeTriangle = false;
  function inspect(node, inHomeLink = false) {
    if (node.tagName === "title" && node.parentNode?.tagName === "head") title = node.childNodes.map(child => child.value || "").join("");
    if (node.tagName === "link" && node.attrs?.some(attr => attr.name === "rel" && attr.value === "icon")) icon = node.attrs.find(attr => attr.name === "href")?.value;
    if (node.tagName === "a" && node.attrs?.some(attr => attr.name === "data-role" && attr.value === "footer-item")
      && node.attrs.some(attr => attr.name === "href" && attr.value.replace(/\/$/, "") === manifest.basePath)) {
      homeLink = node;
      inHomeLink = true;
    }
    if (inHomeLink && node.tagName === "img") homeLogo = node;
    if (inHomeLink && node.tagName === "svg") homeTriangle = true;
    for (const child of node.childNodes || []) inspect(child, inHomeLink);
  }
  inspect(document);
  assert.equal(title, "workbook of theageofadzz", `Unexpected browser title in ${page}`);
  assert.match(icon || "", /^\/workbook\/assets\/intensea-favicon\.png\?v=[a-f0-9]{8}$/, `Unexpected favicon in ${page}`);
  if (homeLink) {
    assert.equal(homeLogo?.tagName, "img", `Expected the personal home logo in ${page}, without JavaScript`);
    assert.match(homeLogo.attrs.find(attr => attr.name === "src")?.value || "", /^\/workbook\/assets\/intensea-logo\.png\?v=[a-f0-9]{8}$/, `Unexpected home logo in ${page}`);
    assert.equal(homeTriangle, false, `Expected the triangle home icon to be removed from ${page}`);
  }
}
const homepage = parse(home);
let headerLogo;
let headerTitle;
function findHeaderLogo(node) {
  if (node.tagName === "h1") {
    headerTitle = node;
    const group = node.parentNode;
    const siblings = group.parentNode?.childNodes || [];
    headerLogo = siblings.slice(0, siblings.indexOf(group)).findLast(sibling => sibling.tagName);
  }
  for (const child of node.childNodes || []) findHeaderLogo(child);
}
findHeaderLogo(homepage);
assert.equal(headerTitle?.childNodes.map(child => child.value || "").join(""), "奥兹时代", "Expected the Chinese header name before JavaScript loads");
assert(headerTitle.attrs.some(attr => attr.name === "class" && attr.value.includes("font-[Weixin]")), "Expected the original Chinese header font");
assert(
  brandedChunkSources.some(source => /"h1",\{className:"relative -left-px font-\[Weixin\][^"]*",children:"奥兹时代"/.test(source)),
  "Expected React to keep the Chinese header name and original font during hydration"
);
assert.equal(headerLogo?.tagName, "img", "Expected the personal logo in the static homepage, without JavaScript");
assert.match(
  headerLogo.attrs.find(attr => attr.name === "src")?.value || "",
  /^\/workbook\/assets\/intensea-logo\.png\?v=[a-f0-9]{8}$/,
  "Expected a versioned personal logo image"
);
assert.match(home, /_next\/static\/chunks\/[^"]+-workbook-[a-f0-9]{8}\.js/, "Expected the branded client header to have a new asset URL");
assert.match(home, /href="\/workbook\/workbook\.css\?v=[a-f0-9]{8}"/, "Expected versioned site styles");
assert.match(home, /src="\/workbook\/workbook\.js\?v=[a-f0-9]{8}"/, "Expected a cache-busted branding script");
const essay = JSON.parse(await readFile(new URL("../src/content/portfolio-design.json", import.meta.url), "utf8"));
assert(home.includes(essay.title) && home.includes(essay.description), "Expected the new featured essay on the homepage");
assert(!home.includes("微广 12 周年活动记录"), "Expected the old featured title to be removed");
const articleHTML = await readFile(join(root, essay.slug, "index.html"), "utf8");
const articleDocument = parse(articleHTML);
const nodeText = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(nodeText).join("");
const nodes = [];
function collect(node) { nodes.push(node); for (const child of node.childNodes || []) collect(child); }
collect(articleDocument);
const nextScript = nodes.find(node => node.tagName === "script" && node.attrs.some(attr => attr.name === "id" && attr.value === "__NEXT_DATA__"));
const articleData = JSON.parse(nodeText(nextScript));
const content = articleData.props.pageProps.content;
assert.deepEqual(content.frontmatter, essay, "Expected the article byline and metadata to match the featured essay");
assert.deepEqual(
  JSON.parse(await readFile(join(root, "_next", "data", articleData.buildId, `${essay.slug}.json`), "utf8")),
  articleData.props,
  "Expected direct visits and client navigation to receive the same article"
);
const essayNode = nodes.find(node => node.tagName === "article");
assert(essayNode, "Expected the complete new essay in the static article");
assert(!articleHTML.includes("词语重组") && !articleHTML.includes("时钟转盘") && !articleHTML.includes("wxad12-full.mp4"), "Expected old anniversary content and demos to be removed");
for (const heading of content.headings) {
  assert(nodes.some(node => node.tagName === "h2" && node.attrs.some(attr => attr.name === "id" && attr.value === heading.id)), `Missing article section ${heading.text}`);
}
// Exercise the stored component as Next does, without requiring a browser or React.
const runtime = { jsxs: (tag, props) => ({ tag, props }) };
const renderedEssay = Function("_jsx_runtime", content.code)(runtime).default();
const renderedText = node => typeof node === "string" ? node : (node.props.children || []).map(renderedText).join("");
assert.equal(renderedText(renderedEssay), nodeText(essayNode), "Expected static and hydrated article text to remain identical");
const activeChunks = [...home.matchAll(/<script[^>]+src="([^"]+\/chunks\/[^"]+\.js)"/g)].map(match => match[1]);
const activeSources = await Promise.all(activeChunks.map(url => readFile(join(root, url.slice(manifest.basePath.length)), "utf8")));
assert(activeSources.some(source => source.includes(`title:${JSON.stringify(essay.title)}`) && source.includes("portfolio-cover")), "Expected the loaded homepage component to keep the new entry and cover after hydration");
assert(articleHTML.includes("workbook-sidebar-logo"), "Expected the article sidebar to use Intensea branding");
console.log(`Validated ${checked} pages, their local links and assets, and the GitHub Pages configuration.`);
