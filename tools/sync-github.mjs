import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const username = "theageofadzz";
const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

async function request(path, accept = headers.Accept) {
  try {
    const response = await fetch(`https://api.github.com/${path}`, {
      headers: { ...headers, Accept: accept },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${path}`);
    return accept.includes("html") ? await response.text() : await response.json();
  } catch (error) {
    try {
      const response = execFileSync("gh", ["api", "-H", `Accept: ${accept}`, path], { encoding: "utf8", timeout: 25000 });
      return accept.includes("html") ? response : JSON.parse(response);
    } catch {
      throw error;
    }
  }
}

const user = await request(`users/${username}`);
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
  const { name, description, language, stargazers_count, forks_count, html_url, homepage, updated_at, default_branch, fork, archived, topics } = repository;
  repos.push({ name, description, language, stars: stargazers_count, forks: forks_count, url: html_url, homepage, updatedAt: updated_at, branch: default_branch, fork, archived, topics, readme });
}
const avatar = await fetch(user.avatar_url, { signal: AbortSignal.timeout(20000) });
if (!avatar.ok) throw new Error(`Could not download the public GitHub avatar: ${avatar.status}`);
await mkdir(join(root, "src", "assets"), { recursive: true });
await sharp(Buffer.from(await avatar.arrayBuffer())).resize(320, 320).png().toFile(join(root, "src", "assets", "github-avatar.png"));
const { login, name, bio, followers, following, html_url } = user;
await writeFile(join(root, "src", "content", "github.json"), JSON.stringify({
  updatedAt: new Date().toISOString(),
  user: { login, name, bio, followers, following, url: html_url },
  repos
}, null, 2) + "\n");
console.log(`Updated ${login}'s public profile and ${repos.length} repository READMEs.`);
