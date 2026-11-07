import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseFragment, serialize } from "parse5";

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 8);
const allowedTags = new Set(["article", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "a", "img", "br", "hr", "strong", "em", "b", "i", "s", "del", "sup", "sub", "blockquote", "pre", "code", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "details", "summary", "picture", "source", "kbd"]);

function cleanReadme(source, repository, base, names) {
  const document = parseFragment(source);
  function clean(node) {
    node.childNodes = (node.childNodes || []).filter(child => child.nodeName === "#text" || allowedTags.has(child.tagName));
    for (const child of node.childNodes) {
      const attrs = new Map((child.attrs || []).map(attr => [attr.name, attr.value]));
      child.attrs = [];
      for (const name of ["id", "title", "alt", "colspan", "rowspan", "open"]) {
        if (attrs.has(name)) child.attrs.push({ name, value: name === "id" ? attrs.get(name).replace(/^user-content-/, "") : attrs.get(name) });
      }
      if (child.tagName === "img") {
        for (const name of ["width", "height"]) {
          if (/^\d{1,4}$/.test(attrs.get(name) || "")) child.attrs.push({ name, value: attrs.get(name) });
        }
      }
      if (child.tagName === "img" && attrs.has("src")) {
        const url = new URL(attrs.get("src"), `https://raw.githubusercontent.com/theageofadzz/${repository.name}/${repository.branch}/`);
        if (url.protocol === "https:") child.attrs.push({ name: "src", value: url.href }, { name: "loading", value: "lazy" }, { name: "decoding", value: "async" });
      }
      if (child.tagName === "a" && attrs.has("href")) {
        const href = attrs.get("href");
        const url = new URL(href, `${repository.url}/blob/${repository.branch}/`);
        if (href.startsWith("#")) child.attrs.push({ name: "href", value: href });
        else if (url.protocol === "https:") {
          const [, username, repo] = url.pathname.split("/");
          if (url.hostname === "github.com" && username === "theageofadzz" && names.has(repo)) {
            child.attrs.push({ name: "href", value: `${base}/github/?repo=${encodeURIComponent(repo)}` });
          } else if (url.hostname === "theageofadzz.github.io" && url.pathname.startsWith(`${base}/`)) {
            child.attrs.push({ name: "href", value: url.pathname + url.search + url.hash });
          } else {
            child.attrs.push({ name: "href", value: url.href }, { name: "target", value: "_blank" }, { name: "rel", value: "noopener noreferrer" });
          }
        }
      }
      clean(child);
    }
  }
  clean(document);
  return serialize(document);
}

export async function writeGitHubPage({ root, out, base, browserTitle, faviconSrc, logoSrc }) {
  const snapshot = JSON.parse(await readFile(join(root, "src", "content", "github.json"), "utf8"));
  const names = new Set(snapshot.repos.map(repo => repo.name));
  const repos = snapshot.repos.map(repo => ({ ...repo, readme: cleanReadme(repo.readme, repo, base, names) }));
  const css = await readFile(join(root, "src", "github.css"), "utf8");
  const js = await readFile(join(root, "src", "github.js"), "utf8");
  const profileCSS = await readFile(join(root, "src", "about.css"), "utf8");
  const profileJS = await readFile(join(root, "src", "about.js"), "utf8");
  let html = await readFile(join(root, "src", "content", "github.html"), "utf8");
  // Reuse the existing dock so every standalone page retains the same navigation.
  const about = await readFile(join(root, "src", "content", "about.html"), "utf8");
  const dock = about.slice(about.indexOf('  <nav class="profile-dock"'), about.indexOf("</body>"))
    .replace(' aria-current="page"', "")
    .replace('data-label-en="GitHub profile"', 'data-label-en="GitHub profile" aria-current="page"');
  html = html.replaceAll("{{dock}}", dock);
  const totalStars = repos.reduce((total, repo) => total + repo.stars, 0);
  const replacements = {
    base, browserTitle, favicon: faviconSrc, logo: logoSrc,
    cssVersion: hash(css), jsVersion: hash(js),
    profileCSSVersion: hash(profileCSS), profileJSVersion: hash(profileJS),
    name: escape(snapshot.user.name || snapshot.user.login),
    username: escape(snapshot.user.login), bio: escape(snapshot.user.bio),
    repoCount: repos.length, stars: totalStars, followers: snapshot.user.followers,
    updated: snapshot.updatedAt.slice(0, 10).replaceAll("-", "."),
    languages: [...new Set(repos.map(repo => repo.language).filter(Boolean))].sort().map(language => `<option value="${escape(language)}">${escape(language)}</option>`).join(""),
    repositories: repos.map(repo => `
      <article class="github-repository" data-repository="${escape(repo.name)}" data-language="${escape(repo.language || "")}">
        <div class="github-repository-heading"><a href="?repo=${encodeURIComponent(repo.name)}" data-repo="${escape(repo.name)}">{{icon:book-marked}}<h3>${escape(repo.name)}</h3></a><span class="github-visibility">公开</span></div>
        <p>${escape(repo.description || "暂无项目简介。")}</p>
        <div class="github-repository-meta">${repo.language ? `<span><i class="github-language-dot" data-language="${escape(repo.language)}"></i>${escape(repo.language)}</span>` : ""}<span>{{icon:star}}${repo.stars}</span><span>{{icon:git-fork}}${repo.forks}</span><time datetime="${repo.updatedAt}">${repo.updatedAt.slice(0, 10)}</time></div>
      </article>`).join(""),
    data: JSON.stringify({ ...snapshot, repos }).replaceAll("<", "\\u003c")
  };
  for (const [name, value] of Object.entries(replacements)) html = html.replaceAll(`{{${name}}}`, value);
  html = html.replaceAll("{{icon:github}}", about.match(/<svg[^>]+class="profile-github-icon"[^>]*>[\s\S]*?<\/svg>/)[0]);
  for (const name of new Set([...html.matchAll(/\{\{icon:([\w-]+)\}\}/g)].map(match => match[1]))) {
    const icon = (await readFile(join(root, "node_modules", "lucide-static", "icons", `${name}.svg`), "utf8"))
      .replace("<svg", '<svg aria-hidden="true" focusable="false"');
    html = html.replaceAll(`{{icon:${name}}}`, icon);
  }
  await mkdir(join(out, "github"), { recursive: true });
  await writeFile(join(out, "github", "index.html"), html);
  await writeFile(join(out, "github.css"), css);
  await writeFile(join(out, "github.js"), js);
  await copyFile(join(root, "src", "assets", "github-avatar.png"), join(out, "assets", "github-avatar.png"));
}
