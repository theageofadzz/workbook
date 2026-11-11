/* Isolation adapters for the original drone blueprint and flight. */

function createParameters() {
  const parameters = {};
  for (const rows of Object.values(s_)) {
    for (const [key, , value] of rows) {
      parameters[key] = value?.select ? value.select[0] : value;
    }
  }
  Object.assign(parameters, {
    enOn: false, ltHeight: 0, stackWidth: 0, stackAspect: 0,
  });
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    Object.assign(parameters, {
      autoReveal: false, liftTime: 0.4, landTime: 0.4,
      expandTime: 0.4, retractTime: 0.4, stSwirl: 0, stBend: 0, ripple: 0,
    });
  }
  return { P: parameters };
}

function layoutBlueprint(force) {
  if (!AC || ($.mode !== "flat" && DC.ready)) return false;
  const key = [$S, eC].join(":");
  if (!force && DC.key === key) return false;
  DC.key = key;
  DC.ready = true;
  const scale = Math.min($S / 999, eC / 1072);
  const offsetX = ($S - 999 * scale) / 2;
  const offsetY = (eC - 1072 * scale) / 2;
  const unit = eC / LS;
  const centerX = offsetX + 502 * scale;
  const centerY = offsetY + 590 * scale;
  const hubSpan = 496 * scale;
  const sourceX = (AC.TL[0] + AC.TR[0]) / 2;
  const sourceY = (AC.TL[1] + AC.BL[1]) / 2;
  jC.s = hubSpan / unit / (AC.TR[0] - AC.TL[0]);
  jC.dx = (centerX - $S / 2) / unit - US - (sourceX - US) * jC.s;
  jC.dy = (eC / 2 - centerY) / unit - WS - (sourceY - WS) * jC.s;
  const cell = hubSpan / 10;
  DC.c = cell;
  DC.M = cell * 5;
  DC.ox = centerX;
  DC.oy = centerY;
  RS = cell / unit;
  const major = RS * 5;
  const gridX = (centerX - $S / 2) / unit;
  const gridY = (eC / 2 - centerY) / unit;
  $.gridOffX = gridX - Math.round(gridX / major) * major;
  $.gridOffY = gridY - Math.round(gridY / major) * major;
  Pf.uGridOff.value.set($.gridOffX, $.gridOffY);
  Q.size = jC.s * 0.72;
  iC.style.fontSize = `${Math.max(Math.min(10, $S / 32), 15 * scale)}px`;
  iC.style.display = "";
  document.documentElement.style.setProperty("--cell", `${cell}px`);
  document.documentElement.dataset.ready = "true";
  tC.setAttribute("aria-busy", "false");
  return true;
}

function createEmptyTextLayers() {
  const letters3D = new Tn();
  return {
    letters3D,
    attachLetters(parent) { parent.add(letters3D); },
    prewarm() {}, build() {}, show() {}, home() { return true; },
    setLetterMaterial() {}, step() {}, lettersNear() { return false; },
  };
}

function createEmptyEntry() {
  return { play() {}, finish() {}, get running() { return false; } };
}

function beginFlight(x, y) {
  if (!aC || $.mode !== "flat") return;
  const unit = eC / LS;
  const hubs = Object.values(AC).map(([hubX, hubY]) => [
    $S / 2 + (US + jC.dx + (hubX - US) * jC.s) * unit,
    eC / 2 - (WS + jC.dy + (hubY - WS) * jC.s) * unit,
  ]);
  const minX = Math.min(...hubs.map(hub => hub[0]));
  const maxX = Math.max(...hubs.map(hub => hub[0]));
  const minY = Math.min(...hubs.map(hub => hub[1]));
  const maxY = Math.max(...hubs.map(hub => hub[1]));
  const margin = (maxX - minX) * .22;
  if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) return;
  $.mode = "spinup";
  $.interacted = true;
  const now = performance.now();
  aC.setSpin(true, now);
  $.liftAt = now + Q.liftDelay * 1000;
  $.pressAt = [x, y];
  $.fullStart = now;
  $.fullDir = 1;
  $.pos.x = $.target.x = zC.x;
  $.pos.y = $.target.y = zC.y;
  $.pos.vx = $.pos.vy = 0;
  BC.finish();
  dC.build(tC, eC / LS);
  dC.show(true);
  tC.classList.add("flying");
}
