/*!
 * PaperCrumple physics adapted from React Bits, copyright (c) 2026 David Haz.
 * MIT + Commons Clause. See paper-crumple-LICENSE.txt.
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function randomSource(seed) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function createPaperPath(rest, triangles, shortSide, density, sharpness, depth, seed) {
  const count = rest.length / 3;
  const points = Float64Array.from(rest);
  const previous = Float64Array.from(rest);
  const before = Float64Array.from(rest);
  const edges = [];
  const hinges = [];
  const adjacency = new Map();
  const random = randomSource(seed);
  const guides = Array.from({ length: density }, () => {
    const angle = random() * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle), phase: random() * Math.PI * 2, weight: random() * .6 + .4 };
  });
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k];
      const b = triangles[t + (k + 1) % 3];
      const opposite = triangles[t + (k + 2) % 3];
      const key = Math.min(a, b) * count + Math.max(a, b);
      const other = adjacency.get(key);
      if (!other) {
        adjacency.set(key, { a, b, opposite });
        edges.push(a * 3, b * 3, Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1]));
      } else {
        const c = other.opposite * 3;
        const d = opposite * 3;
        const length = Math.hypot(rest[c] - rest[d], rest[c + 1] - rest[d + 1]);
        const mx = (rest[c] + rest[d]) * .5;
        const my = (rest[c + 1] + rest[d + 1]) * .5;
        let weakness = 0;
        for (const guide of guides) {
          const distance = Math.abs(Math.sin((mx * guide.x + my * guide.y) / shortSide * 4 + guide.phase));
          weakness = Math.max(weakness, Math.exp(-distance * distance * 80) * guide.weight);
        }
        hinges.push(c, d, length, .12 + (1 - weakness) * .75);
      }
    }
  }
  const spacing = Math.sqrt(shortSide * shortSide / count);
  const thickness = shortSide * .008;
  const samples = [rest.slice()];
  const frameCount = 64;
  const stepsPerFrame = 3;
  const totalSteps = frameCount * stepsPerFrame;
  let initialRadius = 0;
  for (let i = 0; i < rest.length; i += 3) {
    initialRadius = Math.max(initialRadius, Math.hypot(rest[i] / .94, rest[i + 1] / 1.02));
  }
  initialRadius *= 1.02;
  function constrain(list, stride, stiffness, reverse) {
    for (let n = 0; n < list.length; n += stride) {
      const edge = reverse ? list.length - stride - n : n;
      const a = list[edge];
      const b = list[edge + 1];
      const dx = points[b] - points[a];
      const dy = points[b + 1] - points[a + 1];
      const dz = points[b + 2] - points[a + 2];
      const length = Math.hypot(dx, dy, dz);
      if (length < .000001) continue;
      const weight = stride === 4 ? list[edge + 3] : 1;
      const amount = (1 - list[edge + 2] / length) * .5 * stiffness * weight;
      points[a] += dx * amount;
      points[b] -= dx * amount;
      points[a + 1] += dy * amount;
      points[b + 1] -= dy * amount;
      points[a + 2] += dz * amount;
      points[b + 2] -= dz * amount;
    }
  }
  function separateLayers() {
    const margin = thickness * 2;
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3;
      const b = triangles[t + 1] * 3;
      const c = triangles[t + 2] * 3;
      const ax = points[a], ay = points[a + 1], az = points[a + 2];
      const bx = points[b] - ax, by = points[b + 1] - ay, bz = points[b + 2] - az;
      const cx = points[c] - ax, cy = points[c + 1] - ay, cz = points[c + 2] - az;
      let nx = by * cz - bz * cy;
      let ny = bz * cx - bx * cz;
      let nz = bx * cy - by * cx;
      const length = Math.hypot(nx, ny, nz);
      if (length < .0000001) continue;
      nx /= length;
      ny /= length;
      nz /= length;
      const minX = Math.min(ax, points[b], points[c]) - margin;
      const maxX = Math.max(ax, points[b], points[c]) + margin;
      const minY = Math.min(ay, points[b + 1], points[c + 1]) - margin;
      const maxY = Math.max(ay, points[b + 1], points[c + 1]) + margin;
      const minZ = Math.min(az, points[b + 2], points[c + 2]) - margin;
      const maxZ = Math.max(az, points[b + 2], points[c + 2]) + margin;
      const bb = bx * bx + by * by + bz * bz;
      const cc = cx * cx + cy * cy + cz * cz;
      const bc = bx * cx + by * cy + bz * cz;
      const determinant = bb * cc - bc * bc;
      if (determinant < .0000000001) continue;
      for (let p = 0; p < points.length; p += 3) {
        if (p === a || p === b || p === c) continue;
        if (points[p] < minX || points[p] > maxX || points[p + 1] < minY || points[p + 1] > maxY
          || points[p + 2] < minZ || points[p + 2] > maxZ) continue;
        const rx = rest[p] - (rest[a] + rest[b] + rest[c]) / 3;
        const ry = rest[p + 1] - (rest[a + 1] + rest[b + 1] + rest[c + 1]) / 3;
        if (rx * rx + ry * ry < spacing * spacing * 6) continue;
        const dx = points[p] - ax, dy = points[p + 1] - ay, dz = points[p + 2] - az;
        const distance = dx * nx + dy * ny + dz * nz;
        const previousDistance = (before[p] - before[a]) * nx + (before[p + 1] - before[a + 1]) * ny
          + (before[p + 2] - before[a + 2]) * nz;
        const side = previousDistance >= 0 ? 1 : -1;
        if (distance * side >= thickness || Math.abs(distance) > margin) continue;
        const pb = dx * bx + dy * by + dz * bz;
        const pc = dx * cx + dy * cy + dz * cz;
        const u = (cc * pb - bc * pc) / determinant;
        const v = (bb * pc - bc * pb) / determinant;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const w = 1 - u - v;
        const correction = (thickness * side - distance) / (1 + w * w + u * u + v * v);
        for (let axis = 0; axis < 3; axis++) {
          const normal = axis === 0 ? nx : axis === 1 ? ny : nz;
          const movement = normal * correction;
          points[p + axis] += movement;
          points[a + axis] -= movement * w;
          points[b + axis] -= movement * u;
          points[c + axis] -= movement * v;
        }
      }
    }
  }
  for (let step = 1; step <= totalSteps; step++) {
    const progress = step / totalSteps;
    const compression = progress * progress * (3 - 2 * progress);
    const radius = initialRadius * (1 - compression) + shortSide * (.19 - depth * .025) * compression;
    before.set(points);
    for (let i = 0; i < points.length; i += 3) {
      const x = rest[i] / shortSide;
      const y = rest[i + 1] / shortSide;
      let buckle = 0;
      for (const guide of guides) buckle += Math.sin((x * guide.x + y * guide.y) * 5 + guide.phase) * guide.weight;
      for (let axis = 0; axis < 3; axis++) {
        const velocity = (points[i + axis] - previous[i + axis]) * .55;
        previous[i + axis] = points[i + axis];
        points[i + axis] += clamp(velocity, -spacing * .15, spacing * .15);
      }
      points[i + 2] += buckle / density * shortSide * .0007 * Math.sin(progress * Math.PI);
    }
    for (let pass = 0; pass < 18; pass++) {
      constrain(hinges, 4, .45 * (1 - sharpness * .4), pass % 2 === 0);
      for (let i = 0; i < points.length; i += 3) {
        const distance = Math.hypot(points[i] / .94, points[i + 1] / 1.02, points[i + 2] / .86);
        if (distance > radius) {
          const push = (1 - radius / distance) * .55;
          points[i] -= points[i] * push;
          points[i + 1] -= points[i + 1] * push;
          points[i + 2] -= points[i + 2] * push;
        }
      }
      constrain(edges, 3, 1, pass % 2 !== 0);
      if (pass === 8 || pass === 17) separateLayers();
    }
    for (let h = 0; h < hinges.length; h += 4) {
      const a = hinges[h], b = hinges[h + 1];
      const length = Math.hypot(points[a] - points[b], points[a + 1] - points[b + 1], points[a + 2] - points[b + 2]);
      if (length < hinges[h + 2] * .86) hinges[h + 2] += (length - hinges[h + 2]) * .12;
    }
    if (step % stepsPerFrame === 0) samples.push(Float32Array.from(points));
  }
  const folded = Float64Array.from(points);
  for (let step = 1; step <= 80; step++) {
    const t = step / 80;
    const unfold = t * t * (3 - 2 * t);
    for (let pass = 0; pass < 12; pass++) {
      for (let i = 0; i < points.length; i++) {
        const target = folded[i] + (rest[i] - folded[i]) * unfold;
        points[i] += (target - points[i]) * (i % 3 === 2 ? .04 : .22);
      }
      constrain(hinges, 4, .7, pass % 2 === 0);
      constrain(edges, 3, 1, pass % 2 !== 0);
    }
  }
  return { samples, creased: Float32Array.from(points) };
}

self.onmessage = ({ data: { aspect } }) => {
  try {
    const random = randomSource(7);
    const columns = Math.max(8, Math.round(16 / Math.max(1, aspect)));
    const rows = Math.max(8, Math.round(16 * Math.min(1, aspect)));
    const count = (columns + 1) * (rows + 1);
    const rest = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const triangles = [];
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        const index = row * (columns + 1) + col;
        const u = (col + (col > 0 && col < columns ? (random() - .5) * .5 : 0)) / columns;
        const v = (row + (row > 0 && row < rows ? (random() - .5) * .5 : 0)) / rows;
        rest[index * 3] = u - .5;
        rest[index * 3 + 1] = (v - .5) * aspect;
        uvs[index * 2] = u;
        uvs[index * 2 + 1] = v;
        if (col < columns && row < rows) {
          const a = index, b = index + 1, c = index + columns + 1, d = c + 1;
          if (random() > .5) triangles.push(a, b, d, a, d, c);
          else triangles.push(a, b, c, b, d, c);
        }
      }
    }
    const { samples, creased } = createPaperPath(rest, triangles, Math.min(1, aspect), 6, .6, .65, 7);
    const indices = Uint16Array.from(triangles);
    self.postMessage({ rest, uvs, indices, samples, creased },
      [rest.buffer, uvs.buffer, indices.buffer, creased.buffer, ...samples.map(sample => sample.buffer)]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
