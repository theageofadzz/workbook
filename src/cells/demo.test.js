import assert from "node:assert/strict";
import test from "node:test";
import { demoCountAt, demoDuration, demoSteps } from "./demo.js";

test("the automatic demo grows and shrinks one cell at a time, then loops seamlessly", () => {
  let elapsed = 0;
  const visited = [];
  for (const step of demoSteps) {
    const count = demoCountAt(elapsed + step.hold / 2);
    assert.equal(count, step.count);
    assert.equal(demoCountAt(elapsed + step.hold / 2 + demoDuration), step.count);
    visited.push(count);
    elapsed += step.hold;
  }
  assert.equal(visited[0], 9);
  assert.equal(visited.at(-1), 9);
  assert(visited.some((count, index) => index && count > visited[index - 1]));
  assert(visited.some((count, index) => index && count < visited[index - 1]));
  assert(visited.every((count, index) => !index || Math.abs(count - visited[index - 1]) === 1));
  assert.equal(demoCountAt(demoDuration), 9);
});
