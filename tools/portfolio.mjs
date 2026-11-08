import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, parseFragment, serialize, serializeOuter } from "parse5";
import { parse as parseJavaScript } from "acorn";
import { cursorMarkup } from "./cursor.mjs";
import { writeWeatherFrames } from "./weather-frames.mjs";

function walk(node, visit) {
  visit(node);
  for (const child of [...node.childNodes || []]) walk(child, visit);
}

const text = node => node.nodeName === "#text"
  ? node.value
  : (node.childNodes || []).map(text).join("");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function setAttr(node, name, value) {
  const existing = node.attrs.find(item => item.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
}
function setText(node, value) {
  node.childNodes = [{ nodeName: "#text", value, parentNode: node }];
}
function setHTML(node, html) {
  node.childNodes = parseFragment(html).childNodes;
  for (const child of node.childNodes) child.parentNode = node;
}
function find(node, predicate) {
  let found;
  walk(node, child => { if (!found && predicate(child)) found = child; });
  return found;
}

// Compile the same semantic HTML for static output and React hydration.
const reactAttributes = {
  class: "className",
  autoplay: "autoPlay",
  playsinline: "playsInline",
  tabindex: "tabIndex",
  datetime: "dateTime",
  srcset: "srcSet",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor"
};
const booleanAttributes = new Set(["autoplay", "controls", "loop", "muted", "playsinline"]);
function reactNode(node, runtime) {
  if (node.nodeName === "#text") return JSON.stringify(node.value);
  const properties = Object.fromEntries((node.attrs || []).map(({ name, value }) =>
    [reactAttributes[name] || name, booleanAttributes.has(name) ? true : value]
  ));
  const children = (node.childNodes || []).filter(child => child.nodeName !== "#comment");
  const props = Object.entries(properties).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  if (children.length) props.push(`children:[${children.map(child => reactNode(child, runtime)).join(",")}]`);
  return `${runtime}.jsxs(${JSON.stringify(node.tagName)},{${props.join(",")}})`;
}

function visitJavaScript(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visitJavaScript(child, visit));
    else if (value && typeof value === "object") visitJavaScript(value, visit);
  }
}

function updateByline(container, frontmatter) {
  walk(container, node => {
    if (node.tagName === "span" && node.childNodes.every(child => child.nodeName === "#text")
      && /^\d{4}-\d{2}-\d{2}$/.test(text(node))) {
      setText(node, frontmatter.publishedAt);
    }
    if (node.tagName === "a") {
      setAttr(node, "href", frontmatter.authorLink);
      setText(node, frontmatter.author);
    }
  });
}

