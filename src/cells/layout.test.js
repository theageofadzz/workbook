import assert from "node:assert/strict";
import test from "node:test";
import { MIN_CELLS, MAX_CELLS, definitions, getCellLayout, advanceSpring } from "./layout.js";

test("every supported count fits its bounds and avoids collapsed cells", () => {
  assert.equal(definitions.length, MAX_CELLS);
  for (let count = MIN_CELLS; count <= MAX_CELLS; count++) {
    const layout = getCellLayout(count);
    assert.equal(layout.points.length, count);
    assert.ok(layout.width > 0 && layout.height > 0);
    for (const [i, point] of layout.points.entries()) {
      assert.ok(Object.values(point).every(Number.isFinite));
      assert.ok(Math.abs(point.x) + point.r <= layout.width / 2 + .000001);
      assert.ok(Math.abs(point.y) + point.r <= layout.height / 2 + .000001);
      for (let j = i + 1; j < count; j++) {
        const other = layout.points[j];
        assert.ok(Math.hypot(point.x - other.x, point.y - other.y) > (point.r + other.r) * .65);
      }
    }
    assert.strictEqual(getCellLayout(count), layout);
  }
});

test("birth can reverse into removal and settle without an unstable spring", () => {
  for (const rate of [15, 30, 60, 120]) {
    const state = { value: 0, velocity: 0 };
    for (let frame = 0; frame < rate * .3; frame++) advanceSpring(state, 1, 1 / rate, 54, 12);
    assert.ok(state.value > .5 && state.value < 1.1);
    for (let frame = 0; frame < rate * 3; frame++) advanceSpring(state, 0, 1 / rate, 54, 12);
    assert.ok(Math.abs(state.value) < .0001);
    assert.ok(Math.abs(state.velocity) < .0001);
  }
  const state = { value: 0, velocity: 0 };
  assert.equal(advanceSpring(state, 1, 0), 0);
});
