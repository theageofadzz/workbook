import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { isExcludedRoute } from "./content-policy.mjs";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));
const source = new URL(config.source);
const cache = join(root, ".cache", "reference");
const records = new Map();
const queue = [];
const routes = new Set(["/"]);
const failures = [];
const sourcePath = source.pathname.replace(/\/$/, "");
const textTypes = /\.(?:html|js|css|json|svg)$/i;
const assetTypes = /\.(?:js|css|ttf|woff2?|otf|png|jpe?g|webp|gif|svg|avif|ico)$/i;
const mediaTypes = /\.(?:mp4|webm|mov|mp3|wav|ogg)$/i;
const refresh = process.argv.includes("--refresh");

await mkdir(cache, { recursive: true });

function enqueue(url, kind = "asset") {
  const value = new URL(url, `${config.source}/`);
  value.hash = "";
  if (value.origin === source.origin && value.pathname.startsWith(`${sourcePath}/`)
    && isExcludedRoute(value.pathname.slice(sourcePath.length))) return;
  if (!["https:", "http:"].includes(value.protocol)) return;
  const key = value.href;
  if (records.has(key)) return;
  const local = kind === "page"
    ? `_pages/${value.pathname.slice(sourcePath.length).replace(/^\/|\/$/g, "") || "index"}.html`
    : value.origin === source.origin && value.pathname.startsWith(`${sourcePath}/`)
      ? value.pathname.slice(sourcePath.length + 1)
      : `media/${createHash("sha256").update(key).digest("hex").slice(0, 12)}-${decodeURIComponent(value.pathname.split("/").pop()).replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const record = { url: key, local, kind };
  records.set(key, record);
  queue.push(record);
}

function routeFrom(url) {
  try {
    const value = new URL(url, `${config.source}/`);
    if (value.origin !== source.origin) return;
    if (value.pathname !== sourcePath && !value.pathname.startsWith(`${sourcePath}/`)) return;
    const route = value.pathname.slice(sourcePath.length).replace(/\/$/, "") || "/";
    if (route.includes("_next") || route.includes(".") || isExcludedRoute(route)) return;
    if (!/^\/(?:[a-zA-Z0-9-]+)?$/.test(route)) return;
    if (!routes.has(route)) {
      routes.add(route);
      enqueue(`${config.source}${route === "/" ? "/" : route}`, "page");
    }
  } catch {}
}

function discover(text, context) {
  // Chunk names also occur inside the Turbopack dependency tables.
  for (const match of text.matchAll(/(?:\/abc\/_next\/)?static\/(?:chunks|[a-zA-Z0-9_-]+)\/[a-zA-Z0-9_.-]+\.(?:js|css)/g)) {
    enqueue(`${source.origin}${sourcePath}/_next/${match[0].replace(/^\/abc\/_next\//, "")}`);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>`\\)]+/g)) {
    const url = match[0].replace(/&amp;/g, "&");
    if (url.includes("${")) continue;
    try {
      const parsed = new URL(url);
      if (assetTypes.test(parsed.pathname) &&
          (parsed.hostname === source.hostname || parsed.hostname === "wxa.wxs.qq.com" || parsed.hostname === "cdnjs.cloudflare.com")) enqueue(url);
      routeFrom(url);
    } catch {}
  }
  for (const match of text.matchAll(/\/abc\/(?:fonts|images|crafts|_next)\/[^\s"'<>`\\)]+/g)) {
    const url = new URL(match[0], source.origin);
    if (assetTypes.test(url.pathname)) enqueue(url);
  }
  if (context.kind === "page") {
    const document = parse(text);
    function visit(node) {
      for (const attr of node.attrs || []) {
        if (attr.name === "href") routeFrom(attr.value);
        if (["src", "href", "poster"].includes(attr.name)) {
          try {
            const url = new URL(attr.value, context.url);
            if (assetTypes.test(url.pathname) && url.origin === source.origin) enqueue(url);
          } catch {}
        }
      }
      for (const child of node.childNodes || []) visit(child);
    }
    visit(document);
    const nextScript = findNode(document, node => node.tagName === "script" && node.attrs?.some(a => a.name === "id" && a.value === "__NEXT_DATA__"));
    if (nextScript) {
      const data = JSON.parse(nextScript.childNodes.map(n => n.value || "").join(""));
      const items = data.props?.pageProps?.dataSource;
      if (Array.isArray(items)) {
        for (const item of items) {
          for (const key of ["posterUrl", "imageUrl"]) {
            if (item[key]) enqueue(new URL(item[key], `${config.source}/`).href);
          }
        }
      }
    }
  }
}

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes || []) {
    const result = findNode(child, predicate);
    if (result) return result;
  }
}

async function download(record) {
  const file = join(cache, record.local);
  await mkdir(dirname(file), { recursive: true });
  let cached = false;
  if (!refresh) {
    try { await access(file); cached = true; } catch {}
  }
  if (!cached) {
    await exec("curl", ["-sS", "-L", "--fail", "--retry", "2", "--connect-timeout", "12", "--max-time", "90", record.url, "-o", file], { maxBuffer: 1024 * 1024 });
  }
  const content = await readFile(file);
  record.bytes = content.length;
  if (record.kind === "page" || textTypes.test(record.local)) discover(content.toString("utf8"), record);
}

enqueue(`${config.source}/`, "page");
let completed = 0;
while (queue.length) {
  const batch = queue.splice(0, 8);
  const results = await Promise.allSettled(batch.map(download));
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    completed++;
    if (result.status === "rejected") {
      const record = batch[index];
      failures.push({ url: record.url, kind: record.kind, message: result.reason.message });
      records.delete(record.url);
      console.warn(`Unavailable: ${record.url}`);
    }
  }
  console.log(`Downloaded ${completed}; queued ${queue.length}; pages ${routes.size}`);
}

if (failures.some(item => item.kind === "page")) throw new Error("Some pages could not be downloaded.");
const manifest = {
  source: config.source,
  capturedAt: new Date().toISOString(),
  routes: [...routes].sort(),
  files: [...records.values()],
  externalMedia: "Original videos and third-party iframe demos remain hosted at their original URLs.",
  failures
};
await writeFile(join(cache, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Snapshot complete: ${routes.size} pages, ${records.size} files.`);
await import("./optimize.mjs");
await import("./build.mjs");
