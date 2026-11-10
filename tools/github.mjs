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

function repositoryCard(repo) {
  return `
    <article class="github-repository" data-repository="${escape(repo.name)}" data-language="${escape(repo.language || "")}">
      <div class="github-repository-heading"><a href="?repo=${encodeURIComponent(repo.name)}" data-repo="${escape(repo.name)}">{{icon:book-marked}}<h3>${escape(repo.name)}</h3></a><span class="github-visibility">公开</span></div>
      <p>${escape(repo.description || "暂无项目简介。")}</p>
      <div class="github-repository-meta">${repo.language ? `<span><i class="github-language-dot" data-language="${escape(repo.language)}"></i>${escape(repo.language)}</span>` : ""}<span>{{icon:star}}${repo.stars}</span><span>{{icon:git-fork}}${repo.forks}</span><time datetime="${repo.updatedAt}">${repo.updatedAt.slice(0, 10)}</time></div>
    </article>`;
}

function contributionCalendar(calendar, index) {
  const levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
  const days = calendar.weeks.flatMap(week => week.contributionDays);
  const latest = days.at(-1)?.date;
  let previousMonth;
  const cells = calendar.weeks.map((week, column) => {
    const first = week.contributionDays[0];
    const month = first.date.slice(0, 7);
    const label = month !== previousMonth && column < calendar.weeks.length - 1
      ? `<span class="github-calendar-month" style="grid-column:${column + 2};grid-row:1">${Number(month.slice(5))}月</span>` : "";
    previousMonth = month;
    return label + week.contributionDays.map(day => {
      const count = day.contributionCount;
      const description = `${day.date} · ${count} 次公开贡献`;
      return `<button class="github-calendar-day" type="button" data-contribution-day data-date="${day.date}" data-count="${count}" data-level="${levels.indexOf(day.contributionLevel)}" tabindex="${day.date === latest ? 0 : -1}" style="grid-column:${column + 2};grid-row:${day.weekday + 2}" aria-label="${description}"></button>`;
    }).join("");
  }).join("");
  return `<div class="github-calendar-panel" data-calendar="${calendar.id}"${index ? " hidden" : ""}>
    <p class="github-contribution-total"><strong>${calendar.totalContributions.toLocaleString("en-US")}</strong> 次公开贡献<span>${calendar.from.slice(0, 10)} — ${calendar.to.slice(0, 10)}</span></p>
    <div class="github-calendar">
      <div class="github-calendar-scroll" data-calendar-scroll>
        <div class="github-heatmap" role="group" aria-label="${calendar.label}公开贡献日历" style="--week-count:${calendar.weeks.length}">
          ${[[1, "一"], [3, "三"], [5, "五"]].map(([day, label]) => `<span class="github-calendar-weekday" aria-hidden="true" style="grid-column:1;grid-row:${day + 2}">${label}</span>`).join("")}
          ${cells}
        </div>
      </div>
      <div class="github-calendar-legend" aria-label="贡献数量由少到多"><span>少</span>${levels.map((_, level) => `<i data-level="${level}" aria-hidden="true"></i>`).join("")}<span>多</span></div>
    </div>
  </div>`;
}

function contributionActivity(activity, username, names) {
  function repositoryLink(name) {
    const label = `${username}/${name}`;
    return names.has(name)
      ? `<a href="?repo=${encodeURIComponent(name)}" title="${escape(label)}">${escape(label)}</a>`
      : `<a href="https://github.com/${encodeURIComponent(username)}/${encodeURIComponent(name)}" title="${escape(label)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
  }
  return activity.filter(month => month.commits.length || month.created.length || month.pullRequests.length || month.issues.length).map((month, index) => {
    const commits = month.commits.reduce((total, repo) => total + repo.count, 0);
    const max = Math.max(1, ...month.commits.map(repo => repo.count));
    const events = [];
    if (commits) events.push(`<div class="github-activity-event">
      <span class="github-activity-icon">{{icon:git-commit-horizontal}}</span>
      <h4>在 ${month.commits.length} 个仓库中提交 ${commits} 次</h4>
      <ul class="github-commit-list">${month.commits.map(repo => `<li>${repositoryLink(repo.name)}<span>${repo.count} 次提交</span><span class="github-commit-bar" aria-hidden="true"><i style="width:${Math.max(3, repo.count / max * 100).toFixed(2)}%"></i></span></li>`).join("")}</ul>
    </div>`);
    if (month.created.length) events.push(`<div class="github-activity-event">
      <span class="github-activity-icon">{{icon:book-marked}}</span>
      <h4>创建 ${month.created.length} 个仓库</h4>
      <ul class="github-created-list">${month.created.map(repo => `<li>${repositoryLink(repo.name)}<time datetime="${repo.date}">${repo.date.slice(5).replace("-", "月")}日</time></li>`).join("")}</ul>
    </div>`);
    for (const [key, title, icon] of [["pullRequests", "个 Pull Request", "git-pull-request"], ["issues", "个 Issue", "circle-dot"]]) {
      if (!month[key].length) continue;
      events.push(`<div class="github-activity-event"><span class="github-activity-icon">{{icon:${icon}}}</span><h4>发起 ${month[key].length} ${title}</h4><ul class="github-created-list">${month[key].map(item => `<li><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a><span>${escape(item.name)}</span></li>`).join("")}</ul></div>`);
    }
    return `<section class="github-activity-month" data-activity-month="${month.month}"${index >= 3 ? " hidden" : ""}>
      <h3><time datetime="${month.month}">${month.month.slice(0, 4)} 年 ${Number(month.month.slice(5))} 月</time></h3>${events.join("")}
    </section>`;
  }).join("");
}

export async function writeGitHubPage({ root, out, base, browserTitle, faviconSrc, logoSrc, footer }) {
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
    footer,
    base, browserTitle, favicon: faviconSrc, logo: logoSrc,
    cssVersion: hash(css), jsVersion: hash(js),
    profileCSSVersion: hash(profileCSS), profileJSVersion: hash(profileJS),
    name: escape(snapshot.user.name || snapshot.user.login),
    username: escape(snapshot.user.login), bio: escape(snapshot.user.bio),
    stars: totalStars, followers: snapshot.user.followers,
    updated: snapshot.updatedAt.slice(0, 10).replaceAll("-", "."),
    pinnedCount: snapshot.pinned.length,
    pinned: snapshot.pinned.map(name => repos.find(repo => repo.name === name)).filter(Boolean).map(repositoryCard).join("") || '<p class="github-activity-empty">暂无置顶项目。</p>',
    calendarOptions: snapshot.calendars.map(calendar => `<option value="${calendar.id}">${calendar.label}</option>`).join(""),
    calendars: snapshot.calendars.map(contributionCalendar).join(""),
    activity: contributionActivity(snapshot.activity, snapshot.user.login, names),
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
