export const demoSteps = [
  { count: 9, hold: 2.2 },
  { count: 10, hold: 1.45 },
  { count: 11, hold: 1.45 },
  { count: 12, hold: 2 },
  { count: 11, hold: 1.45 },
  { count: 10, hold: 1.45 },
  { count: 9, hold: 1.45 },
  { count: 8, hold: 1.45 },
  { count: 7, hold: 2 },
  { count: 8, hold: 1.45 },
  { count: 9, hold: 2.2 }
];

export const demoDuration = demoSteps.reduce((sum, step) => sum + step.hold, 0);

export function demoCountAt(time) {
  let remaining = ((time % demoDuration) + demoDuration) % demoDuration;
  for (const step of demoSteps) {
    if (remaining < step.hold) return step.count;
    remaining -= step.hold;
  }
  return 9;
}
