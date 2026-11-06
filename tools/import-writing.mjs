import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse, serialize } from "parse5";
import { parse as parseJavaScript } from "acorn";
import sharp from "sharp";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const repository = "theageofadzz/centurypaw";
const contentRoot = join(root, "src", "content", "writing");
const assetRoot = join(root, "src", "assets", "writing");
const api = async path => (await exec("gh", ["api", `repos/${repository}/${path}`], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const revision = JSON.parse(await api("commits/main")).sha;
const sourceFile = async path => JSON.parse(await api(`contents/${encodeURIComponent(path)}?ref=${revision}`));
const decode = async file => {
  const blob = file.encoding === "base64" ? file : JSON.parse(await api(`git/blobs/${file.sha}`));
  return Buffer.from(blob.content, "base64");
};
const readSource = async path => (await decode(await sourceFile(path))).toString("utf8");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}
function walkJavaScript(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walkJavaScript(child, visit));
    else if (value && typeof value === "object") walkJavaScript(value, visit);
  }
}

function articleItems(html) {
  const items = [];
  walk(parse(html), node => {
    if (node.tagName !== "script" || attr(node, "src")) return;
    walkJavaScript(parseJavaScript(text(node), { ecmaVersion: "latest" }), expression => {
      if (expression.type !== "ObjectExpression") return;
      const item = Object.fromEntries(expression.properties
        .filter(property => property.value?.type === "Literal")
        .map(property => [property.key.name || property.key.value, property.value.value]));
      if (item.type === "文章" && (item.href || item.source)?.endsWith(".html")) items.push(item);
    });
  });
  return items;
}

const items = articleItems(await readSource("index.html"));
const related = articleItems(await readSource("content.html"));
if (!items.length) throw new Error("No articles found in the centurypaw index.");
await mkdir(contentRoot, { recursive: true });
await mkdir(assetRoot, { recursive: true });
const articles = [];
for (const item of items) {
  const path = item.href;
  const slug = path.replace(/\.html$/, "");
  const source = parse(await readSource(path));
  let article, subtitle;
  walk(source, node => {
    if (node.attrs?.some(item => item.name === "data-reading-article")) article = node;
    if (attr(node, "data-i18n") === "subtitle") subtitle = text(node).trim();
  });
  if (!article) throw new Error(`Missing article body in ${path}.`);
  await writeFile(join(contentRoot, path), `${serialize(article).trim()}\n`);
  const image = item.image || related.find(entry => entry.source === path)?.image;
  let cover;
  if (image) {
    const file = await sourceFile(image);
    await sharp(await decode(file)).rotate().resize(720, 540, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(join(assetRoot, `${slug}.webp`));
    cover = `assets/writing/${slug}.webp`;
  }
  articles.push({
    slug,
    title: item.title,
    description: item.desc,
    subtitle,
    category: item.tag,
    publishedAt: item.date,
    sourcePath: path,
    ...(cover ? { cover } : {})
  });
  console.log(`Imported ${item.title}`);
}
articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
await writeFile(join(contentRoot, "manifest.json"), `${JSON.stringify({ repository, revision, articles }, null, 2)}\n`);
console.log(`Imported ${articles.length} original articles from ${repository}@${revision.slice(0, 7)}.`);
