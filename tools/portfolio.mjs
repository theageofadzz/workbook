import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, parseFragment, serialize } from "parse5";
import { parse as parseJavaScript } from "acorn";

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
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
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor"
};
function reactNode(node, runtime) {
  if (node.nodeName === "#text") return JSON.stringify(node.value);
  const properties = Object.fromEntries((node.attrs || []).map(({ name, value }) =>
    [reactAttributes[name] || name, value]
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

function replaceFeaturedItem(source, frontmatter, cover) {
  let featured;
  visitJavaScript(parseJavaScript(source, { ecmaVersion: "latest" }), node => {
    if (node.type !== "ObjectExpression") return;
    const slug = node.properties.find(property => property.key?.name === "slug");
    const children = node.properties.find(property => property.key?.name === "children");
    if (slug?.value.value === frontmatter.slug && children) featured = { node, children };
  });
  if (!featured) throw new Error("Could not find the featured portfolio entry.");
  const { node, children } = featured;
  const factory = children.value.callee?.expressions?.at(-1) || children.value.callee;
  if (factory?.type !== "MemberExpression") throw new Error("Unexpected featured cover factory.");
  const runtime = source.slice(factory.object.start, factory.object.end);
  const replacement = `{${Object.entries(frontmatter).filter(([key]) => key !== "comments")
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`).join(",")},children:${reactNode(cover, runtime)}}`;
  return source.slice(0, node.start) + replacement + source.slice(node.end);
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

export async function personalizePortfolio({ root, out, base }) {
  const contentRoot = join(root, "src", "content");
  const logoStudy = await readFile(join(root, "src", "assets", "intensea-golden-ratio.svg"), "utf8");
  await writeFile(join(out, "assets", "intensea-golden-ratio.svg"), logoStudy);
  const frontmatter = JSON.parse(await readFile(join(contentRoot, "portfolio-design.json"), "utf8"));
  const coverHTML = (await readFile(join(contentRoot, "portfolio-cover.html"), "utf8")).replaceAll("{{base}}", base).trim();
  const cover = parseFragment(coverHTML).childNodes[0];
  const articleHTML = (await readFile(join(contentRoot, "portfolio-design.html"), "utf8"))
    .replaceAll("{{base}}", base)
    .replaceAll("{{logoStudy}}", logoStudy)
    .replaceAll("{{description}}", frontmatter.description)
    .replaceAll("{{cover}}", coverHTML).trim();
  const article = parseFragment(articleHTML).childNodes[0];
  const headings = [];
  walk(article, node => {
    if (node.tagName === "h2") headings.push({ text: text(node), id: attr(node, "id") });
  });
  const code = `return {default:function(){return ${reactNode(article, "_jsx_runtime")};}};`;

  const homepagePath = join(out, "index.html");
  const homepage = parse(await readFile(homepagePath, "utf8"));
  const titleLink = find(homepage, node => node.tagName === "a"
    && attr(node, "href") === `${base}/${frontmatter.slug}`
    && attr(node, "class")?.includes("font-[Weixin]"));
  if (!titleLink) throw new Error("Could not find the static featured entry.");
  const intro = titleLink.parentNode;
  const byline = intro.childNodes.find(node => attr(node, "class")?.includes("font-mono"));
  const description = intro.childNodes.find(node => attr(node, "class")?.includes("whitespace-break-spaces"));
  updateByline(byline, frontmatter);
  setText(titleLink, frontmatter.title);
  setText(description, frontmatter.description);
  const columns = intro.parentNode.childNodes.filter(node => node.tagName);
  setHTML(columns[1], coverHTML);
  await writeFile(homepagePath, serialize(homepage));

  const articlePath = join(out, frontmatter.slug, "index.html");
  const document = parse(await readFile(articlePath, "utf8"));
  const script = find(document, node => attr(node, "id") === "__NEXT_DATA__");
  const data = JSON.parse(text(script));
  data.props.pageProps.content = { frontmatter, headings, code };
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
  await writeFile(articlePath, serialize(document));
  await writeFile(join(out, "_next", "data", data.buildId, `${frontmatter.slug}.json`), JSON.stringify(data.props));

  const chunks = join(out, "_next", "static", "chunks");
  const homepageChunk = join(chunks, "2ka_qt01g8-f4.js");
  await writeFile(homepageChunk, replaceFeaturedItem(await readFile(homepageChunk, "utf8"), frontmatter, cover));
  const articleChunk = join(chunks, "34ch75b_hd0t9.js");
  let client = await readFile(articleChunk, "utf8");
  client = client.replace(
    'Z[6]===Symbol.for("react.memo_cache_sentinel")?(c=(0,t.jsx)("meta",{name:"author",content:"Aragakey."}),Z[6]=c):c=Z[6]',
    'c=(0,t.jsx)("meta",{name:"author",content:et.author||"Aragakey."})'
  );
  client = client.replace('children:[$,K,U,V,J]', 'children:[$,K,U,V,et.comments===!1?null:J]');
  if (!client.includes('content:et.author||"Aragakey."') || !client.includes("et.comments===!1?null:J")) {
    throw new Error("Could not personalize the article metadata and discussion section.");
  }
  await writeFile(articleChunk, client);

  const manifestPath = join(out, "site-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.pages.find(page => page.route === `/${frontmatter.slug}`).title = frontmatter.title;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
