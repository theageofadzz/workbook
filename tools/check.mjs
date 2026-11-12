import { readFile, access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "parse5";
import { parse as parseJavaScript } from "acorn";
import sharp from "sharp";
import assert from "node:assert/strict";
import { excludedRoutes, isExcludedRoute, standaloneRoutes } from "./content-policy.mjs";

const root = resolve(import.meta.dirname, "..", "docs");
const manifest = JSON.parse(await readFile(join(root, "site-manifest.json"), "utf8"));
const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
const xiaohongshu = config.xiaohongshu || "https://xhslink.cn/o/4PFTntg2jrJ";
let checked = 0;
const missing = new Set();
for (const page of [...manifest.pages, { route: "/about", file: "about/index.html" }, { route: "/github", file: "github/index.html" }]) {
  const html = await readFile(join(root, page.file), "utf8");
  const document = parse(html);
  const urls = [];
  const videos = [];
  let writingData;
  function visit(node) {
    if (node.tagName === "video") videos.push(node);
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
    const { works } = JSON.parse(await readFile(new URL("../src/content/works.json", import.meta.url), "utf8"));
    assert.deepEqual(writingData.works, works, "Every work and its date must be available");
    assert.equal((html.match(/class="work-preview"/g) || []).length, works.length, "Every work needs a media preview");
    for (const work of works) {
      assert.match(html, new RegExp(`<h2>${work.title}</h2>`), `Missing work title: ${work.slug}`);
      assert(html.includes(`<time datetime="${work.publishedAt}">${work.publishedAt}</time>`), `Missing work date: ${work.slug}`);
      if (work.mediaType === "video") {
        const video = videos.find(node => node.attrs.some(attr =>
          attr.name === "src" && attr.value === `${manifest.basePath}/${work.media}`));
        assert(video, `Expected a video preview: ${work.slug}`);
        for (const name of ["autoplay", "muted", "loop", "playsinline"]) {
          assert(video.attrs.some(attr => attr.name === name), `Missing ${name}: ${work.slug}`);
        }
        assert(!video.attrs.some(attr => attr.name === "controls"), `Keep player controls hidden: ${work.slug}`);
        const media = await readFile(join(root, work.media));
        assert.equal(media.toString("ascii", 4, 8), "ftyp", `Expected an MP4 animation: ${work.slug}`);
      } else {
        const media = await sharp(join(root, work.media), { animated: true }).metadata();
        assert.equal(media.format, "gif", `Expected an actual GIF: ${work.slug}`);
        assert(media.pages > 1, `Expected animated frames: ${work.slug}`);
        assert.equal(media.loop, 0, `Expected an infinite loop: ${work.slug}`);
      }
      await access(join(root, work.poster));
    }
    assert.equal(writingData.articles.length, imported.articles.length, "Every original essay must be available");
    assert.equal((html.match(/class="article-preview"/g) || []).length, imported.articles.length, "Every essay needs an animated portrait preview");
    assert.match(html, /<h1(?:\s[^>]*)?>Crafts<\/h1>/, "Keep the original Crafts heading");
    assert.equal(writingData.gallery, undefined, "The retired gallery should stay removed");
    assert.equal((html.match(/class="preview-cursor"/g) || []).length, imported.articles.length, "Every preview needs a browsing cursor");
    assert.equal((html.match(/class="cicada-pointer"/g) || []).length, imported.articles.length, "Every preview should use the shared cicada pointer");
    assert(!html.includes("preview-wheel"), "Use the reference pointer without a wheel badge");
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
    assert(!/data-close-(?:reader|work)/.test(html), "Preview windows should close from the backdrop, without close buttons");
    for (const file of ["paper-crumple.js", "paper-crumple-worker.js", "paper-crumple-LICENSE.txt"]) {
      await access(join(root, file));
    }
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
assert.equal(checked, manifest.pages.length + 2, "Expected every retained page and both profile pages to be checked");
assert(!manifest.pages.some(page => isExcludedRoute(page.route)), "Excluded pages must not be published");
assert(isExcludedRoute("/new-reference-article"), "Future reference imports must not publish additional routes");
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
    const routes = [];
    function inspectRegistry(node) {
      if (!node || typeof node !== "object") return;
      if (node.type === "Property" && typeof node.key?.value === "string") routes.push(node.key.value);
      if (node.type === "ArrayExpression") {
        routes.push(...node.elements.filter(item => typeof item?.value === "string").map(item => item.value));
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(inspectRegistry);
        else if (value && typeof value === "object") inspectRegistry(value);
      }
    }
    inspectRegistry(parseJavaScript(registry, { ecmaVersion: "latest" }));
    for (const route of [...excludedRoutes, ...standaloneRoutes]) {
      assert(!routes.includes(route), `Excluded route ${route} still registered in ${file}`);
    }
  }
}
const aboutHTML = await readFile(join(root, "about", "index.html"), "utf8");
const aboutCSS = await readFile(join(root, "about.css"), "utf8");
assert.match(aboutHTML, /data-en="Cicada（Joya）">严采桦<\/h2>/, "Expected the updated profile name");
assert.match(aboutHTML, /<span data-en="WeChat@theageofadzz">微信@theageofadzz<\/span>/, "Expected the WeChat handle to follow the selected language");
assert.match(aboutHTML, /data-en="Creative Experiments">创意实验<\/h2>/);
assert.match(aboutHTML, /href="\/workbook\/weather-recreation\/" data-en="Weather motion">天气动效<\/a>/, "Expected the weather experiment to open its article");
assert.match(aboutHTML, /href="\/workbook\/blueprint-design-skill\/" data-en="Blueprint design skill">蓝图设计 Skill<\/a>/, "Expected the blueprint skill experiment to open its article");
assert.equal((aboutHTML.match(/class="profile-column"/g) || []).length, 2, "Expected the profile cards to flow in two content-sized columns");
assert.match(aboutHTML, /<img src="\/workbook\/assets\/cicada-avatar\.jpg" width="2316" height="3088"/, "Keep the portrait's original dimensions");
assert.doesNotMatch(
  aboutCSS,
  /\.profile-(?:identity|intro|works|experience|skills|experiments)\s*\{[^}]*\bmin-height\s*:/,
  "Profile cards must size to their content"
);
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
  await readFile(join(root, "workbook.js"), "utf8").then(source => source.includes('const profile = `${base}/github/`')),
  "Expected the footer GitHub link to stay within the website"
);
await access(join(root, ".nojekyll"));
await access(join(root, "about", "index.html"));
await access(join(root, "assets", "intensea-logo.png"));
await access(join(root, "assets", "intensea-favicon.png"));
const favicon = await readFile(join(root, "assets", "intensea-favicon.png"));
assert.equal(favicon.readUInt32BE(16), 64, "Expected a 64px favicon");
assert.equal(favicon.readUInt32BE(20), 64, "Expected a square favicon");
await access(join(root, "assets", "cicada-cursor.svg"));
const cursorStyles = await readFile(join(root, "cursor.css"), "utf8");
assert(!/\bcursor\s*:/.test(cursorStyles), "Preview cursor styles must preserve the system cursor");
const workbookStyles = await readFile(join(root, "workbook.css"), "utf8");
assert.match(
  workbookStyles,
  /\[data-role="footer-item"\]\[aria-current="page"\]::before\s*\{/,
  "The shared dock must show its current-page marker"
);
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
  brandedChunkSources.some(source => /==="\/crafts"(?:\|\|[^?]+)?\?"a":/.test(source)),
  "Expected works navigation to load the standalone page without prefetching retired Next data"
);
for (const page of [...manifest.pages.map(page => page.file), "about/index.html", "github/index.html", "404.html"]) {
  const document = parse(await readFile(join(root, page), "utf8"));
  assert.match(await readFile(join(root, page), "utf8"), /href="\/workbook\/cursor\.css\?v=[a-f0-9]{8}"/, `Expected the shared preview cursor styles on ${page}`);
  let title = "";
  let icon;
  let homeLink;
  let homeLogo;
  let aboutLink;
  let aboutIcon;
  let homeTriangle = false;
  let footerIndex = 0;
  const currentFooterIndices = [];
  const contactFooters = [];
  function inspect(node, inHomeLink = false, inAboutLink = false) {
    if (node.tagName === "footer" && node.attrs?.some(attr => attr.name === "data-site-footer")) contactFooters.push(node);
    if (node.tagName === "a" && node.attrs?.some(attr => attr.name === "data-role" && attr.value === "footer-item")) {
      const index = footerIndex++;
      if (node.attrs.some(attr => attr.name === "aria-current" && attr.value === "page")) currentFooterIndices.push(index);
      if (index === 2) {
        assert.equal(node.attrs.find(attr => attr.name === "href")?.value, `${manifest.basePath}/github/`, `Expected an internal GitHub profile link in ${page}`);
        assert(!node.attrs.some(attr => attr.name === "target"), `The GitHub navigation must not open another tab in ${page}`);
      }
      if (index === 3) {
        assert.equal(node.attrs.find(attr => attr.name === "href")?.value, xiaohongshu, `Expected the Xiaohongshu profile link in ${page}`);
        assert.equal(node.attrs.find(attr => attr.name === "target")?.value, "_blank", `Expected the Xiaohongshu link to open a new tab in ${page}`);
        assert.match(node.attrs.find(attr => attr.name === "rel")?.value || "", /noopener/, `Expected the Xiaohongshu link to be hardened in ${page}`);
      }
      if (index === 4) {
        aboutLink = node;
        inAboutLink = true;
        assert.equal(node.attrs.find(attr => attr.name === "href")?.value, `${manifest.basePath}/about/`, `Expected the About link after Xiaohongshu in ${page}`);
        assert(!node.attrs.some(attr => attr.name === "data-workbook-signature"), `The About dock icon must not become a text signature in ${page}`);
      }
    }
    if (node.tagName === "title" && node.parentNode?.tagName === "head") title = node.childNodes.map(child => child.value || "").join("");
    if (node.tagName === "link" && node.attrs?.some(attr => attr.name === "rel" && attr.value === "icon")) icon = node.attrs.find(attr => attr.name === "href")?.value;
    if (node.tagName === "a" && node.attrs?.some(attr => attr.name === "data-role" && attr.value === "footer-item")
      && node.attrs.some(attr => attr.name === "href" && attr.value.replace(/\/$/, "") === manifest.basePath)) {
      homeLink = node;
      inHomeLink = true;
    }
    if (inHomeLink && node.tagName === "img") homeLogo = node;
    if (inHomeLink && node.tagName === "svg") homeTriangle = true;
    if (inAboutLink && node.tagName === "svg") aboutIcon = node;
    for (const child of node.childNodes || []) inspect(child, inHomeLink, inAboutLink);
  }
  inspect(document);
  if (footerIndex) {
    assert.equal(footerIndex, 5, `Expected all five dock links in ${page}`);
    const expectedCurrentIndex = page === "index.html" ? 0
      : page === "crafts/index.html" ? 1
      : page === "github/index.html" ? 2
      : page === "about/index.html" ? 4
      : page === "404.html" ? -1
      : 1;
    assert.deepEqual(currentFooterIndices, [expectedCurrentIndex], `Expected the current-page marker on the matching dock link in ${page}`);
    assert(aboutLink && aboutIcon, `Expected the original About dock icon in ${page}`);
    assert.match(
      aboutIcon.childNodes.find(node => node.tagName === "path")?.attrs.find(attr => attr.name === "d")?.value || "",
      /^M12 2A10 10/,
      `Expected the original circular About icon in ${page}`
    );
  }
  assert.equal(contactFooters.length, 1, `Expected one shared contact footer in ${page}`);
  assert.deepEqual(
    contactFooters[0].childNodes.filter(node => node.tagName === "p").map(node => node.childNodes.map(child => child.value || "").join("")),
    ["没有艺术细胞。", "wechat：theageofadzz", "欢迎与我联系！"],
    `Expected the same three footer lines in ${page}`
  );
  assert(!/<footer[^>]+class="portfolio-essay-footer"/.test(await readFile(join(root, page), "utf8")), `Retired article footer links remain in ${page}`);
  assert.equal(title, "workbook of theageofadzz", `Unexpected browser title in ${page}`);
  assert.match(icon || "", /^\/workbook\/assets\/intensea-favicon\.png\?v=[a-f0-9]{8}$/, `Unexpected favicon in ${page}`);
  if (homeLink) {
    assert.equal(homeLogo?.tagName, "img", `Expected the personal home logo in ${page}, without JavaScript`);
    assert.match(homeLogo.attrs.find(attr => attr.name === "src")?.value || "", /^\/workbook\/assets\/intensea-logo\.png\?v=[a-f0-9]{8}$/, `Unexpected home logo in ${page}`);
    assert.equal(homeTriangle, false, `Expected the triangle home icon to be removed from ${page}`);
  }
}
const githubHTML = await readFile(join(root, "github", "index.html"), "utf8");
const githubSource = JSON.parse(await readFile(new URL("../src/content/github.json", import.meta.url), "utf8"));
const githubDocument = parse(githubHTML);
let githubData;
const githubNodes = [];
function inspectGitHub(node) {
  githubNodes.push(node);
  if (node.tagName === "script" && node.attrs?.some(attr => attr.name === "id" && attr.value === "github-data")) {
    githubData = JSON.parse(node.childNodes.map(child => child.value || "").join(""));
  }
  for (const child of node.childNodes || []) inspectGitHub(child);
}
inspectGitHub(githubDocument);
assert.equal(githubData.user.login, "theageofadzz");
assert.equal(githubData.repos.length, githubSource.repos.length);
assert(githubData.repos.some(repo => repo.name === "GameStation"), "The internal profile must include GameStation");
assert.deepEqual(githubData.pinned, githubSource.pinned, "Pinned repositories must come from the GitHub profile");
for (const name of githubData.pinned) assert(githubHTML.includes(`data-repository="${name}"`), `Missing pinned repository: ${name}`);
assert(githubData.calendars.length > 0, "The profile needs a real contribution calendar");
for (const calendar of githubData.calendars) {
  const days = calendar.weeks.flatMap(week => week.contributionDays);
  assert.equal(new Set(days.map(day => day.date)).size, days.length, `Duplicate contribution date in ${calendar.id}`);
  assert.equal(days.reduce((total, day) => total + day.contributionCount, 0), calendar.totalContributions, `Incorrect calendar total in ${calendar.id}`);
  assert(days.every(day => Number.isInteger(day.contributionCount) && day.contributionCount >= 0), "Contribution counts must be actual nonnegative integers");
  const panel = githubNodes.find(node => node.attrs?.some(attr => attr.name === "data-calendar" && attr.value === calendar.id));
  assert(panel, `Missing selectable calendar: ${calendar.id}`);
}
assert.equal(
  githubNodes.filter(node => node.attrs?.some(attr => attr.name === "data-contribution-day")).length,
  githubData.calendars.reduce((total, calendar) => total + calendar.weeks.flatMap(week => week.contributionDays).length, 0),
  "Every API contribution day must be rendered"
);
assert(githubData.activity.some(month => month.commits.length), "The profile needs actual repository activity");
assert(githubHTML.includes("data-github-overview"), "The GitHub overview must remain available");
assert(!githubHTML.includes("data-github-archive") && !githubHTML.includes('data-tab="repositories"') && !githubHTML.includes("data-repo-search"), "The retired repository tab and search view must be removed");
for (const repo of githubData.repos) {
  const fragment = parse(repo.readme);
  function inspectReadme(node) {
    assert(!["script", "style", "iframe", "object", "embed", "form"].includes(node.tagName), `Unsafe README element in ${repo.name}`);
    for (const { name, value } of node.attrs || []) {
      assert(!name.startsWith("on") && name !== "style", `Unsafe README attribute in ${repo.name}`);
      if (["href", "src"].includes(name)) assert(/^(?:https:\/\/|\/workbook\/|#)/.test(value), `Unsafe README URL in ${repo.name}`);
    }
    for (const child of node.childNodes || []) inspectReadme(child);
  }
  inspectReadme(fragment);
}
assert(!/<iframe\b/.test(githubHTML), "GitHub must remain readable without a blocked remote iframe");
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
assert.equal(headerLogo?.tagName, "img", "Expected the personal logo in the static homepage, without JavaScript");
assert.match(
  headerLogo.attrs.find(attr => attr.name === "src")?.value || "",
  /^\/workbook\/assets\/intensea-logo\.png\?v=[a-f0-9]{8}$/,
  "Expected a versioned personal logo image"
);
assert(!home.includes("__NEXT_DATA__") && !home.includes("TURBOPACK"), "The homepage must never hydrate reference content");
assert(!/<script[^>]+src="[^"]*\/_next\//.test(home), "The homepage must not load the retired client application");
const homepageEntries = [];
function inspectHome(node) {
  const slug = node.attrs?.find(attr => attr.name === "data-home-entry")?.value;
  if (slug) homepageEntries.push(slug);
  for (const child of node.childNodes || []) inspectHome(child);
}
inspectHome(homepage);
assert.deepEqual(homepageEntries, ["cicada-cells", "blueprint-design-skill", "weather-recreation", "wxad12", "gamestation"], "The cells article should lead the personal homepage entries");
assert(!home.includes("wxad.design") && !home.includes("Aragakey") && !home.includes("aragakey"), "The homepage must not retain reference-site content or links");
assert(!/小 p[：:]|Figma Make|微广|制作有趣的界面/.test(home), "Reference entries must also be removed from the animated miniature homepage");
await assert.rejects(access(join(root, "_next", "static", "chunks", "2ka_qt01g8-f4.js")), "The retired homepage client must be removed");
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
assert.throws(() => compileArticle("unrecognized legacy article"), /Unknown workbook article/, "The article runtime must never evaluate unrecognized reference content");
assert(!articleClient.includes("return Function(...Object.keys(r),e)"), "The legacy dynamic article compiler must be removed");
assert(home.includes("portfolio-cover") && home.includes("gamestation-cover"), "Keep both personal animated homepage covers");
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
const tutorial = JSON.parse(await readFile(new URL("../src/content/weather-recreation.json", import.meta.url), "utf8"));
const tutorialHTML = await readFile(join(root, tutorial.slug, "index.html"), "utf8");
const tutorialNodes = [];
function inspectTutorial(node) {
  tutorialNodes.push(node);
  for (const child of node.childNodes || []) inspectTutorial(child);
}
inspectTutorial(parse(tutorialHTML));
const tutorialScript = tutorialNodes.find(node => node.attrs?.some(attr => attr.name === "id" && attr.value === "__NEXT_DATA__"));
const tutorialData = JSON.parse(nodeText(tutorialScript));
assert.deepEqual(tutorialData.props.pageProps.content.frontmatter, tutorial, "The weather tutorial must retain its author, title and date");
assert.deepEqual(
  JSON.parse(await readFile(join(root, "_next", "data", tutorialData.buildId, `${tutorial.slug}.json`), "utf8")),
  tutorialData.props,
  "Direct visits and navigation must load the same weather tutorial"
);
const tutorialArticle = tutorialNodes.find(node => node.tagName === "article");
assert.equal(
  renderedText(compileArticle(tutorialData.props.pageProps.content.code).default()),
  nodeText(tutorialArticle),
  "The tutorial's pictures, quoted dialogue and code must survive hydration"
);
const tutorialOpening = tutorialArticle.childNodes.find(node => node.tagName === "p");
assert(
  tutorialHTML.indexOf("assets/articles/weather-x-browse.mp4") < tutorialHTML.indexOf("assets/works/weather.gif"),
  "Show the real X browsing recording before the recreation"
);
const sourceBrowse = tutorialNodes.find(node => node.tagName === "video");
assert(sourceBrowse?.attrs.some(attr => attr.name === "src" && attr.value.endsWith("/assets/articles/weather-x-browse.mp4")), "The tutorial must include the real X browsing recording");
for (const name of ["autoplay", "muted", "loop", "playsinline"]) {
  assert(sourceBrowse.attrs.some(attr => attr.name === name), `Source browsing must retain ${name}`);
}
assert(!sourceBrowse.attrs.some(attr => attr.name === "controls"), "Source browsing should loop without playback controls");
assert(!tutorialHTML.includes("assets/weather-reference.webp"), "The static source screenshot must be replaced");
for (const heading of tutorialData.props.pageProps.content.headings) {
  assert(tutorialNodes.some(node => node.tagName === "h2" && node.attrs.some(attr => attr.name === "id" && attr.value === heading.id)), `Missing tutorial section ${heading.text}`);
}
assert(home.includes("weather-tutorial-cover") && home.includes(tutorial.title), "The homepage must include the new tutorial and its circular GIF cover");
const blueprint = JSON.parse(await readFile(new URL("../src/content/blueprint-design-skill.json", import.meta.url), "utf8"));
const blueprintHTML = await readFile(join(root, blueprint.slug, "index.html"), "utf8");
const blueprintNodes = [];
function inspectBlueprint(node) {
  blueprintNodes.push(node);
  for (const child of node.childNodes || []) inspectBlueprint(child);
}
inspectBlueprint(parse(blueprintHTML));
const blueprintScript = blueprintNodes.find(node => node.attrs?.some(attr => attr.name === "id" && attr.value === "__NEXT_DATA__"));
const blueprintData = JSON.parse(nodeText(blueprintScript));
const blueprintArticle = blueprintNodes.find(node => node.tagName === "article");
assert.deepEqual(blueprintData.props.pageProps.content.frontmatter, blueprint);
assert.equal(
  renderedText(compileArticle(blueprintData.props.pageProps.content.code).default()),
  nodeText(blueprintArticle),
  "The film introduction and both animated demonstrations must survive hydration"
);
assert(blueprintHTML.includes("前段时间在看电影《惊天魔盗团》") && blueprintHTML.includes("最终临近下班时，gpt终于给到现在我最满意的结果"), "Keep the user's film inspiration and iterative design process");
assert(blueprintHTML.includes("rodeofx-webpage-videos/project/images/043-Now-You-See-Me/now-you-see-me_stills-005.jpg"), "Credit and show the actual film blueprint scene");
assert(!/blueprint-(?:drone-hover|drone-flight|model-3-hover|model-3-inspect)\.webp/.test(blueprintHTML), "Case studies should demonstrate motion instead of still screenshots");
const blueprintVideos = blueprintNodes.filter(node => node.tagName === "video");
assert.equal(blueprintVideos.length, 2, "Each case study needs one continuous demonstration");
for (const video of blueprintVideos) {
  for (const name of ["data-blueprint-demo", "autoplay", "muted", "loop", "playsinline"]) {
    assert(video.attrs.some(attr => attr.name === name), `Missing ${name} on the animated blueprint example`);
  }
  assert(!video.attrs.some(attr => attr.name === "controls"), "Blueprint animations must not show video player controls");
  assert(video.attrs.some(attr => attr.name === "preload" && attr.value === "auto"), "Blueprint examples should load and play before they enter the viewport");
}
assert(blueprintNodes.some(node => node.tagName === "h2" && nodeText(node) === "参考资料"), "The references heading must omit the colon");
const skillDownload = blueprintNodes.find(node => node.tagName === "a"
  && node.attrs.some(attr => attr.name === "download" && attr.value === "blueprint-3d-showcase.zip"));
assert(skillDownload, "The skill needs a browser download link");
assert.equal(skillDownload.attrs.find(attr => attr.name === "href")?.value,
  `${manifest.basePath}/assets/skills/blueprint-3d-showcase.zip`,
  "Article route pruning must preserve the skill's downloadable asset link");
const skillArchive = await readFile(join(root, "assets", "skills", "blueprint-3d-showcase.zip"));
assert.equal(skillArchive.readUInt32LE(0), 0x04034b50, "The downloadable skill must be a ZIP archive");
const skillDiscovery = JSON.parse(await readFile(join(root, ".well-known", "agent-skills", "index.json"), "utf8"));
assert.equal(skillDiscovery.skills.length, 1);
assert.equal(skillDiscovery.skills[0].name, "blueprint-3d-showcase");
for (const file of skillDiscovery.skills[0].files) {
  assert((await readFile(join(root, ".well-known", "agent-skills", "blueprint-3d-showcase", file)))
    .equals(await readFile(join(root, "..", "skills", "blueprint-3d-showcase", file))),
  `The hosted skill must include its complete portable resource: ${file}`);
}
const experiences = blueprintNodes.filter(node => node.tagName === "iframe");
assert.equal(experiences.length, 2, "Both blueprints must be directly interactive in the article");
for (const [index, slug] of ["drone", "model-3"].entries()) {
  assert(experiences[index].attrs.some(attr => attr.name === "src" && attr.value.endsWith(`/assets/blueprint/${slug}.html`)), `Missing embedded ${slug} experience`);
  assert(experiences[index].attrs.some(attr => attr.name === "title" && attr.value), "Interactive frames need accessible titles");
  const experienceHTML = await readFile(join(root, "assets", "blueprint", `${slug}.html`), "utf8");
  assert(experienceHTML.includes('id="stick"') && experienceHTML.includes('type="module"'), "Embed the live renderer");
}
const referenceList = blueprintNodes.find(node => node.tagName === "ol" && node.attrs.some(attr => attr.name === "class" && attr.value === "blueprint-references"));
assert.equal(referenceList?.childNodes.filter(node => node.tagName === "li").length, 2, "Model references should use two semantic source entries");
assert(!blueprintHTML.includes("无人机原始网页实验："), "Remove the former standalone experiment credit");
for (const source of [
  "https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f",
  "https://experiments.thisiswhitespace.com/standalone/lathe-blueprint/models/drone_built.glb"
]) {
  assert(blueprintNodes.some(node => node.tagName === "a" && node.attrs.some(attr => attr.name === "href" && attr.value === source)), `Missing model source: ${source}`);
}
assert(home.includes("assets/articles/blueprint-cover.mp4"), "The circular homepage cover must animate too");
const cells = JSON.parse(await readFile(new URL("../src/content/cicada-cells.json", import.meta.url), "utf8"));
const cellsHTML = await readFile(join(root, cells.slug, "index.html"), "utf8");
const cellsNodes = [];
function inspectCells(node) {
  cellsNodes.push(node);
  for (const child of node.childNodes || []) inspectCells(child);
}
inspectCells(parse(cellsHTML));
const cellsAttribute = (node, name) => node.attrs?.find(attr => attr.name === name)?.value;
const cellsData = JSON.parse(nodeText(cellsNodes.find(node => cellsAttribute(node, "id") === "__NEXT_DATA__")));
const cellsArticle = cellsNodes.find(node => node.tagName === "article");
assert.deepEqual(cellsData.props.pageProps.content.frontmatter, cells, "Keep the cells article's title, author and date");
assert.deepEqual(
  JSON.parse(await readFile(join(root, "_next", "data", cellsData.buildId, `${cells.slug}.json`), "utf8")),
  cellsData.props,
  "Direct visits and client navigation must load the same cells article"
);
const renderedCells = compileArticle(cellsData.props.pageProps.content.code).default();
assert.equal(renderedText(renderedCells), nodeText(cellsArticle), "The complete cells article must survive hydration");
assert.equal(cellsData.props.pageProps.content.headings.at(-1).id, "reference", "End the article with the inspiration credit");
const cellsFrames = cellsNodes.filter(node => node.tagName === "iframe");
assert.equal(cellsFrames.length, 1, "The final section needs one live cells experience");
assert.equal(cellsAttribute(cellsFrames[0], "src"), `${manifest.basePath}/assets/cells/index.html`);
assert(cellsAttribute(cellsFrames[0], "title"), "Describe the embedded experience for assistive technology");
assert(cellsFrames[0].attrs.some(attr => attr.name === "allowfullscreen"), "Allow the experience's own fullscreen control");
const renderedFrame = [];
function inspectRenderedCells(node) {
  if (typeof node === "string") return;
  if (node.tag === "iframe") renderedFrame.push(node);
  for (const child of node.props.children || []) inspectRenderedCells(child);
}
inspectRenderedCells(renderedCells);
assert.equal(renderedFrame[0].props.allowFullScreen, true, "Preserve iframe fullscreen permission during hydration");
assert(!cellsNodes.some(node => cellsAttribute(node, "class")?.split(/\s+/).includes("cells-experience-actions")), "Remove the experience action block shown in the screenshot");
assert(!nodeText(cellsArticle).includes("下面就是完整的 HTML"), "Remove the experience introduction shown in the screenshot");
assert(cellsNodes.some(node => node.tagName === "a"
  && cellsAttribute(node, "href") === "https://x.com/secondeight_/status/2120519348804542930"), "Credit the original visual reference");
assert(home.includes(cells.title) && home.includes("assets/articles/cells-cover.webp"), "Link the new article from the homepage");
const cellsCoverFrame = parse(home).childNodes;
const previewFrames = [];
function inspectCover(node) {
  if (node.tagName === "iframe" && cellsAttribute(node, "data-cells-preview-src")) previewFrames.push(node);
  for (const child of node.childNodes || []) inspectCover(child);
}
cellsCoverFrame.forEach(inspectCover);
assert.equal(previewFrames.length, 1, "The cells cover needs one live animation preview");
assert.equal(cellsAttribute(previewFrames[0], "data-cells-preview-src"), `${manifest.basePath}/assets/cells/index.html#cover`);
assert.equal(cellsAttribute(previewFrames[0], "tabindex"), "-1", "The cover's article link should own keyboard navigation");
assert.equal(cellsAttribute(previewFrames[0], "aria-hidden"), "true", "The decorative animation should not duplicate the article link");
const cellsExperience = await readFile(join(root, "assets", "cells", "index.html"));
assert(cellsExperience.toString("utf8").includes('location.hash === "#cover"'), "Use the real cells renderer for the animated cover");
assert(cellsExperience.equals(await readFile(new URL("../src/cells/index.html", import.meta.url))), "Publish the complete standalone HTML unchanged");
const cellsExperienceDocument = parse(cellsExperience.toString("utf8"));
const cellsExperienceNodes = [];
function inspectExperience(node) {
  cellsExperienceNodes.push(node);
  for (const child of node.childNodes || []) inspectExperience(child);
}
inspectExperience(cellsExperienceDocument);
for (const id of ["scene", "add-cell", "remove-cell", "cell-count", "sound", "pause", "fullscreen"]) {
  assert(cellsExperienceNodes.some(node => cellsAttribute(node, "id") === id), `Keep the live control: ${id}`);
}
assert(cellsExperienceNodes.some(node => node.tagName === "a"
  && cellsAttribute(node, "href") === "https://github.com/theageofadzz"
  && nodeText(node).includes("cicada@github")), "Keep the final GitHub signature");
assert(!cellsExperienceNodes.some(node =>
  (node.tagName === "script" && cellsAttribute(node, "src"))
  || (node.tagName === "link" && cellsAttribute(node, "rel") === "stylesheet")),
  "The downloaded HTML must include its own scripts and styles");
for (const file of ["cells-overview.webp", "cells-counts.webp", "cells-cover.webp"]) {
  const image = await sharp(join(root, "assets", "articles", file)).metadata();
  assert(image.width > 0 && image.height > 0, `Expected an actual project image: ${file}`);
}
assert(tutorialHTML.includes("我觉得图形你已经复刻了"), "The tutorial must document the user's animation correction");
assert(!tutorialHTML.includes("列表有信息，打开后看动画") && !tutorialHTML.includes("我的意思打开后显示 gif") && !tutorialHTML.includes("weather-preview.mp4"), "The removed preview section must not return");
assert(!tutorialData.props.pageProps.content.headings.some(heading => heading.id === "作品列表与纯净预览"), "The table of contents must omit the removed preview section");
assert(tutorialHTML.includes("assets/works/weather.gif"), "The tutorial must retain the finished animation");
for (const name of ["align", "layers", "type", "gif", "check"]) {
  const study = tutorialNodes.find(node => node.tagName === "video"
    && node.attrs.some(attr => attr.name === "src" && attr.value.endsWith(`/weather-${name}.mp4`)));
  assert(study, `Missing animated implementation study: ${name}`);
  for (const attribute of ["data-weather-study", "muted", "loop", "playsinline"]) {
    assert(study.attrs.some(attr => attr.name === attribute), `Missing ${attribute} on ${name}`);
  }
  assert(!study.attrs.some(attr => attr.name === "controls" || attr.name === "autoplay"), "Implementation studies use viewport playback without controls");
  assert(study.attrs.some(attr => attr.name === "preload" && attr.value === "none"), "Offscreen studies must not preload their video data");
  const poster = `assets/articles/weather-${name}.webp`;
  assert(study.attrs.some(attr => attr.name === "poster" && attr.value.endsWith(poster)), "Each study needs a static fallback");
  const metadata = await sharp(join(root, poster)).metadata();
  assert.equal(metadata.width, 1120);
  assert.equal(metadata.height, 840);
}
const contactSheet = await sharp(join(root, "assets", "articles", "weather-frames.webp")).metadata();
assert.equal(contactSheet.width, 984);
assert.equal(contactSheet.height, 652);
assert(!projectHTML.includes('href="https://gamestation.cc/"') && !projectHTML.includes('href="https://github.com/theageofadzz/GameStation"'), "Project article must omit the removed preview and GitHub entry points");
const walkthrough = projectNodes.find(node => node.tagName === "video");
assert(walkthrough, "Expected an actual website walkthrough video");
for (const name of ["autoplay", "muted", "loop", "playsinline", "controls"]) {
  assert(walkthrough.attrs.some(attr => attr.name === name), `Walkthrough must retain ${name}`);
}
assert.equal(projectNodes.filter(node => node.tagName === "button" && node.attrs.some(attr => attr.name === "data-code-copy")).length, 4, "Expected four copyable code sections");
await assert.rejects(access(join(root, "interactive-design-in-ai")), "The replaced AI article must be removed");
for (const file of await readdir(root, { recursive: true })) {
  if (!/\.(?:html|js|json)$/.test(file)) continue;
  const source = await readFile(join(root, file), "utf8");
  assert(!source.includes("使用 AI 制作交互动画的建议") && !source.includes("interactive-design-in-ai"), `Obsolete AI article content remains in ${file}`);
  assert(!/小 p[：:]|Figma Make 的使用建议|制作有趣的界面：朋友圈广告年度评选/.test(source), `Removed reference article content remains in ${file}`);
}
console.log(`Validated ${checked} pages, their local links and assets, and the GitHub Pages configuration.`);
