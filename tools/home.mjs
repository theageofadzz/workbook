import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, parseFragment, serialize } from "parse5";

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function walk(node, visit) {
  if (visit(node) === false) return;
  for (const child of [...node.childNodes || []]) walk(child, visit);
}
function remove(node) {
  const siblings = node.parentNode.childNodes;
  siblings.splice(siblings.indexOf(node), 1);
}

export async function writeHomePage({ root, out, base, title, footer }) {
  const entries = await Promise.all(["blueprint-design-skill", "weather-recreation", "portfolio-design", "gamestation"].map(async name =>
    JSON.parse(await readFile(join(root, "src", "content", `${name}.json`), "utf8"))
  ));
  const allowed = new Set(entries.map(entry => `${base}/${entry.slug}`));
  const document = parse(await readFile(join(out, "index.html"), "utf8"));
  const retained = [];
  let footerCount = 0;
  walk(document, node => {
    if ((node.tagName === "footer" && attr(node, "data-site-footer") !== undefined)
      || (node.tagName === "div" && attr(node, "class") === "mt-20 flex flex-col items-center")) {
      const replacement = parseFragment(footer).childNodes.find(child => child.tagName === "footer");
      replacement.parentNode = node.parentNode;
      const siblings = node.parentNode.childNodes;
      siblings.splice(siblings.indexOf(node), 1, replacement);
      footerCount++;
      return false;
    }
    if (node.tagName === "body" && attr(node, "data-workbook-home") === undefined) {
      node.attrs.push({ name: "data-workbook-home", value: "" });
    }
    // The homepage is complete HTML. No legacy router or hydration may replace it.
    if (node.tagName === "script" && (
      attr(node, "id") === "__NEXT_DATA__"
      || attr(node, "src")?.includes("/_next/")
      || node.childNodes.some(child => child.value?.includes("TURBOPACK"))
    )) {
      remove(node);
      return false;
    }
    if (node.tagName === "link" && attr(node, "as") === "image") {
      remove(node);
      return false;
    }
    node.attrs = node.attrs?.filter(item => item.name !== "data-next-head");
    if (node.tagName !== "a") return;
    const href = attr(node, "href");
    if (attr(node, "class")?.includes("font-[Weixin]")) {
      let card = node.parentNode;
      while (card && attr(card, "class") !== "mb-12") card = card.parentNode;
      if (!card) throw new Error("Could not locate the homepage entry.");
      if (!allowed.has(href?.replace(/\/$/, ""))) {
        remove(card);
        return false;
      }
      const slug = href.replace(/\/$/, "").split("/").at(-1);
      card.attrs = card.attrs.filter(item => item.name !== "data-home-entry");
      card.attrs.push({ name: "data-home-entry", value: slug });
      retained.push(slug);
    }
    if (href?.includes("jiangyijie27.github.io/aragakey") || attr(node, "data-workbook-signature") !== undefined) {
      node.attrs = [
        { name: "href", value: `${base}/about/` },
        { name: "aria-label", value: `关于 ${title}` },
        { name: "data-workbook-signature", value: "" },
        { name: "data-brand", value: `${title}.` }
      ];
      node.childNodes = [];
    }
    if (attr(node, "data-role") === "footer-item" && href?.replace(/\/$/, "") === base) {
      if (attr(node, "aria-current") === undefined) node.attrs.push({ name: "aria-current", value: "page" });
    }
  });
  if (retained.join(",") !== entries.map(entry => entry.slug).join(",")) {
    throw new Error("The homepage must contain the configured personal entries, in order.");
  }
  if (footerCount !== 1) throw new Error("The homepage must contain one shared contact footer.");
  await writeFile(join(out, "index.html"), serialize(document));
  const chunks = join(out, "_next", "static", "chunks");
  for (const file of await readdir(chunks)) {
    if (/^2ka_qt01g8-f4(?:-workbook-[a-f0-9]{8})?\.js$/.test(file)) {
      await rm(join(chunks, file));
    }
  }
}
