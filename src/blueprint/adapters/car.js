/* Keep the reference grid, stroke shaders and reveal mask, with a vehicle
   drawing and stationary 3D inspection in place of the original flight. */

function createParameters() {
  const parameters = {};
  for (const rows of Object.values(s_)) {
    for (const [key, , value] of rows) {
      parameters[key] = value?.select ? value.select[0] : value;
    }
  }
  Object.assign(parameters, {
    enOn: false,
    ltHeight: 0,
    stackWidth: 0,
    stackAspect: 0,
    airMode: "none",
    ripple: 0,
    revealTime: 2.8,
    expandTime: 1.5,
    retractTime: 1.1,
    pixelRatio3D: 1.75,
  });
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    Object.assign(parameters, {
      autoReveal: false,
      liftTime: 0.4,
      landTime: 0.4,
      expandTime: 0.4,
      retractTime: 0.4,
      stSwirl: 0,
      stBend: 0,
      ripple: 0,
    });
  }
  return { P: parameters };
}

function layoutBlueprint(force) {
  if (!AC) return false;
  const key = [$S, eC].join(":");
  if (!force && DC.key === key) return false;
  DC.key = key;
  DC.ready = true;

  const unit = eC / LS;
  const length = Math.min(eC * 0.67, $S * 1.05);
  const centerX = $S / 2;
  const centerY = eC * 0.52;
  jC.s = length / unit / 6.7;
  jC.dx = -US;
  jC.dy = (eC / 2 - centerY) / unit - WS;

  const cell = length / 15;
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

  iC.style.fontSize = `${$S < 340 ? 9 : $S < 600 ? 10 : 13}px`;
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
    prewarm() {},
    build() {},
    show() {},
    home() { return true; },
    setLetterMaterial() {},
    step() {},
    lettersNear() { return false; },
  };
}

function createEmptyEntry() {
  return {
    play() {},
    finish() {},
    get running() { return false; },
  };
}

function beginFlight(x, y) {
  if (!aC || $.mode !== "flat" || !aC.hitTest(x, y)) return;
  $.mode = "lifting";
  $.interacted = true;
  $.pressAt = [x, y];
  $.tw = GC($.t, 1, Q.expandTime * 1000);
  $.maskTween = GC($.full, 1, Q.expandTime * 1000);
  tC.classList.add("flying");
}

function returnToBlueprint() {
  if ($.mode === "flat" || $.mode === "landing") return;
  $.mode = "landing";
  $.dragging = false;
  $.rotV = 0;
  $.returnRotation = $.rot;
  $.tw = GC($.t, 0, Q.retractTime * 1000);
  $.maskTween = GC($.full, 0, Q.retractTime * 1000);
  tC.classList.remove("dragging");
}

function drawVehicle(data) {
  const paths = data.strokes.map((stroke, index) => ({
    p: stroke.p.map(([x, y]) => [US + x, WS + y]),
    w: stroke.h ? xC.heavy : xC.thin * 0.84,
    t0: stroke.h ? 0.06 : 0.12 + index / data.strokes.length * 0.54,
    dur: stroke.h ? 0.47 : 0.13,
    b: stroke.h ? 0.92 : 0.64,
  }));
  const line = (points, start = 0.72, bright = 0.38) => {
    paths.push({
      p: points.map(([x, y]) => [US + x, WS + y]),
      w: xC.cons, t0: start, dur: 0.09, b: bright,
    });
  };
  const dashed = (a, b, start) => {
    wC(a, b, 0.1, 0.075, { pattern: [0.16, 0.07, 0.03, 0.07] })
      .forEach(points => line(points, start, 0.24));
  };
  const dimension = (a, b, start) => {
    line([a, b], start, 0.56);
    for (const [x, y] of [a, b]) {
      line([[x - 0.065, y - 0.065], [x + 0.065, y + 0.065]], start, 0.76);
    }
  };
  dashed([0, -3.85], [0, 3.85], 0);
  dashed([-2, 0], [2, 0], 0.02);
  line([[-1.18, 3.41], [-1.18, 3.93]]);
  line([[1.18, 3.41], [1.18, 3.93]]);
  dimension([-1.18, 3.8], [1.18, 3.8], 0.72);
  line([[1.35, -3.35], [2.05, -3.35]], 0.74);
  line([[1.35, 3.35], [2.05, 3.35]], 0.74);
  dimension([1.94, -3.35], [1.94, 3.35], 0.76);
  line([[-0.65, 0.68], [-1.72, 0.68], [-1.95, 1.02]], 0.78, 0.5);
  line([[0.78, -1.35], [1.58, -1.35]], 0.8, 0.5);
  bC(paths);

  const label = (x, y, text, start, style) => {
    const element = document.createElement("span");
    element.innerHTML = text;
    element.style.cssText = style;
    element.dataset.x = US + x;
    element.dataset.y = WS + y;
    element.dataset.p = start;
    iC.append(element);
    element.chars = FC(element);
    element.shown = 0;
    EC.push(element);
  };
  label(0, 3.88, "1,849 mm", 0.78, "transform:translate(-50%,-100%)");
  label(2.04, 0, "4,694 mm", 0.8, "transform:translateY(-50%)");
  label(-2.02, 1.08, "<b>Glass roof</b><span class=\"detail\">Panoramic glazing</span>", 0.82,
    "transform:translate(-100%,-50%);text-align:right");
  label(1.65, -1.35, "<b>Model 3</b><span class=\"detail\">Electric architecture</span>", 0.84,
    "transform:translateY(-50%)");
}

