import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function writeSkillDownloads({ root, out }) {
  const skills = join(root, "skills");
  const name = "blueprint-3d-showcase";
  const files = [];
  for (const entry of await readdir(join(skills, name), { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile() || entry.name.startsWith(".")) {
      throw new Error(`Unexpected file in public skill: ${entry.name}`);
    }
    files.push(join(entry.parentPath, entry.name).slice(skills.length + 1));
  }
  if (!files.includes(`${name}/SKILL.md`)) throw new Error("The downloadable skill needs SKILL.md.");
  const target = join(out, "assets", "skills");
  await mkdir(target, { recursive: true });
  const archive = join(target, `${name}.zip`);
  await rm(archive, { force: true });
  await run("zip", ["-q", "-X", archive, ...files.sort()], { cwd: skills, timeout: 30000 });
  const discovery = join(out, ".well-known", "agent-skills");
  for (const file of files) {
    const target = join(discovery, file);
    await mkdir(join(target, ".."), { recursive: true });
    await copyFile(join(skills, file), target);
  }
  const instructions = await readFile(join(skills, name, "SKILL.md"), "utf8");
  const description = instructions.match(/^description: (.+)$/m)?.[1];
  if (!description) throw new Error("The public skill needs a description.");
  await writeFile(join(discovery, "index.json"), JSON.stringify({
    skills: [{
      name, description: JSON.parse(description),
      files: files.map(file => file.slice(name.length + 1)).sort()
    }]
  }, null, 2) + "\n");
}