export async function personalizePortfolio({ root, out, base, footer }) {
  const contentRoot = join(root, "src", "content");
  const logoStudy = await readFile(join(root, "src", "assets", "intensea-golden-ratio.svg"), "utf8");
  await writeFile(join(out, "assets", "intensea-golden-ratio.svg"), logoStudy);
  await copyFile(join(root, "src", "assets", "hokusai-great-wave.png"), join(out, "assets", "hokusai-great-wave.png"));
  await copyFile(join(root, "src", "assets", "the-age-of-adz.png"), join(out, "assets", "the-age-of-adz.png"));
  for (const file of ["icon-browse-grid.webp", "icon-browse-first.webp", "cicada-avatar.webp"]) {
    await copyFile(join(root, "src", "assets", file), join(out, "assets", file));
  }
  for (const file of [
    "gamestation-gallery.webp", "gamestation-open-case.webp", "gamestation-browse.webp",
    "gamestation-walkthrough.mp4", "gamestation-trophies.webp", "gamestation-background.webp"
  ]) {
    await copyFile(join(root, "src", "assets", file), join(out, "assets", file));
  }
  await writeWeatherFrames({ root, out });
  for (const file of [
    "weather-x-browse.mp4", "weather-x-browse.webp",
    ...["align", "layers", "type", "gif", "preview", "check"].flatMap(name =>
      [`weather-${name}.mp4`, `weather-${name}.webp`])
  ]) {
    await copyFile(join(root, "src", "assets", "articles", file), join(out, "assets", "articles", file));
  }
  const retiredContent = [];
  const compiledArticles = [];
  for (const entry of [
    {
      name: "portfolio-design",
      cover: "portfolio-cover",
      articleCover: "portfolio-article-cover",
      sourceSlug: "wxad12"
    },
    { name: "gamestation", cover: "gamestation-cover", sourceSlug: "interactive-design-in-ai" },
    {
      name: "weather-recreation",
      cover: "weather-cover",
      sourceSlug: "weather-recreation",
      templateSlug: "wxad12"
    }
  ]) {
    const result = await personalizeArticle({ contentRoot, out, base, logoStudy, footer, ...entry });
    retiredContent.push(...result.retiredContent);
    compiledArticles.push(result.compiled);
  }
  // Next's static route registry and client data must use the new project URL too.
  for (const file of await readdir(out, { recursive: true })) {
    if (!/\.(?:html|js|json|xml)$/.test(file)) continue;
    const path = join(out, file);
    const source = await readFile(path, "utf8");
    const updated = source.replaceAll("interactive-design-in-ai", "gamestation");
    if (source !== updated) await writeFile(path, updated);
  }
  const articleChunk = join(out, "_next", "static", "chunks", "34ch75b_hd0t9.js");
  let client = await readFile(articleChunk, "utf8");
  let compiler;
  visitJavaScript(parseJavaScript(client, { ecmaVersion: "latest" }), node => {
    if (node.type === "FunctionDeclaration" && node.id?.name === "i"
      && /return Function\(\.\.\.Object\.keys\(r\),e\)|case "workbook:/.test(client.slice(node.start, node.end))) compiler = node;
  });
  if (!compiler) throw new Error("Could not find the article compiler.");
  const precompiled = compiledArticles.map(({ token, code }) =>
    `case ${JSON.stringify(token)}:return(function(_jsx_runtime){${code}})(s);`
  ).join("");
  const replacement = `function i(e,t){switch(e){${precompiled}}throw new Error("Unknown workbook article")}`;
  client = client.slice(0, compiler.start) + replacement + client.slice(compiler.end);
  client = client.replace(
    'Z[6]===Symbol.for("react.memo_cache_sentinel")?(c=(0,t.jsx)("meta",{name:"author",content:"Aragakey."}),Z[6]=c):c=Z[6]',
    'c=(0,t.jsx)("meta",{name:"author",content:et.author||"cicada@github"})'
  );
  client = client.replace('content:et.author||"Aragakey."', 'content:et.author||"cicada@github"');
  client = client.replace('children:[$,K,U,V,J]', 'children:[$,K,U,V,et.comments===!1?null:J]');
  if (!client.includes('content:et.author||"cicada@github"') || !client.includes("et.comments===!1?null:J")) {
    throw new Error("Could not personalize the article metadata and discussion section.");
  }
  await writeFile(articleChunk, client);
  return retiredContent;
}

async function personalizeArticle({
  contentRoot,
  out,
  base,
  footer,
  logoStudy,
  name,
  cover: coverName,
  articleCover: articleCoverName = coverName,
  sourceSlug,
  templateSlug
}) {
  const frontmatter = JSON.parse(await readFile(join(contentRoot, `${name}.json`), "utf8"));
  const coverHTML = (await readFile(join(contentRoot, `${coverName}.html`), "utf8"))
    .replaceAll("{{base}}", base).replaceAll("{{cursor}}", cursorMarkup).trim();
  const articleCoverHTML = (await readFile(join(contentRoot, `${articleCoverName}.html`), "utf8"))
    .replaceAll("{{base}}", base)
    .replaceAll("{{cursor}}", cursorMarkup)
    .trim();
  let articleHTML = (await readFile(join(contentRoot, `${name}.html`), "utf8"))
    .replaceAll("{{footer}}", footer)
    .replaceAll("{{base}}", base)
    .replaceAll("{{logoStudy}}", logoStudy)
    .replaceAll("{{cursor}}", cursorMarkup)
    .replaceAll("{{description}}", frontmatter.description)
    .replaceAll("{{cover}}", articleCoverHTML).trim();
  for (const [, icon] of articleHTML.matchAll(/\{\{icon:([a-z-]+)\}\}/g)) {
    const svg = await readFile(new URL(`../node_modules/lucide-static/icons/${icon}.svg`, import.meta.url), "utf8");
    articleHTML = articleHTML.replaceAll(`{{icon:${icon}}}`, svg.replace("<svg", '<svg aria-hidden="true"'));
  }
  const article = parseFragment(articleHTML).childNodes[0];
  const headings = [];
  walk(article, node => {
    if (node.tagName === "h2") headings.push({ text: text(node), id: attr(node, "id") });
  });
  const code = `return {default:function(){return ${reactNode(article, "_jsx_runtime")};}};`;
  const token = `workbook:${frontmatter.slug}`;

  const homepagePath = join(out, "index.html");
  const homepage = parse(await readFile(homepagePath, "utf8"));
  let titleLink = find(homepage, node => node.tagName === "a"
    && [frontmatter.slug, sourceSlug].some(slug => attr(node, "href")?.replace(/\/$/, "") === `${base}/${slug}`)
    && attr(node, "class")?.includes("font-[Weixin]"));
  if (!titleLink && templateSlug) {
    const templateLink = find(homepage, node => node.tagName === "a"
      && attr(node, "href")?.replace(/\/$/, "") === `${base}/${templateSlug}`
      && attr(node, "class")?.includes("font-[Weixin]"));
    let templateCard = templateLink;
    while (templateCard && attr(templateCard, "class") !== "mb-12") templateCard = templateCard.parentNode;
    if (!templateCard) throw new Error(`Could not find the homepage template for ${frontmatter.slug}.`);
    const card = parseFragment(serializeOuter(templateCard)).childNodes[0];
    card.parentNode = templateCard.parentNode;
    const siblings = templateCard.parentNode.childNodes;
    siblings.splice(siblings.indexOf(templateCard), 0, card);
    walk(card, node => {
      if (node.tagName === "a" && attr(node, "href")?.replace(/\/$/, "") === `${base}/${templateSlug}`) {
        setAttr(node, "href", `${base}/${frontmatter.slug}`);
      }
    });
    titleLink = find(card, node => node.tagName === "a" && attr(node, "class")?.includes("font-[Weixin]"));
  }
  if (!titleLink) throw new Error("Could not find the static featured entry.");
  const intro = titleLink.parentNode;
  const byline = intro.childNodes.find(node => attr(node, "class")?.includes("font-mono"));
  const description = intro.childNodes.find(node => attr(node, "class")?.includes("whitespace-break-spaces"));
  updateByline(byline, frontmatter);
  setText(titleLink, frontmatter.title);
  setAttr(titleLink, "href", `${base}/${frontmatter.slug}`);
  setText(description, frontmatter.description);
  const columns = intro.parentNode.childNodes.filter(node => node.tagName);
  const retiredContent = [serialize(columns[1])];
  setHTML(columns[1], coverHTML);
  await writeFile(homepagePath, serialize(homepage));

  const articlePath = join(out, frontmatter.slug, "index.html");
  let previousArticle;
  try { previousArticle = await readFile(articlePath, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    previousArticle = await readFile(join(out, templateSlug || sourceSlug, "index.html"), "utf8");
  }
  retiredContent.push(previousArticle);
  const document = parse(previousArticle);
  walk(document, node => {
    if (node.tagName !== "link" || attr(node, "rel") !== "preload" || attr(node, "as") !== "image") return;
    const siblings = node.parentNode.childNodes;
    siblings.splice(siblings.indexOf(node), 1);
  });
  const script = find(document, node => attr(node, "id") === "__NEXT_DATA__");
  const data = JSON.parse(text(script));
  data.props.pageProps.content = { frontmatter, headings, code: token };
  if (data.query?.slug) data.query.slug = frontmatter.slug;
  setText(script, JSON.stringify(data).replaceAll("<", "\\u003c"));
  const title = find(document, node => node.tagName === "h1");
  const body = title.parentNode;
  const metadata = body.childNodes.find(node => attr(node, "class")?.includes("font-mono"));
  updateByline(metadata, frontmatter);
  setText(title, frontmatter.title);
  body.childNodes = [metadata, title, article];
  for (const node of body.childNodes) node.parentNode = body;
  const navigation = find(document, node => node.tagName === "nav" && attr(node, "class")?.includes("fixed hidden"));
  const toc = navigation.childNodes.find(node => attr(node, "class")?.includes("grid gap-2"));
  setHTML(toc, headings.map(heading => `<div><a href="#${heading.id}" class="hover:text-blue-500">${heading.text}</a></div>`).join(""));
  walk(document, node => {
    if (node.tagName !== "meta") return;
    const name = attr(node, "name") || attr(node, "property");
    if (["description", "og:description"].includes(name)) setAttr(node, "content", frontmatter.description);
    if (name === "author") setAttr(node, "content", frontmatter.author);
    if (name === "og:title") setAttr(node, "content", frontmatter.title);
  });
  await mkdir(join(out, frontmatter.slug), { recursive: true });
  await writeFile(articlePath, serialize(document));
  await writeFile(join(out, "_next", "data", data.buildId, `${frontmatter.slug}.json`), JSON.stringify(data.props));
  if (sourceSlug !== frontmatter.slug) {
    await rm(join(out, sourceSlug), { recursive: true, force: true });
    await rm(join(out, "_next", "data", data.buildId, `${sourceSlug}.json`), { force: true });
  }

  const manifestPath = join(out, "site-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const page = manifest.pages.find(page => [frontmatter.slug, sourceSlug].some(slug => page.route === `/${slug}`));
  const record = { title: frontmatter.title, route: `/${frontmatter.slug}`, file: `${frontmatter.slug}/index.html` };
  if (page) Object.assign(page, record);
  else manifest.pages.push(record);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return { retiredContent, compiled: { token, code } };
}
