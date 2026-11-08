import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseFragment, serialize } from "parse5";
import { build } from "esbuild";
import { cursorMarkup } from "./cursor.mjs";

const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

async function articleBody(path) {
  const document = parseFragment(await readFile(path, "utf8"));
  const allowed = new Set(["p", "h2", "h3", "h4", "a", "em", "strong", "b", "i", "br", "hr", "blockquote", "pre", "code", "ul", "ol", "li", "div", "span", "iframe"]);
  function clean(node) {
    node.childNodes = (node.childNodes || []).filter(child => child.nodeName === "#text" || allowed.has(child.tagName));
    for (const child of node.childNodes) {
      child.attrs = (child.attrs || []).filter(({ name, value }) =>
        (child.tagName === "a" && name === "href" && /^https?:\/\//.test(value))
        || (child.tagName === "iframe" && name === "src" && /^https:\/\/www\.youtube\.com\/embed\/[\w-]+$/.test(value))
      );
      if (child.tagName === "a") child.attrs.push({ name: "target", value: "_blank" }, { name: "rel", value: "noopener noreferrer" });
      if (child.tagName === "iframe") {
        const source = child.attrs.find(item => item.name === "src");
        if (!source) throw new Error(`Unexpected embedded media in ${path}`);
        source.value = source.value.replace("www.youtube.com", "www.youtube-nocookie.com");
        child.attrs.push(
          { name: "title", value: "原文中的音乐视频" },
          { name: "loading", value: "lazy" },
          { name: "allowfullscreen", value: "" },
          { name: "referrerpolicy", value: "strict-origin-when-cross-origin" }
        );
      }
      clean(child);
    }
  }
  clean(document);
  const headings = [];
  walk(document, node => {
    if (!["h2", "h3"].includes(node.tagName)) return;
    const id = `reading-section-${headings.length + 1}`;
    node.attrs.push({ name: "id", value: id });
    headings.push({ id, text: text(node), level: node.tagName });
  });
  const plainText = text(document).replace(/\s+/g, "");
  return { html: serialize(document).trim(), plainText, headings, minutes: Math.max(1, Math.ceil(plainText.length / 350)) };
}

export async function writeCraftsPage({ root, out, base, browserTitle, faviconSrc, logoSrc, footer, scrollExpandVersion }) {
  const contentRoot = join(root, "src", "content", "writing");
  const snapshot = JSON.parse(await readFile(join(contentRoot, "manifest.json"), "utf8"));
  const { works } = JSON.parse(await readFile(join(root, "src", "content", "works.json"), "utf8"));
  const articles = [];
  for (const entry of snapshot.articles) {
    const { plainText, ...body } = await articleBody(join(contentRoot, entry.sourcePath));
    articles.push({ ...entry, ...body, searchText: `${entry.title} ${entry.category} ${plainText}` });
  }
  // Retire the old gallery data and media even when building from checked-in docs.
  for (const build of await readdir(join(out, "_next", "data"))) {
    await rm(join(out, "_next", "data", build, "crafts.json"), { force: true });
  }
  await mkdir(join(out, "crafts"), { recursive: true });
  for (const entry of await readdir(join(out, "crafts"), { withFileTypes: true })) {
    if (entry.isDirectory()) await rm(join(out, "crafts", entry.name), { recursive: true });
  }
  const css = await readFile(join(root, "src", "crafts.css"), "utf8");
  const js = await readFile(join(root, "src", "crafts.js"), "utf8");
  const hash = source => createHash("sha256").update(source).digest("hex").slice(0, 8);
  async function bundle(file, define = {}) {
    const result = await build({
      entryPoints: [join(root, "src", file)], bundle: true, write: false, minify: true,
      format: "esm", target: "es2020", legalComments: "eof", define
    });
    return result.outputFiles[0].text;
  }
  const paperWorker = await bundle("paper-crumple-worker.js");
  const paperJS = await bundle("paper-crumple.js", { PAPER_WORKER_VERSION: JSON.stringify(hash(paperWorker)) });
  await writeFile(join(out, "paper-crumple-worker.js"), paperWorker);
  await writeFile(join(out, "paper-crumple.js"), paperJS);
  const licenses = await Promise.all([
    join(root, "src", "licenses", "react-bits.txt"),
    join(root, "node_modules", "three", "LICENSE"),
    join(root, "node_modules", "html-to-image", "LICENSE")
  ].map(file => readFile(file, "utf8")));
  await writeFile(join(out, "paper-crumple-LICENSE.txt"), licenses.join("\n\n---\n\n"));
  function previewContent(article) {
    const document = parseFragment(article.html);
    const paragraphs = [];
    walk(document, node => {
      if (node.tagName === "p" && text(node).trim() && paragraphs.length < 6) {
        paragraphs.push(`<p>${escape(text(node).trim())}</p>`);
      }
    });
    return paragraphs.join("");
  }
  const replacements = {
    footer,
    base,
    browserTitle,
    favicon: faviconSrc,
    logo: logoSrc,
    scrollExpandVersion,
    cssVersion: hash(css),
    jsVersion: hash(js),
    paperVersion: hash(paperJS),
    articles: works.map(work => `
      <article class="writing-entry" data-slug="${escape(work.slug)}">
        <a class="writing-link crafts-card" href="?work=${encodeURIComponent(work.slug)}" data-open-work="${escape(work.slug)}" aria-haspopup="dialog" aria-label="查看作品：${escape(work.title)}">
          <picture class="work-preview">
            <source media="(prefers-reduced-motion: reduce)" srcset="${base}/${escape(work.poster)}">
            <img src="${base}/${escape(work.media)}" alt="${escape(work.title)}" width="${work.width}" height="${work.height}" decoding="async">
          </picture>
          <div class="crafts-caption"><h2>${escape(work.title)}</h2><div class="crafts-caption-meta"><time datetime="${work.publishedAt}">${work.publishedAt}</time><span class="crafts-category">${escape(work.category)}</span></div></div>
        </a>
      </article>`).join("") + articles.map(article => `
      <article class="writing-entry" data-slug="${article.slug}">
        <a class="writing-link crafts-card" href="?read=${article.slug}" data-open-article="${article.slug}" aria-haspopup="dialog" aria-label="阅读：${escape(article.title)}">
          <div class="article-preview" aria-hidden="true">
            <div class="article-preview-canvas">
              <div class="article-preview-sheet">
                <div class="preview-article">
                  <p class="preview-date">${article.publishedAt.replaceAll("-", ".")}</p>
                  <div class="preview-title">${escape(article.title)}</div>
                  <p class="preview-subtitle">${escape(article.subtitle || article.description)}</p>
                  ${article.cover ? `<img class="preview-cover" src="${base}/${article.cover}" alt="" loading="lazy" decoding="async">` : ""}
                  <div class="preview-body">${previewContent(article)}</div>
                  <div class="preview-end">· · ·</div>
                </div>
              </div>
            </div>
            <span class="preview-scrollbar"><span></span></span>
            <span class="preview-cursor">${cursorMarkup}</span>
          </div>
          <div class="crafts-caption"><h2>${escape(article.title)}</h2><div class="crafts-caption-meta"><time datetime="${article.publishedAt}">${article.publishedAt}</time><span class="crafts-category">${escape(article.category)}</span></div></div>
        </a>
      </article>`).join(""),
    data: JSON.stringify({ articles, works }).replaceAll("<", "\\u003c")
  };
  let html = await readFile(join(root, "src", "content", "crafts.html"), "utf8");
  for (const [name, value] of Object.entries(replacements)) html = html.replaceAll(`{{${name}}}`, value);
  for (const name of new Set([...html.matchAll(/\{\{icon:([\w-]+)\}\}/g)].map(match => match[1]))) {
    const icon = (await readFile(join(root, "node_modules", "lucide-static", "icons", `${name}.svg`), "utf8"))
      .replace("<svg", '<svg aria-hidden="true" focusable="false"');
    html = html.replaceAll(`{{icon:${name}}}`, icon);
  }
  await mkdir(join(out, "crafts"), { recursive: true });
  await mkdir(join(out, "assets", "writing"), { recursive: true });
  for (const article of articles) {
    if (article.cover) await copyFile(join(root, "src", article.cover), join(out, article.cover));
  }
  await mkdir(join(out, "assets", "works"), { recursive: true });
  for (const work of works) {
    for (const asset of [work.media, work.poster]) {
      await copyFile(join(root, "src", asset), join(out, asset));
    }
  }
  await writeFile(join(out, "crafts", "index.html"), html.replace(/^[ \t]+$/gm, ""));
  await writeFile(join(out, "crafts.css"), css);
  await writeFile(join(out, "crafts.js"), js);
  console.log(`Published ${works.length} works and ${articles.length} cicada essays.`);
}