async function createVehicleRenderer({ canvas, camera, url, drawing }) {
  const renderer = new Td({
    canvas, antialias: true, alpha: true,
    premultipliedAlpha: true, powerPreference: "high-performance",
  });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = Fe;
  renderer.toneMapping = 7;
  renderer.toneMappingExposure = 1.1;
  renderer.autoClear = false;
  const scene = new Nn();
  scene.environment = Gf(renderer, [".13,.15,.2", ".4,.42,.46", ".65,.67,.7"], [
    [18, 6, -10, 18, 8, 6], [6, 24, 14, 8, -5, 5],
    [22, 3, 0, 10, -12, 8], [4, 18, -14, 4, 0, 4],
  ], 0.01);
  scene.environmentIntensity = 0.85;
  const sun = new Ws(0xf4f7ff, 3.2);
  sun.position.set(-5, 8, 12);
  scene.add(sun);
  const root = new Tn();
  const pose = new Tn();
  root.add(pose);
  scene.add(root);
  const loaded = await new kd().setMeshoptDecoder(jf).loadAsync(url);
  const model = new Tn();
  model.rotation.y = Math.PI;
  model.add(loaded.scene);
  const normalization = new Tn();
  normalization.scale.setScalar(drawing.meta.factor);
  model.position.fromArray(drawing.meta.center).multiplyScalar(-1);
  normalization.add(model);
  pose.add(normalization);

  loaded.scene.traverse(part => {
    if (!part.isMesh) return;
    const material = part.material.clone();
    const name = material.name.toLowerCase();
    if (name.startsWith("primary")) {
      material.color.setHex(0xe9edef);
      material.map = null;
      material.metalness = 0.28;
      material.roughness = 0.22;
    } else if (name.startsWith("glass")) {
      material.color.setHex(0x121a23);
      material.map = null;
      material.transparent = false;
      material.opacity = 1;
      material.metalness = 0.35;
      material.roughness = 0.1;
      material.depthWrite = true;
    } else if (name.startsWith("wheels") && !name.endsWith(".6")) {
      material.metalness = 0.75;
      material.roughness = Math.max(0.2, material.roughness);
    }
    part.material = material;
    part.frustumCulled = false;
  });

  // Multiply the finished transparent render by the reference's exact cell mask.
  const maskScene = new Nn();
  const maskCamera = new Hs(-1, 1, 1, -1, 0, 1);
  const maskUniforms = { ...Pf, uMPx: { value: 90 } };
  maskScene.add(new ti(new Eo(2, 2), new Lo({
    uniforms: maskUniforms, depthTest: false, depthWrite: false,
    transparent: true, blending: 5,
    blendSrc: 200, blendDst: 204, blendSrcAlpha: 200, blendDstAlpha: 204,
    vertexShader: "void main(){gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `precision highp float; ${Ff}
      void main(){gl_FragColor=vec4(1.,1.,1.,maskField(gl_FragCoord.xy).x);}`,
  })));
  const view = new Ls(30, 1, 1, 900);
  const footprint = drawing.strokes[0].p;
  return {
    r: renderer, car: root, scene, cam3: view,
    maskPx(value) { maskUniforms.uMPx.value = value; },
    setSize(width, height, ratio) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
    },
    prewarm() {
      renderer.compile(scene, view);
      renderer.compile(maskScene, maskCamera);
    },
    hitTest(x, y) {
      const unit = eC / LS * jC.s;
      const px = (x - $S / 2) / unit;
      const py = (eC * 0.52 - y) / unit;
      let inside = false;
      for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
        const a = footprint[i], b = footprint[j];
        if ((a[1] > py) !== (b[1] > py)
          && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    },
    update(progress, rotation) {
      const ease = YS(0, 1, progress);
      root.position.set(0, (eC / 2 - eC * 0.52) / (eC / LS), 0);
      const inspectionScale = Math.min(jC.s * 1.23, $S * 0.83 / ((eC / LS) * 7.4));
      root.scale.setScalar(ZS(jC.s, inspectionScale, ease));
      pose.rotation.set(Math.PI / 2 - Tt.degToRad(63) * ease, 0, 0);
      root.rotation.z = -Tt.degToRad(10) * ease;
      normalization.rotation.y = -Tt.degToRad(32) * ease - rotation / qS * Math.PI * 2;
      const fov = 2.2 + (camera.fov - 2.2) * ease;
      const distance = camera.position.z * Math.tan(Tt.degToRad(camera.fov / 2))
        / Math.tan(Tt.degToRad(fov / 2));
      view.fov = fov;
      view.aspect = camera.aspect;
      view.position.set(0, 0, distance);
      view.near = Math.max(0.1, distance - 30);
      view.far = distance + 100;
      view.updateProjectionMatrix();
      view.updateMatrixWorld();
      renderer.clear();
      if (Pf.uMStr.value < 0.001 && Pf.uMExpand.value < 0.001 && progress === 0) return;
      renderer.render(scene, view);
      renderer.render(maskScene, maskCamera);
    },
  };
}

function renderVehicleFrame(now) {
  const dt = Math.min(0.1, Math.max(0.001, (now - tw) / 1000));
  tw = now;
  $.draw = Q.autoReveal
    ? XS((now - $.revealStart - Q.revealDelay * 1000) / (Q.revealTime * 1000)) : 1;
  $.drawShown = $.draw;
  _C.uP.value = $.draw * 1.04;
  if ($.tw) {
    const time = XS((now - $.tw.start) / $.tw.ms);
    $.t = ZS($.tw.from, $.tw.to, JS(time));
    if ($.mode === "landing") $.rot = $.returnRotation * (1 - JS(time));
    if (time === 1) {
      $.tw = null;
      $.mode = $.t === 1 ? "flying" : "flat";
      if ($.mode === "flat") tC.classList.remove("flying");
    }
  }
  if ($.maskTween) {
    const time = XS((now - $.maskTween.start) / $.maskTween.ms);
    $.full = ZS($.maskTween.from, $.maskTween.to, JS(time));
    if (time === 1) $.maskTween = null;
  }
  if ($.mode === "flying" && !$.dragging) {
    $.rotV *= Math.exp(-dt * 3.2);
    $.rot += $.rotV * dt * 60;
  }
  const typeTime = (now - $.revealStart) / 1000 - Q.revealDelay;
  EC.forEach(element => {
    element.style.opacity = 1 - YS(0, 0.22, $.full);
    const count = Q.autoReveal
      ? XS(Math.floor((typeTime - +element.dataset.p * Q.revealTime) * Q.typeRate),
        0, element.chars.length) : element.chars.length;
    if (count !== element.shown) {
      for (let i = Math.min(count, element.shown); i < Math.max(count, element.shown); i++) {
        element.chars[i].classList.toggle("on", count > element.shown);
      }
      element.shown = count;
    }
  });
  const inside = $.mouse.inside;
  $.mouse.inside = inside && aC.hitTest($.mouse.x, $.mouse.y);
  ew(now, dt, eC / LS);
  $.mouse.inside = inside;
  const tilt = 32 * $.t;
  uC.rotation.x = -Tt.degToRad(tilt);
  rC.style.transform = `rotateX(${tilt}deg)`;
  tC.classList.toggle("can-fly", $.mode === "flat" && aC.hitTest($.mouse.x, $.mouse.y));
  hC.uniforms.uTime.value = now / 1000;
  sC.setRenderTarget(null);
  sC.render(lC, oC);
  aC.update($.t, $.rot);
  requestAnimationFrame(ow);
}

async function startVehicleStudy() {
  JC();
  await document.fonts.load('500 40px "Geist Variable"');
  const response = await fetch("data/car.json");
  if (!response.ok) throw new Error("Vehicle drawing could not load");
  const drawing = await response.json();
  IC(drawing);
  AC = drawing.meta;
  aC = await Kf({
    canvas: cC, camera: oC, url: "models/tesla-model-3.glb", drawing,
  });
  window.__vehicle3d = aC;
  aC.prewarm();
  aC.setSize($S, eC, $.dpr3);
  PC(true);
  $C(jC);
  document.documentElement.classList.add("ready");
  $.revealStart = performance.now();
  requestAnimationFrame(ow);
}
