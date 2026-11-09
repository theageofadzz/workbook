/*!
 * PaperCrumple rendering adapted from React Bits, copyright (c) 2026 David Haz.
 * MIT + Commons Clause. See paper-crumple-LICENSE.txt.
 */
import * as THREE from "three";
import { toCanvas } from "html-to-image";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const spring = () => ({ value: 0, target: 0, velocity: 0 });
const paths = new Map();

function paperPath(aspect) {
  const key = aspect.toFixed(4);
  if (!paths.has(key)) {
    paths.set(key, new Promise((resolve, reject) => {
      const worker = new Worker(new URL(`paper-crumple-worker.js?v=${PAPER_WORKER_VERSION}`, import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (data.error) reject(new Error(data.error));
        else resolve(data);
      };
      worker.onerror = event => {
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage({ aspect });
    }).catch(error => {
      paths.delete(key);
      throw error;
    }));
  }
  return paths.get(key);
}

function advance(state, dt, duration) {
  const omega = 8 / Math.max(.06, duration);
  const offset = state.value - state.target;
  const term = state.velocity + omega * offset;
  const decay = Math.exp(-omega * dt);
  state.value = state.target + (offset + term * dt) * decay;
  state.velocity = (state.velocity - omega * term * dt) * decay;
  if (Math.abs(state.value - state.target) < .0001 && Math.abs(state.velocity) < .001) {
    state.value = state.target;
    state.velocity = 0;
    return false;
  }
  return true;
}

export async function createPaperReader({ root, sheet, scroller, signal }) {
  if (signal?.aborted || !root.open || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const initial = sheet.getBoundingClientRect();
  if (!initial.width || !initial.height) return null;
  const aspect = initial.height / initial.width;
  const { rest, uvs, indices, samples } = await paperPath(aspect);
  if (signal?.aborted || !root.open) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "paper-crumple-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (error) {
    console.warn("Paper WebGL failed", error);
    return null;
  }
  root.append(canvas);
  const controls = [...sheet.querySelectorAll("[data-paper-grip]")];
  const abort = new AbortController();
  const listen = (element, name, handler, options = {}) =>
    element.addEventListener(name, handler, { ...options, signal: abort.signal });
  const positions = new Float32Array(rest.length);
  const renderPositions = new Float32Array(indices.length * 3);
  const renderNormals = new Float32Array(indices.length * 3);
  const renderUvs = new Float32Array(indices.length * 2);
  const faceNormals = new Float32Array(indices.length);
  const incident = Array.from({ length: rest.length / 3 }, () => []);
  for (let i = 0; i < indices.length; i++) {
    renderUvs[i * 2] = uvs[indices[i] * 2];
    renderUvs[i * 2 + 1] = uvs[indices[i] * 2 + 1];
    incident[indices[i]].push(Math.floor(i / 3) * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(renderPositions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("normal", new THREE.BufferAttribute(renderNormals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("uv", new THREE.BufferAttribute(renderUvs, 2));
  const grainData = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < grainData.length; i += 4) {
    const value = 100 + Math.floor((Math.sin(i * 12.9898 + 7) * 43758.5453 % 1 + 1) % 1 * 155);
    grainData[i] = grainData[i + 1] = grainData[i + 2] = value;
    grainData[i + 3] = 255;
  }
  const grain = new THREE.DataTexture(grainData, 128, 128);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(5, 5 * aspect);
  grain.magFilter = grain.minFilter = THREE.LinearFilter;
  grain.needsUpdate = true;
  const lighting = { value: 0 };
  const materialOptions = { roughness: .92, metalness: 0, bumpMap: grain, bumpScale: .08 * .32, alphaTest: .04, alphaToCoverage: true };
  const frontMaterial = new THREE.MeshStandardMaterial({ ...materialOptions, side: THREE.FrontSide });
  const backMaterial = new THREE.MeshStandardMaterial({ ...materialOptions, side: THREE.BackSide, color: "#f4f0e8" });
  for (const material of [frontMaterial, backMaterial]) {
    material.onBeforeCompile = shader => {
      shader.uniforms.paperLighting = lighting;
      shader.fragmentShader = `uniform float paperLighting;\n${shader.fragmentShader}`;
      if (material === backMaterial) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
          "#include <map_fragment>\n diffuseColor.rgb = diffuse;");
      }
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
        "outgoingLight = mix(diffuseColor.rgb, outgoingLight, paperLighting);\n#include <opaque_fragment>");
    };
    material.customProgramCacheKey = () => material === backMaterial ? "paper-stock" : "paper-print";
  }
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: .04, side: THREE.DoubleSide });
  const paper = new THREE.Group();
  const front = new THREE.Mesh(geometry, frontMaterial);
  const back = new THREE.Mesh(geometry, backMaterial);
  front.castShadow = front.receiveShadow = back.receiveShadow = true;
  front.customDepthMaterial = depthMaterial;
  paper.add(front, back);
  const scene = new THREE.Scene();
  scene.add(paper, new THREE.HemisphereLight(0xffffff, 0xa4a0b0, 1.35));
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 10000);
  const light = new THREE.DirectionalLight(0xfffaf0, 1.8);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -.0002;
  light.shadow.normalBias = .6;
  light.shadow.radius = 3;
  scene.add(light, light.target);
  const floorGeometry = new THREE.PlaneGeometry(1, 1);
  const floorMaterial = new THREE.ShadowMaterial({ opacity: .08, depthWrite: false });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  scene.add(floor);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const amount = spring(), posX = spring(), posY = spring(), tiltX = spring(), tiltY = spring();
  const springs = [amount, posX, posY, tiltX, tiltY];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const anchor = new THREE.Vector3(), world = new THREE.Vector3(), corner = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const weights = new THREE.Vector3();
  let gripIndices = [0, 0, 0];
  let width = 1, height = 1, scale = 1, baseX = 0, baseY = 0;
  let frame = 0, lastTime = 0, previousAmount = -1;
  let held = false, keyboard = false, disposed = false, contextLost = false;
  let gesture = null;
  let pendingPress = null, pressTimer = 0, ignoreClickUntil = 0;
  let texture = null, capturePromise = null, captureTimer = 0, captured = "";

  function setState(state) {
    root.dataset.paperState = state;
    root.dataset.paperActive = String(state !== "flat");
  }
  function deform() {
    if (amount.value === previousAmount) return;
    previousAmount = amount.value;
    const fold = clamp(amount.value, 0, 1);
    const progress = fold * (samples.length - 1);
    const lower = Math.floor(progress);
    const upper = Math.min(lower + 1, samples.length - 1);
    for (let i = 0; i < positions.length; i++) {
      positions[i] = samples[lower][i] + (samples[upper][i] - samples[lower][i]) * (progress - lower);
    }
    for (let face = 0; face < indices.length; face += 3) {
      const ia = indices[face] * 3, ib = indices[face + 1] * 3, ic = indices[face + 2] * 3;
      const bx = positions[ib] - positions[ia], by = positions[ib + 1] - positions[ia + 1], bz = positions[ib + 2] - positions[ia + 2];
      const cx = positions[ic] - positions[ia], cy = positions[ic + 1] - positions[ia + 1], cz = positions[ic + 2] - positions[ia + 2];
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      const length = Math.hypot(nx, ny, nz) || 1;
      faceNormals[face] = nx / length;
      faceNormals[face + 1] = ny / length;
      faceNormals[face + 2] = nz / length;
    }
    for (let i = 0; i < indices.length; i++) {
      const source = indices[i] * 3;
      const face = Math.floor(i / 3) * 3;
      let nx = 0, ny = 0, nz = 0;
      for (const neighbor of incident[indices[i]]) {
        const dot = faceNormals[face] * faceNormals[neighbor] + faceNormals[face + 1] * faceNormals[neighbor + 1]
          + faceNormals[face + 2] * faceNormals[neighbor + 2];
        const weight = THREE.MathUtils.smoothstep(dot, .808, .98);
        nx += faceNormals[neighbor] * weight;
        ny += faceNormals[neighbor + 1] * weight;
        nz += faceNormals[neighbor + 2] * weight;
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      renderPositions.set(positions.subarray(source, source + 3), i * 3);
      renderNormals[i * 3] = nx / length;
      renderNormals[i * 3 + 1] = ny / length;
      renderNormals[i * 3 + 2] = nz / length;
    }
    geometry.attributes.position.needsUpdate = geometry.attributes.normal.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    lighting.value = THREE.MathUtils.smoothstep(fold, 0, .4);
  }
  function setPointer(x, y) {
    pointer.set(x / width * 2 - 1, 1 - y / height * 2);
    raycaster.setFromCamera(pointer, camera);
  }
  function render(time) {
    frame = 0;
    if (disposed || contextLost || document.hidden || !root.open) return;
    const dt = lastTime ? Math.min(.04, (time - lastTime) / 1000) : 1 / 60;
    lastTime = time;
    let moving = false;
    for (const state of springs) moving = advance(state, dt, state === amount ? held ? .55 : .4 : .42) || moving;
    deform();
    paper.rotation.set(tiltX.value, tiltY.value, 0);
    if (held && !keyboard && gesture) {
      anchor.set(0, 0, 0);
      for (let i = 0; i < 3; i++) {
        a.fromBufferAttribute(geometry.attributes.position, gripIndices[i]);
        anchor.addScaledVector(a, weights.getComponent(i));
      }
      anchor.multiplyScalar(scale).applyEuler(paper.rotation);
      plane.constant = -anchor.z;
      setPointer(gesture.x, gesture.y);
      if (raycaster.ray.intersectPlane(plane, world)) {
        posX.value = posX.target = world.x - anchor.x - baseX;
        posY.value = posY.target = world.y - anchor.y - baseY;
        posX.velocity = posY.velocity = 0;
      }
    }
    paper.position.set(baseX + posX.value, baseY + posY.value, 0);
    paper.updateMatrixWorld(true);
    let backZ = Infinity;
    const bounds = geometry.boundingBox;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
      corner.applyMatrix4(paper.matrixWorld);
      backZ = Math.min(backZ, corner.z);
    }
    floor.position.z = backZ - scale * .08;
    renderer.render(scene, camera);
    if (!held && !moving) {
      setState("flat");
      lastTime = 0;
    } else if (moving) wake();
  }
  function wake() {
    if (!frame && !disposed && !contextLost && root.open && !document.hidden) frame = requestAnimationFrame(render);
  }
  function restore(instant = false) {
    cancelPress();
    const pointerId = gesture?.id;
    if (gesture) ignoreClickUntil = performance.now() + 700;
    gesture = null;
    held = keyboard = false;
    controls[0]?.setAttribute("aria-pressed", "false");
    if (pointerId !== undefined && root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
    for (const state of springs) {
      state.target = 0;
      if (instant) state.value = state.velocity = 0;
    }
    if (instant) setState("flat");
    else if (root.dataset.paperActive === "true") setState("restoring");
    wake();
  }
  function resize() {
    if (disposed || !root.open) return;
    cancelPress();
    if (held) restore(true);
    const viewport = root.getBoundingClientRect();
    const rect = sheet.getBoundingClientRect();
    width = Math.max(1, viewport.width);
    height = Math.max(1, viewport.height);
    scale = rect.width;
    baseX = rect.left - viewport.left + rect.width / 2 - width / 2;
    baseY = height / 2 - (rect.top - viewport.top + rect.height / 2);
    paper.scale.setScalar(scale);
    camera.aspect = width / height;
    camera.position.z = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    const reach = Math.max(width, height);
    const angle = THREE.MathUtils.degToRad(-35);
    light.position.set(Math.sin(angle) * reach, Math.cos(angle) * reach, reach * 4);
    light.shadow.camera.left = light.shadow.camera.bottom = -reach;
    light.shadow.camera.right = light.shadow.camera.top = reach;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = reach * 6;
    light.shadow.camera.updateProjectionMatrix();
    floor.scale.set(width * 4, height * 4, 1);
    captured = "";
    scheduleCapture();
    wake();
  }
  const signature = () => `${scroller.scrollTop}:${sheet.clientWidth}:${sheet.clientHeight}`;
  async function capture() {
    if (disposed || !root.open || held) return false;
    const key = signature();
    if (texture && captured === key) return true;
    if (capturePromise) {
      await capturePromise;
      return disposed ? false : capture();
    }
    capturePromise = (async () => {
      const rect = sheet.getBoundingClientRect();
      const clone = sheet.cloneNode(true);
      clone.classList.add("paper-snapshot");
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      clone.style.cssText = `position:fixed;left:-10000px;top:0;width:${rect.width}px;height:${rect.height}px;max-width:none;max-height:none;aspect-ratio:auto;opacity:1;transform:none;animation:none;`;
      clone.querySelectorAll("[hidden],img:not([src]),[data-paper-grip],canvas").forEach(node => node.remove());
      clone.querySelectorAll("[id],[autofocus]").forEach(node => {
        node.removeAttribute("id");
        node.removeAttribute("autofocus");
      });
      clone.querySelectorAll("iframe").forEach(node => {
        const placeholder = document.createElement("div");
        placeholder.style.cssText = `height:${Math.round(scroller.clientWidth * 9 / 16)}px;margin:30px 0;background:#f1f1f1;`;
        node.replaceWith(placeholder);
      });
      const cloneScroller = clone.querySelector("[data-reader-scroll]");
      cloneScroller.style.overflow = "hidden";
      clone.querySelector(".reading-article").style.transform = `translateY(${-scroller.scrollTop}px)`;
      document.body.append(clone);
      try {
        const image = await toCanvas(clone, {
          width: Math.round(rect.width), height: Math.round(rect.height), pixelRatio: Math.min(devicePixelRatio || 1, 2),
          skipFonts: true, style: { position: "static", left: "auto", top: "auto", margin: "0" }
        });
        if (disposed || !root.open || signature() !== key) return false;
        const next = new THREE.CanvasTexture(image);
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture?.dispose();
        texture = next;
        frontMaterial.map = backMaterial.map = depthMaterial.map = texture;
        frontMaterial.needsUpdate = backMaterial.needsUpdate = depthMaterial.needsUpdate = true;
        captured = key;
        root.dataset.paperStatus = "ready";
        controls.forEach(control => { if ("disabled" in control) control.disabled = false; });
        wake();
        return true;
      } catch {
        root.dataset.paperStatus = "unavailable";
        return false;
      } finally {
        clone.remove();
      }
    })();
    try { return await capturePromise; }
    finally { capturePromise = null; }
  }
  function scheduleCapture() {
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => capture(), 180);
  }
  function point(event) {
    const rect = root.getBoundingClientRect();
    return { x: clamp(event.clientX - rect.left, 8, width - 8), y: clamp(event.clientY - rect.top, 8, height - 8) };
  }
  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = 0;
    pendingPress = null;
  }
  async function beginPress(pending) {
    pressTimer = 0;
    if (!await capture() || pendingPress !== pending || disposed || contextLost || !root.open) {
      if (pendingPress === pending) cancelPress();
      return;
    }
    for (const state of springs) state.target = state.value = state.velocity = 0;
    previousAmount = -1;
    deform();
    paper.position.set(baseX, baseY, 0);
    paper.rotation.set(0, 0, 0);
    paper.updateMatrixWorld(true);
    setPointer(pending.x, pending.y);
    const intersection = raycaster.intersectObjects([front, back], false)[0];
    if (!intersection?.face) {
      cancelPress();
      return;
    }
    const { face } = intersection;
    gripIndices = [face.a, face.b, face.c];
    a.fromBufferAttribute(geometry.attributes.position, face.a);
    b.fromBufferAttribute(geometry.attributes.position, face.b);
    c.fromBufferAttribute(geometry.attributes.position, face.c);
    THREE.Triangle.getBarycoord(paper.worldToLocal(intersection.point.clone()), a, b, c, weights);
    gesture = pending;
    cancelPress();
    root.setPointerCapture(pending.id);
    window.getSelection()?.removeAllRanges();
    held = true;
    amount.target = .85;
    controls[0]?.setAttribute("aria-pressed", "true");
    setState("holding");
    wake();
  }
  function pointerDown(event) {
    if (!event.isPrimary) {
      restore(true);
      return;
    }
    if (event.button !== 0 || held || gesture || contextLost || root.dataset.paperStatus !== "ready") return;
    if (event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    cancelPress();
    ignoreClickUntil = 0;
    const start = point(event);
    pendingPress = { id: event.pointerId, ...start, startX: start.x, startY: start.y, time: performance.now() };
    const pending = pendingPress;
    // Wait without capturing the pointer so swipes, selection and short clicks stay native.
    pressTimer = setTimeout(() => beginPress(pending), 400);
  }
  function pointerMove(event) {
    if (pendingPress?.id === event.pointerId) {
      const next = point(event);
      if (Math.hypot(next.x - pendingPress.startX, next.y - pendingPress.startY) > 8) cancelPress();
    }
    if (!gesture || gesture.id !== event.pointerId) return;
    const next = point(event);
    const dt = Math.max(.008, (performance.now() - gesture.time) / 1000);
    const maxTilt = THREE.MathUtils.degToRad(10);
    tiltX.target = clamp((next.y - gesture.y) / dt / 1800, -1, 1) * maxTilt;
    tiltY.target = clamp((next.x - gesture.x) / dt / 1800, -1, 1) * maxTilt;
    Object.assign(gesture, next, { time: performance.now() });
    wake();
  }
  function keyDown(event) {
    if ([" ", "Enter"].includes(event.key)) {
      event.preventDefault();
      if (event.repeat || !texture) return;
      cancelPress();
      held = keyboard = true;
      amount.target = .85;
      controls[0].setAttribute("aria-pressed", "true");
      setState("holding");
      wake();
    } else if (held && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      posX.target = clamp(posX.target + (event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0), -width / 3, width / 3);
      posY.target = clamp(posY.target + (event.key === "ArrowDown" ? -16 : event.key === "ArrowUp" ? 16 : 0), -height / 3, height / 3);
      wake();
    }
  }
  listen(sheet, "pointerdown", pointerDown, { capture: true });
  listen(controls[0], "keydown", keyDown);
  listen(controls[0], "keyup", event => {
    if ([" ", "Enter"].includes(event.key) && keyboard) { event.preventDefault(); restore(); }
  });
  listen(controls[0], "blur", () => { if (keyboard) restore(true); });
  listen(window, "pointermove", pointerMove, { capture: true });
  listen(window, "pointerup", event => {
    if (pendingPress?.id === event.pointerId) cancelPress();
    if (gesture?.id === event.pointerId) restore();
  }, { capture: true });
  listen(window, "pointercancel", event => {
    if (pendingPress?.id === event.pointerId) cancelPress();
    if (gesture?.id === event.pointerId) restore(true);
  }, { capture: true });
  listen(root, "lostpointercapture", event => { if (event.target === root && gesture?.id === event.pointerId) restore(true); });
  listen(root, "touchmove", event => {
    if (held && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  listen(root, "click", event => {
    if (event.detail && (held || performance.now() < ignoreClickUntil)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ignoreClickUntil = 0;
    }
  }, { capture: true });
  listen(sheet, "contextmenu", event => {
    event.preventDefault();
  });
  listen(scroller, "selectstart", event => event.preventDefault());
  listen(scroller, "copy", event => event.preventDefault());
  listen(scroller, "cut", event => event.preventDefault());
  listen(scroller, "scroll", () => {
    cancelPress();
    scheduleCapture();
  }, { passive: true });
  listen(scroller, "wheel", event => {
    cancelPress();
    if (held) event.preventDefault();
  }, { passive: false });
  listen(scroller, "load", scheduleCapture, { capture: true });
  listen(window, "blur", () => restore(true));
  listen(document, "visibilitychange", () => { if (document.hidden) restore(true); });
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    restore(true);
  });
  listen(canvas, "webglcontextrestored", () => {
    contextLost = false;
    previousAmount = -1;
    wake();
  });
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  observer.observe(sheet);
  root.dataset.paperStatus = "loading";
  setState("flat");
  resize();
  document.fonts.ready.then(() => { if (!disposed) scheduleCapture(); });
  const controller = {
    get active() { return held || Boolean(gesture) || root.dataset.paperActive === "true"; },
    restore,
    destroy() {
      if (disposed) return;
      restore(true);
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(captureTimer);
      abort.abort();
      observer.disconnect();
      controls.forEach(control => { if ("disabled" in control) control.disabled = true; });
      geometry.dispose();
      grain.dispose();
      texture?.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();
      depthMaterial.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      delete root.dataset.paperActive;
      delete root.dataset.paperState;
      delete root.dataset.paperStatus;
    }
  };
  signal?.addEventListener("abort", () => controller.destroy(), { once: true });
  return controller;
}
