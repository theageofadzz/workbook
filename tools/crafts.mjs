import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseFragment, serialize } from "parse5";

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

export async function writeCraftsPage({ root, out, base, browserTitle, faviconSrc, logoSrc }) {
  const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));
  const contentRoot = join(root, "src", "content", "writing");
  const snapshot = JSON.parse(await readFile(join(contentRoot, "manifest.json"), "utf8"));
  const articles = [];
  for (const entry of snapshot.articles) {
    const { plainText, ...body } = await articleBody(join(contentRoot, entry.sourcePath));
    articles.push({ ...entry, ...body, searchText: `${entry.title} ${entry.category} ${plainText}` });
  }
  // Keep the complete original gallery available as a second view.
  let gallery;
  let galleryDataPath;
  let galleryData;
  for (const build of await readdir(join(out, "_next", "data"))) {
    try {
      galleryDataPath = join(out, "_next", "data", build, "crafts.json");
      galleryData = JSON.parse(await readFile(galleryDataPath, "utf8"));
      gallery = galleryData.pageProps.dataSource;
      break;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!gallery?.length) throw new Error("The original crafts archive must remain available.");
  for (const item of gallery) {
    for (const key of ["imageUrl", "posterUrl", "videoUrl"]) {
      if (!item[key] || /^(?:https?:)?\//.test(item[key])) continue;
      item[key] = key === "videoUrl"
        ? new URL(item[key], `${config.source}/`).href
        : `${base}/${item[key]}`;
    }
  }
  await writeFile(galleryDataPath, JSON.stringify(galleryData));
  const css = await readFile(join(root, "src", "crafts.css"), "utf8");
  const js = await readFile(join(root, "src", "crafts.js"), "utf8");
  const hash = source => createHash("sha256").update(source).digest("hex").slice(0, 8);
  const categories = [...new Set(articles.map(article => article.category))];
  const replacements = {
    base,
    browserTitle,
    favicon: faviconSrc,
    logo: logoSrc,
    cssVersion: hash(css),
    jsVersion: hash(js),
    articleCount: String(articles.length).padStart(2, "0"),
    galleryCount: gallery.length,
    categories: categories.map(category => `<button type="button" data-category="${escape(category)}" aria-pressed="false">${escape(category)}</button>`).join(""),
    articles: articles.map((article, index) => `
      <li class="writing-entry" data-category="${escape(article.category)}" data-slug="${article.slug}">
        <a class="writing-link" href="?read=${article.slug}" data-open-article="${article.slug}" aria-haspopup="dialog">
          <div class="writing-entry-meta"><span>${String(index + 1).padStart(2, "0")}</span><span>${escape(article.category)}</span><time datetime="${article.publishedAt}">${article.publishedAt.replaceAll("-", ".")}</time></div>
          <div class="writing-entry-main">
            <div class="writing-entry-copy"><h2>${escape(article.title)}</h2><p>${escape(article.description)}</p></div>
            ${article.cover ? `<img class="writing-thumbnail" src="${base}/${article.cover}" alt="" width="100" height="112" loading="lazy" decoding="async">` : ""}
          </div>
          <div class="writing-entry-bottom"><span>${article.minutes} 分钟阅读</span><span class="writing-entry-arrow" aria-hidden="true">{{icon:arrow-up-right}}</span></div>
        </a>
      </li>`).join(""),
    data: JSON.stringify({ articles, gallery }).replaceAll("<", "\\u003c")
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
  await writeFile(join(out, "crafts", "index.html"), html.replace(/^[ \t]+$/gm, ""));
  await writeFile(join(out, "crafts.css"), css);
  await writeFile(join(out, "crafts.js"), js);
  console.log(`Published ${articles.length} original essays and retained ${gallery.length} crafts.`);
}
