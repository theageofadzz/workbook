import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { transform } from "esbuild";

export async function writeBlueprintExperiences({ root, out }) {
  const source = join(root, "src", "blueprint");
  const target = join(out, "assets", "blueprint");
  const original = await readFile(join(source, "vendor", "lathe-original.js"), "utf8");
  const provenance = JSON.parse(await readFile(join(source, "vendor", "source.json"), "utf8"));
  if (createHash("sha256").update(original).digest("hex") !== provenance.sha256) {
    throw new Error("The pinned blueprint renderer has changed.");
  }
  const sourceAST = parse(original, { ecmaVersion: "latest", sourceType: "module" });
  const template = await readFile(join(source, "embed.html"), "utf8");
  await mkdir(target, { recursive: true });
  const common = {
    d_: "createParameters", PC: "layoutBlueprint", cp: "createEmptyTextLayers",
    NS: "createEmptyEntry", KC: "beginFlight"
  };
  for (const variant of ["drone", "car"]) {
    const adapters = await readFile(join(source, "adapters", `${variant}.js`), "utf8");
    const adapterAST = parse(adapters, { ecmaVersion: "latest", sourceType: "module" });
    const replacements = variant === "car" ? {
      ...common, qC: "returnToBlueprint", IC: "drawVehicle",
      Kf: "createVehicleRenderer", ow: "renderVehicleFrame"
    } : common;
    const edits = Object.entries(replacements).map(([originalName, adapterName]) => {
      const declaration = sourceAST.body.find(node => node.type === "FunctionDeclaration" && node.id.name === originalName);
      const adapter = adapterAST.body.find(node => node.type === "FunctionDeclaration" && node.id.name === adapterName);
      if (!declaration || !adapter) throw new Error(`Missing blueprint adapter: ${originalName}`);
      return {
        start: declaration.start, end: declaration.end,
        code: adapters.slice(adapter.start, adapter.id.start) + originalName + adapters.slice(adapter.id.end, adapter.end)
      };
    });
    if (variant === "car") {
      const startup = sourceAST.body.at(-1);
      const initialize = adapterAST.body.find(node => node.type === "FunctionDeclaration" && node.id.name === "startVehicleStudy");
      if (startup.type !== "ExpressionStatement" || startup.expression.callee?.type !== "ArrowFunctionExpression" || !initialize) {
        throw new Error("The vehicle startup has changed.");
      }
      edits.push({
        start: startup.start, end: startup.end,
        code: adapters.slice(initialize.start, initialize.end) + "\nstartVehicleStudy();"
      });
    }
    let output = original;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.code + output.slice(edit.end);
    }
    const compiled = await transform(output, {
      loader: "js", format: "esm", target: "es2022", minify: true, legalComments: "inline",
      banner: "/* Blueprint study. Original renderer: Zsolt Kacso / Whitespace. See vendor/source.json and ATTRIBUTION.md. */"
    });
    await writeFile(join(target, `${variant}.js`), compiled.code);
    const title = variant === "car" ? "Model 3" : "无人机";
    const label = variant === "car"
      ? "Model 3 蓝图。悬停查看实体，点击或按回车展开，拖动旋转，再次点击或按 Escape 返回。"
      : "无人机蓝图。悬停查看实体，点击或按回车起飞，拖动旋转，再次点击或按 Escape 返回。";
    await writeFile(join(target, variant === "car" ? "model-3.html" : "drone.html"),
      template.replace("{{title}}", `${title} / Blueprint`).replace("{{label}}", label));
  }
  for (const file of [
    "study.js", "study.css", "ATTRIBUTION.md", "vendor/source.json",
    "assets/geist-latin.woff2", "data/car.json", "data/drone.json", "data/headline-glyphs.json",
    "models/tesla-model-3.glb", "models/TESLA-LICENSE.md", "models/drone_built.glb", "tex/seam_sdf.png"
  ]) {
    const destination = join(target, file);
    await mkdir(join(destination, ".."), { recursive: true });
    await copyFile(join(source, file), destination);
  }
}
