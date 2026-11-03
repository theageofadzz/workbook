import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..", "docs");
const config = JSON.parse(await readFile(new URL("../site.config.json", import.meta.url), "utf8"));
const port = Number(process.env.PORT || 4173);
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".ttf": "font/ttf", ".woff2": "font/woff2", ".woff": "font/woff", ".mp4": "video/mp4" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/") {
      response.writeHead(302, { Location: `${config.basePath}/` });
      return response.end();
    }
    if (!pathname.startsWith(`${config.basePath}/`) && pathname !== config.basePath) throw new Error("Not found");
    const relative = pathname.slice(config.basePath.length);
    let file = resolve(root, `.${relative || "/"}`);
    if (!file.startsWith(`${root}${sep}`) && file !== root) throw new Error("Invalid path");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(await readFile(join(root, "404.html"), "utf8").catch(() => "Not found"));
  }
});
server.listen(port, "127.0.0.1", () => console.log(`${config.title} preview: http://127.0.0.1:${port}${config.basePath}/`));
