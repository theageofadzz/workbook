export const MIN_CELLS = 1;
export const MAX_CELLS = 20;
export const INITIAL_COUNT = 9;

export const definitions = [
  { x: -.04, y: -.15, z: .14, r: .91, name: "Tryptophan" },
  { x: -.04, y: 2.06, z: -.10, r: .91, name: "B phase" },
  { x: -.65, y: 1.12, z: .00, r: .79, name: "Lymphocytes" },
  { x: .66, y: .86, z: -.07, r: .70, name: "Basophils" },
  { x: -1.12, y: -.03, z: -.11, r: .72, name: "CO\u2082" },
  { x: 1.06, y: -.18, z: -.12, r: .72, name: "Neutrophils" },
  { x: .63, y: -1.30, z: .08, r: .93, name: "O\u2082" },
  { x: -.67, y: -1.43, z: -.12, r: .68, name: "Mg" },
  { x: -.10, y: -2.31, z: -.04, r: .80, name: "Na\u207a" }
];

const names = ["Serotonin", "Dopamine", "Melatonin", "Glutamine", "ATP", "GABA", "Ca\u00b2\u207a", "Cortisol", "Oxytocin", "Glycine", "Endorphin"];
for (let i = INITIAL_COUNT; i < MAX_CELLS; i++) {
  const angle = (i - INITIAL_COUNT) * 2.399963 + .6;
  const distance = 2.1 + (i - INITIAL_COUNT) * .09;
  definitions.push({
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 1.35,
    z: Math.sin(i * 1.7) * .10,
    r: .68 + ((i * 7) % 11) * .021,
    name: names[i - INITIAL_COUNT]
  });
}

const cache = new Map();

export function getCellLayout(count) {
  count = Math.min(MAX_CELLS, Math.max(MIN_CELLS, Math.round(count)));
  if (cache.has(count)) return cache.get(count);
  const points = definitions.slice(0, count).map(cell => ({ x: cell.x, y: cell.y, z: cell.z, r: cell.r }));
  if (count !== INITIAL_COUNT) {
    for (let iteration = 0; iteration < 260; iteration++) {
      for (const point of points) {
        point.x *= .989;
        point.y *= .995;
      }
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = points[i];
          const b = points[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.max(.0001, Math.hypot(dx, dy));
          const overlap = (a.r + b.r) * .88 - distance;
          if (overlap <= 0) continue;
          const strength = overlap / distance * .40;
          a.x -= dx * strength;
          a.y -= dy * strength;
          b.x += dx * strength;
          b.y += dy * strength;
        }
      }
    }
  }
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x - point.r);
    right = Math.max(right, point.x + point.r);
    bottom = Math.min(bottom, point.y - point.r);
    top = Math.max(top, point.y + point.r);
  }
  const centerX = (left + right) * .5;
  const centerY = (bottom + top) * .5;
  for (const point of points) {
    point.x -= centerX;
    point.y -= centerY;
    Object.freeze(point);
  }
  const result = Object.freeze({ points: Object.freeze(points), width: right - left, height: top - bottom });
  cache.set(count, result);
  return result;
}

export function advanceSpring(state, target, dt, stiffness = 65, damping = 15) {
  if (dt <= 0) return state.value;
  const step = Math.min(dt, 1 / 120);
  const steps = Math.max(1, Math.ceil(dt / step));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * h;
    state.value += state.velocity * h;
  }
  if (Math.abs(state.value - target) < .0001 && Math.abs(state.velocity) < .0001) {
    state.value = target;
    state.velocity = 0;
  }
  return state.value;
}
