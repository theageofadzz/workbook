import { readFile, access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "parse5";
import { parse as parseJavaScript } from "acorn";
import assert from "node:assert/strict";
import { excludedRoutes, isExcludedRoute, standaloneRoutes } from "./content-policy.mjs";

const root = resolve(import.meta.dirname, "..", "docs");
const manifest = JSON.parse(await readFile(join(root, "site-manifest.json"), "utf8"));
const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
let checked = 0;
const missing = new Set();
for (const page of [...manifest.pages, { route: "/about", file: "about/index.html" }]) {
  const html = await readFile(join(root, page.file), "utf8");
  const document = parse(html);
  const urls = [];
  let writingData;
  function visit(node) {
    for (const attr of node.attrs || []) {
      if (["src", "href", "poster"].includes(attr.name) && attr.value.startsWith(`${manifest.basePath}/`)) urls.push(attr.value);
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.tagName === "script" && node.attrs?.some(attr => attr.name === "id" && attr.value === "__NEXT_DATA__")) {
      const data = JSON.parse(node.childNodes.map(child => child.value || "").join(""));
      for (const route of excludedRoutes) {
        assert(!data.props?.pageProps?.content?.code?.includes(`href:"${manifest.basePath}${route}`), `Excluded link in hydrated content: ${page.route}`);
      }
      for (const item of data.props?.pageProps?.dataSource || []) {
        for (const key of ["imageUrl", "posterUrl", "videoUrl"]) {
          if (item[key]) {
            assert(
              item[key].startsWith(`${manifest.basePath}/`) || /^https?:\/\//.test(item[key]),
              `Media must work on direct visits with a trailing slash: ${page.route}: ${item[key]}`
            );
          }
          if (item[key]?.startsWith(`${manifest.basePath}/`)) urls.push(item[key]);
        }
      }
    }
    if (node.tagName === "script" && node.attrs?.some(attr => attr.name === "id" && attr.value === "crafts-content")) {
      writingData = JSON.parse(node.childNodes.map(child => child.value || "").join(""));
    }
  }
  visit(document);
  if (page.route === "/crafts") {
    assert(writingData, "Expected the standalone writing archive");
    const imported = JSON.parse(await readFile(new URL("../src/content/writing/manifest.json", import.meta.url), "utf8"));
    assert.equal(writingData.articles.length, imported.articles.length, "Every original essay must be available");
    assert.equal((html.match(/class="article-preview"/g) || []).length, imported.articles.length, "Every essay needs an animated portrait preview");
    assert.match(html, /<h1>Crafts<\/h1>/, "Keep the original Crafts heading");
    assert.equal(writingData.gallery, undefined, "Only cicada articles should be published");
    assert.equal((html.match(/class="preview-cursor"/g) || []).length, imported.articles.length, "Every preview needs a browsing cursor");
    assert(!html.includes("preview-masthead"), "Preview headers should stay removed");
    assert.deepEqual(await readdir(join(root, "crafts")), ["index.html"], "Legacy crafts media should be removed");
    for (const build of await readdir(join(root, "_next", "data"))) {
      await assert.rejects(access(join(root, "_next", "data", build, "crafts.json")), "Legacy gallery data should be removed");
    }
    const plainText = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(plainText).join("");
    for (const article of writingData.articles) {
      const source = parse(await readFile(new URL(`../src/content/writing/${article.sourcePath}`, import.meta.url), "utf8"));
      assert.equal(plainText(parse(article.html)).replace(/\s/g, ""), plainText(source).replace(/\s/g, ""), `Original wording changed: ${article.title}`);
      assert(!/<script\b|on\w+=|javascript:/i.test(article.html), `Article must contain only reading content: ${article.title}`);
      for (const heading of article.headings) assert(article.html.includes(`id="${heading.id}"`), `Missing reading section ${heading.text}`);
    }
    assert(!html.includes("__NEXT_DATA__"), "Next hydration must not replace the custom writing archive");
    assert.match(html, /<dialog[^>]+aria-labelledby="reader-title"/, "Expected an accessible reading dialog");
  }
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
assert.equal(checked, manifest.pages.length + 1, "Expected every retained page and the profile page to be checked");
assert(!manifest.pages.some(page => isExcludedRoute(page.route)), "Excluded pages must not be published");
assert(manifest.pages.some(page => page.route === "/crafts"), "The legacy works page must remain published");
for (const route of excludedRoutes) {
  await assert.rejects(access(join(root, route.slice(1))), `Excluded page directory still exists: ${route}`);
  for (const build of await readdir(join(root, "_next", "data"))) {
    await assert.rejects(access(join(root, "_next", "data", build, `${route.slice(1)}.json`)), `Excluded client data still exists: ${route}`);
  }
}
for (const build of await readdir(join(root, "_next", "static"))) {
  if (build === "chunks") continue;
  for (const file of ["_buildManifest.js", "_ssgManifest.js"]) {
    const registry = await readFile(join(root, "_next", "static", build, file), "utf8");
    for (const route of [...excludedRoutes, ...standaloneRoutes]) {
      assert(!registry.includes(route) && !registry.includes(route.replace("/", "\\u002F")), `Excluded route ${route} still registered in ${file}`);
    }
  }
}
const aboutHTML = await readFile(join(root, "about", "index.html"), "utf8");
assert.match(aboutHTML, /data-en="Creative Experiments">创意实验<\/h2>/);
assert(!/profile-craft-links|>玩具<|CSS 生成艺术|转盘交互实验|环形文字实验|鼠标轨迹实验|滚动交互实验|色彩与渐变|个人博客文章/.test(aboutHTML), "The profile must not list the removed third-party experiments");
assert.match(aboutHTML, /href="\/workbook\/gamestation\/"/, "Expected GameStation to open its internal project article");
const aboutWorks = parse(aboutHTML);
const worksItems = [];
function inspectWorks(node, inWorks = false) {
  if (node.tagName === "section" && node.attrs.some(attr => attr.name === "aria-labelledby" && attr.value === "works-title")) inWorks = true;
  if (inWorks && node.tagName === "li") worksItems.push(node);
  for (const child of node.childNodes || []) inspectWorks(child, inWorks);
}
inspectWorks(aboutWorks);
assert.equal(worksItems.length, 1, "Expected only GameStation in the profile works section");
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
assert(
  brandedChunkSources.some(source => /==="\/crafts"\?"a":/.test(source)),
  "Expected works navigation to load the standalone page without prefetching retired Next data"
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
const articleClient = await readFile(join(root, "_next", "static", "chunks", "34ch75b_hd0t9.js"), "utf8");
let compilerNode;
function findCompiler(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && node.id?.name === "i"
    && articleClient.slice(node.start, node.end).includes('case "workbook:gamestation"')) compilerNode = node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(findCompiler);
    else if (value && typeof value === "object") findCompiler(value);
  }
}
findCompiler(parseJavaScript(articleClient, { ecmaVersion: "latest" }));
assert(compilerNode, "Expected precompiled personal articles compatible with the site security policy");
const compileArticle = Function("n", "l", "s", `${articleClient.slice(compilerNode.start, compilerNode.end)};return i;`)(null, null, runtime);
const renderedEssay = compileArticle(content.code).default();
const renderedText = node => typeof node === "string" ? node : (node.props.children || []).map(renderedText).join("");
assert.equal(renderedText(renderedEssay), nodeText(essayNode), "Expected static and hydrated article text to remain identical");
const activeChunks = [...home.matchAll(/<script[^>]+src="([^"]+\/chunks\/[^"]+\.js)"/g)].map(match => match[1]);
const activeSources = await Promise.all(activeChunks.map(url => readFile(join(root, url.slice(manifest.basePath.length)), "utf8")));
assert(activeSources.some(source => source.includes(`title:${JSON.stringify(essay.title)}`) && source.includes("portfolio-cover")), "Expected the loaded homepage component to keep the new entry and cover after hydration");
assert(articleHTML.includes("workbook-sidebar-logo"), "Expected the article sidebar to use Intensea branding");
const project = JSON.parse(await readFile(new URL("../src/content/gamestation.json", import.meta.url), "utf8"));
const projectHTML = await readFile(join(root, project.slug, "index.html"), "utf8");
const projectNodes = [];
function inspectProject(node) { projectNodes.push(node); for (const child of node.childNodes || []) inspectProject(child); }
inspectProject(parse(projectHTML));
const projectScript = projectNodes.find(node => node.attrs?.some(attr => attr.name === "id" && attr.value === "__NEXT_DATA__"));
const projectData = JSON.parse(nodeText(projectScript));
assert.deepEqual(projectData.props.pageProps.content.frontmatter, project);
assert.deepEqual(
  JSON.parse(await readFile(join(root, "_next", "data", projectData.buildId, `${project.slug}.json`), "utf8")),
  projectData.props,
  "GameStation must match during direct visits and client navigation"
);
const projectArticle = projectNodes.find(node => node.tagName === "article");
assert(projectArticle, "Expected the complete GameStation project article");
const renderedProject = compileArticle(projectData.props.pageProps.content.code).default();
assert.equal(renderedText(renderedProject), nodeText(projectArticle), "GameStation hydration must keep the static article text");
for (const heading of projectData.props.pageProps.content.headings) {
  assert(projectNodes.some(node => node.tagName === "h2" && node.attrs.some(attr => attr.name === "id" && attr.value === heading.id)), `Missing project section ${heading.text}`);
}
assert(!projectHTML.includes('href="https://gamestation.cc/"') && !projectHTML.includes('href="https://github.com/theageofadzz/GameStation"'), "Project article must omit the removed preview and GitHub entry points");
const walkthrough = projectNodes.find(node => node.tagName === "video");
assert(walkthrough, "Expected an actual website walkthrough video");
for (const name of ["autoplay", "muted", "loop", "playsinline", "controls"]) {
  assert(walkthrough.attrs.some(attr => attr.name === name), `Walkthrough must retain ${name}`);
}
assert.equal(projectNodes.filter(node => node.tagName === "button" && node.attrs.some(attr => attr.name === "data-code-copy")).length, 4, "Expected four copyable code sections");
assert(activeSources.some(source => source.includes(`title:${JSON.stringify(project.title)}`) && source.includes("gamestation-cover")), "Expected the hydrated homepage to use the project cover");
await assert.rejects(access(join(root, "interactive-design-in-ai")), "The replaced AI article must be removed");
for (const file of await readdir(root, { recursive: true })) {
  if (!/\.(?:html|js|json)$/.test(file)) continue;
  const source = await readFile(join(root, file), "utf8");
  assert(!source.includes("使用 AI 制作交互动画的建议") && !source.includes("interactive-design-in-ai"), `Obsolete AI article content remains in ${file}`);
}
console.log(`Validated ${checked} pages, their local links and assets, and the GitHub Pages configuration.`);
