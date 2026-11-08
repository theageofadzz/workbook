import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const username = "theageofadzz";
const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

async function request(path, accept = headers.Accept) {
  try {
    const response = execFileSync("gh", ["api", "-H", `Accept: ${accept}`, path], { encoding: "utf8", timeout: 25000 });
    return accept.includes("html") ? response : JSON.parse(response);
  } catch {
    const response = await fetch(`https://api.github.com/${path}`, {
      headers: { ...headers, Accept: accept },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${path}`);
    return accept.includes("html") ? await response.text() : await response.json();
  }
}

function graphql(query) {
  const response = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], { encoding: "utf8", timeout: 30000 }));
  if (response.errors) throw new Error(JSON.stringify(response.errors));
  return response.data.user;
}

const user = await request(`users/${username}`);
const now = new Date();
const currentYear = now.getUTCFullYear();
const today = now.toISOString();
const yearAgo = new Date(now);
yearAgo.setUTCFullYear(currentYear - 1);
yearAgo.setUTCDate(yearAgo.getUTCDate() + 1);
yearAgo.setUTCHours(0, 0, 0, 0);
const profile = graphql(`query {
  user(login:${JSON.stringify(username)}) {
    pinnedItems(first:6,types:REPOSITORY) { nodes { ... on Repository { name isPrivate } } }
    contributionsCollection { contributionYears }
  }
}`);
const years = profile.contributionsCollection.contributionYears;
const calendarFields = `contributionCalendar {
  totalContributions weeks { firstDay contributionDays { date contributionCount contributionLevel weekday } }
}`;
const ranges = [
  { id: "recent", label: "过去一年", from: yearAgo.toISOString(), to: today },
  ...years.map(year => ({ id: String(year), label: String(year), from: `${year}-01-01T00:00:00Z`, to: year === currentYear ? today : `${year}-12-31T23:59:59Z` }))
];
const months = [];
for (let year = currentYear; year >= Math.min(...years); year--) {
  for (let month = year === currentYear ? now.getUTCMonth() : 11; month >= 0; month--) {
    const from = new Date(Date.UTC(year, month, 1)).toISOString();
    const monthEnd = new Date(Date.UTC(year, month + 1, 1) - 1).toISOString();
    months.push({ month: from.slice(0, 7), from, to: monthEnd > today ? today : monthEnd });
  }
}
const contributions = graphql(`query { user(login:${JSON.stringify(username)}) {
  ${ranges.map((range, i) => `calendar${i}:contributionsCollection(from:${JSON.stringify(range.from)},to:${JSON.stringify(range.to)}) { ${calendarFields} }`).join("\n")}
  ${months.map((month, i) => `month${i}:contributionsCollection(from:${JSON.stringify(month.from)},to:${JSON.stringify(month.to)}) {
    commitContributionsByRepository(maxRepositories:100) { repository {name isPrivate} contributions {totalCount} }
    repositoryContributions(first:100) { nodes {occurredAt repository {name isPrivate}} }
    pullRequestContributions(first:100) { nodes {pullRequest {title url repository {name isPrivate}}} }
    issueContributions(first:100) { nodes {issue {title url repository {name isPrivate}}} }
  }`).join("\n")}
} }`);
const calendars = ranges.map((range, i) => ({ ...range, ...contributions[`calendar${i}`].contributionCalendar }));
const activity = months.map((month, i) => {
  const data = contributions[`month${i}`];
  return {
    month: month.month,
    commits: data.commitContributionsByRepository.filter(item => !item.repository.isPrivate).map(item => ({ name: item.repository.name, count: item.contributions.totalCount })),
    created: data.repositoryContributions.nodes.filter(item => !item.repository.isPrivate).map(item => ({ name: item.repository.name, date: item.occurredAt.slice(0, 10) })),
    pullRequests: data.pullRequestContributions.nodes.filter(item => !item.pullRequest.repository.isPrivate).map(item => ({ name: item.pullRequest.repository.name, title: item.pullRequest.title, url: item.pullRequest.url })),
    issues: data.issueContributions.nodes.filter(item => !item.issue.repository.isPrivate).map(item => ({ name: item.issue.repository.name, title: item.issue.title, url: item.issue.url }))
  };
});
const repositories = [];
for (let page = 1; ; page++) {
  const batch = await request(`users/${username}/repos?type=owner&sort=updated&per_page=100&page=${page}`);
  repositories.push(...batch.filter(repository => !repository.private));
  if (batch.length < 100) break;
}
const repos = [];
for (const repository of repositories) {
  let readme = "";
  try {
    readme = await request(`repos/${repository.full_name}/readme`, "application/vnd.github.html+json");
  } catch (error) {
    if (error.message.includes("404")) console.warn(`No README for ${repository.name}.`);
    else throw error;
  }
  const { name, description, language, stargazers_count, forks_count, html_url, homepage, updated_at, created_at, default_branch, fork, archived, topics } = repository;
  repos.push({ name, description, language, stars: stargazers_count, forks: forks_count, url: html_url, homepage, updatedAt: updated_at, createdAt: created_at, branch: default_branch, fork, archived, topics, readme });
}
let avatar;
try {
  const response = await fetch(user.avatar_url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Avatar returned ${response.status}`);
  avatar = Buffer.from(await response.arrayBuffer());
} catch {
  avatar = execFileSync("gh", ["api", user.avatar_url], { timeout: 25000 });
}
await mkdir(join(root, "src", "assets"), { recursive: true });
await sharp(avatar).resize(320, 320).png().toFile(join(root, "src", "assets", "github-avatar.png"));
const { login, name, bio, followers, following, html_url, blog } = user;
await writeFile(join(root, "src", "content", "github.json"), JSON.stringify({
  updatedAt: new Date().toISOString(),
  user: { login, name, bio, followers, following, url: html_url, website: blog },
  pinned: profile.pinnedItems.nodes.filter(item => !item.isPrivate).map(item => item.name),
  calendars,
  activity,
  repos
}, null, 2) + "\n");
console.log(`Updated ${login}'s public profile, ${repos.length} READMEs, ${calendars.length} contribution calendars and ${activity.length} activity months.`);
