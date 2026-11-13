import * as THREE from "three";
import { MIN_CELLS, MAX_CELLS, INITIAL_COUNT, definitions, getCellLayout, advanceSpring } from "./layout.js";
import { demoCountAt } from "./demo.js";

const canvas = document.querySelector("#scene");
const labelLayer = document.querySelector(".labels");
const loading = document.querySelector(".loading");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coverMode = location.hash === "#cover";
const presentationMode = coverMode || location.hash === "#showcase";
if (presentationMode) {
  document.body.inert = true;
  canvas.setAttribute("aria-label", "细胞数量自动增减与轻微呼吸动画");
}
let demoPlaying = (presentationMode || location.hash === "#demo") && !reducedMotion;
let demoTime = 0;
let demoButton;
let demoButtonUntil = 0;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x030303, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
camera.position.set(0, 0, 12.6);
const group = new THREE.Group();
scene.add(group);
let previousFrame = performance.now();
const shared = {
  uTime: { value: 0 },
  uPulse: { value: 0 },
  uResolution: { value: new THREE.Vector2() }
};

const background = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: shared,
    vertexShader: `varying vec2 vUv;
      void main() { vUv=uv; gl_Position=vec4(position.xy,0.9999,1.); }`,
    fragmentShader: `precision highp float;
      varying vec2 vUv;
      uniform vec2 uResolution;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main() {
        float y=1.-vUv.y;
        vec3 color=mix(vec3(.0002,.0002,.00015),vec3(.020,.014,.014),smoothstep(.27,.57,y));
        color=mix(color,vec3(.245,.178,.172),smoothstep(.48,.80,y));
        color=mix(color,vec3(.535,.366,.346),smoothstep(.70,1.04,y));
        float light=1.-.1*pow(abs(vUv.x-.5)*2.,1.8);
        color*=light;
        color+=(hash(gl_FragCoord.xy)-.5)*.0015;
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  })
);
background.frustumCulled = false;
background.renderOrder = -10;
scene.add(background);

const vertexShader = `
precision highp float;
uniform float uRadius;
uniform float uTime;
uniform float uPhase;
uniform vec4 uPlanes[8];
uniform int uPlaneCount;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vLocal;
varying float vRim;

float smoothMin(float a,float b,float k) {
  float h=max(k-abs(a-b),0.)/k;
  return min(a,b)-h*h*k*.25;
}

float radial(vec3 d) {
  float r=uRadius;
  for(int j=0;j<8;j++){
    if(j>=uPlaneCount) break;
    float a=dot(d,uPlanes[j].xyz);
    if(a>.0001) r=smoothMin(r,uPlanes[j].w/a,.115);
  }
  float wave=sin(d.x*3.+uTime*.46+uPhase)*sin(d.y*3.7-uTime*.32+uPhase);
  return r+wave*.010*min(1.,uRadius*5.);
}

void main() {
  vec3 d=normalize(position);
  vec3 tangent=normalize(cross(d,abs(d.y)<.95?vec3(0.,1.,0.):vec3(1.,0.,0.)));
  vec3 bitangent=cross(d,tangent);
  float epsilon=.003;
  vec3 p=d*radial(d);
  vec3 da=normalize(d+tangent*epsilon);
  vec3 db=normalize(d+bitangent*epsilon);
  vec3 n=normalize(cross(da*radial(da)-p,db*radial(db)-p));
  vNormal=normalize(normalMatrix*n);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  vPosition=mv.xyz;
  vLocal=p;
  vRim=radial(d)/uRadius;
  gl_Position=projectionMatrix*mv;
}`;

const fragmentShader = `
precision highp float;
uniform float uPhase;
uniform float uTime;
uniform float uPulse;
uniform float uSelected;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vLocal;
varying float vRim;
float hash(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 N=normalize(vNormal);
  vec3 V=normalize(-vPosition);
  float ndv=max(dot(N,V),0.);
  float fres=pow(1.-ndv,3.0);
  float edge=pow(1.-ndv,9.);
  vec3 R=reflect(-V,N);
  // Broad area reflections make the membrane read as smoked glass.
  float upper=exp(-pow((R.y-.72)/.55,2.))*smoothstep(-.65,.4,R.x);
  float left=exp(-pow((R.x+.83)/.25,2.))*smoothstep(-.4,.85,R.y);
  float floorLight=pow(1.-smoothstep(-.95,.1,R.y),1.7);
  float topLight=pow(max(dot(N,normalize(vec3(-.1,1.,.45))),0.),3.);
  float sideLight=pow(max(dot(N,normalize(vec3(-1.,.25,.12))),0.),5.);
  vec3 base=vec3(.0085,.0095,.0075);
  base+=vec3(.045,.019,.017)*topLight;
  base+=vec3(.062,.024,.021)*pow(max(N.y*.8+.15,0.),2.);
  base+=vec3(.10,.057,.051)*upper*.30;
  base+=vec3(.092,.068,.064)*floorLight*fres;
  base+=vec3(.16,.127,.122)*fres*(.22+upper*.4+left*.35);
  base+=vec3(.23,.216,.205)*edge*(.26+left*.45+floorLight*.55);
  base+=vec3(.052,.046,.044)*sideLight;
  float inner=pow(1.-ndv,1.2)-pow(1.-ndv,3.);
  base+=vec3(.023,.018,.017)*inner;
  float highlight=pow(max(dot(R,normalize(vec3(-.7,.7,.7))),0.),34.);
  base+=vec3(.012,.009,.008)*highlight;
  base+=vec3(.042,.021,.017)*(uPulse*.55+uSelected*.32)*(.18+fres);
  base+=(hash(gl_FragCoord.xy)-.5)*.0018;
  gl_FragColor=vec4(base,1.);
  #include <colorspace_fragment>
}`;

let targetCount = INITIAL_COUNT;
let layout = getCellLayout(targetCount);
const geometry = new THREE.SphereGeometry(1, 88, 64);
const cells = definitions.map((definition, index) => {
  const enabled = index < INITIAL_COUNT;
  const start = layout.points[index] || definition;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uRadius: { value: definition.r },
      uPhase: { value: index * 1.731 },
      uTime: shared.uTime,
      uPulse: shared.uPulse,
      uSelected: { value: 0 },
      uPlanes: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uPlaneCount: { value: 0 }
    }
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(start.x, start.y, start.z);
  mesh.visible = enabled;
  mesh.userData.index = index;
  group.add(mesh);
  const label = document.createElement("span");
  label.className = "cell-label";
  label.textContent = definition.name;
  labelLayer.append(label);
  return {
    ...definition, mesh, label, index,
    position: new THREE.Vector3(start.x, start.y, start.z),
    radius: enabled ? definition.r : 0,
    target: new THREE.Vector3(start.x, start.y, start.z),
    motion: {
      x: { value: start.x, velocity: 0 },
      y: { value: start.y, velocity: 0 },
      z: { value: start.z, velocity: 0 }
    },
    life: { value: enabled ? 1 : 0, velocity: 0 },
    desiredGrowth: enabled ? 1 : 0
  };
});

const membraneCells = cells.map(cell => new THREE.Vector3(cell.position.x, cell.position.y, cell.radius));
const membrane = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 18),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uCells: { value: membraneCells } },
    vertexShader: `varying vec2 vPoint;
      void main() { vPoint=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vPoint;
      uniform vec3 uCells[${MAX_CELLS}];
      float smin(float a,float b,float k) {
        float h=max(k-abs(a-b),0.)/k;
        return min(a,b)-h*h*k*.25;
      }
      void main() {
        float d=10.;
        for(int i=0;i<${MAX_CELLS};i++) {
          if(uCells[i].z>.005) d=smin(d,length(vPoint-uCells[i].xy)-uCells[i].z*1.025,min(.38,uCells[i].z*.6));
        }
        if(d>.035) discard;
        float rim=exp(-abs(d)*65.);
        float body=.017+max(-vPoint.y,0.)*.003;
        vec3 color=vec3(body,body*.91,body*.85)+vec3(.13,.12,.115)*rim;
        gl_FragColor=vec4(color,(1.-smoothstep(-.01,.035,d))*.68);
        #include <colorspace_fragment>
      }`
  })
);
membrane.position.z = -.42;
membrane.renderOrder = -1;
group.add(membrane);

let width = 1;
let height = 1;
let paused = reducedMotion;
let time = 0;
let yaw = -.025;
let pitch = .025;
let targetYaw = yaw;
let targetPitch = pitch;
let dragging = false;
let pointerDown = null;
let dragDistance = 0;
let pulse = 0;
let lastInteraction = 0;
let zoom = 1;
let targetZoom = 1;
const pointer = new THREE.Vector2(-10, -10);
const raycaster = new THREE.Raycaster();
const projectVector = new THREE.Vector3();
let selected = -1;
let cameraTarget = camera.position.z;
const cameraDistance = { value: cameraTarget, velocity: 0 };
let cameraInitialized = false;

function updateCameraTarget() {
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const distanceForHeight = Math.max(4.6, layout.height * 1.24 + .5) / (2 * tangent);
  const distanceForWidth = Math.max(3.4, layout.width * 1.24 + .5) / (2 * tangent * camera.aspect);
  cameraTarget = Math.max(distanceForHeight, distanceForWidth);
}

function resize() {
  width = innerWidth;
  height = innerHeight;
  renderer.setSize(width, height);
  shared.uResolution.value.set(width, height);
  camera.aspect = width / height;
  updateCameraTarget();
  if (!cameraInitialized) {
    cameraDistance.value = cameraTarget;
    cameraInitialized = true;
  }
  camera.position.z = cameraDistance.value;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

function updateCells(t, dt) {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (reducedMotion) {
      cell.life.value = cell.desiredGrowth;
      cell.life.velocity = 0;
    } else {
      advanceSpring(cell.life, cell.desiredGrowth, dt, 54, 12);
    }
    const growth = THREE.MathUtils.clamp(cell.life.value, 0, 1.08);
    cell.mesh.visible = growth > .004;
    for (const axis of ["x", "y", "z"]) {
      if (reducedMotion) {
        cell.motion[axis].value = cell.target[axis];
        cell.motion[axis].velocity = 0;
      } else {
        advanceSpring(cell.motion[axis], cell.target[axis], dt, 40, 12);
      }
    }
    const p = i * 1.731;
    const sway = Math.sin(t * .38 + p);
    cell.position.set(
      cell.motion.x.value + (sway * .070 + Math.sin(t * .22 + p * .5) * .04) * growth,
      cell.motion.y.value + Math.sin(t * .44 + p) * .065 * growth,
      cell.motion.z.value + Math.sin(t * .31 + p) * .038 * growth
    );
    cell.radius = cell.r * growth * (1 + Math.sin(t * .65 + p) * .022 + pulse * .018);
    cell.mesh.position.copy(cell.position);
    const stretch = Math.sin(Math.PI * THREE.MathUtils.clamp(growth, 0, 1)) * .16;
    cell.mesh.scale.set(1 - stretch * .4, 1 + stretch, 1 - stretch * .4);
    cell.mesh.material.uniforms.uRadius.value = Math.max(.001, cell.radius);
    const selectedUniform = cell.mesh.material.uniforms.uSelected;
    selectedUniform.value += ((selected === i ? 1 : 0) - selectedUniform.value) * .07;
  }
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    let planeIndex = 0;
    // Only nearby, living neighbours can form a contact plane.
    const neighbours = cells
      .filter(other => other !== cell && other.radius > .015)
      .sort((a, b) => a.position.distanceToSquared(cell.position) - b.position.distanceToSquared(cell.position))
      .slice(0, 8);
    for (const other of neighbours) {
      const normal = other.position.clone().sub(cell.position);
      const distance = Math.max(.001, normal.length());
      normal.divideScalar(distance);
      const plane = (distance * distance + cell.radius * cell.radius - other.radius * other.radius) / (2 * distance);
      cell.mesh.material.uniforms.uPlanes.value[planeIndex++].set(normal.x, normal.y, normal.z, Math.max(.025, plane - .009));
    }
    cell.mesh.material.uniforms.uPlaneCount.value = planeIndex;
    membraneCells[i].set(cell.position.x, cell.position.y, cell.radius);
  }
}

function updateLabels() {
  group.updateMatrixWorld(true);
  const scale = Math.min(1.08, Math.max(.62, height / 1000));
  for (const cell of cells) {
    cell.label.hidden = !cell.mesh.visible;
    if (!cell.mesh.visible) continue;
    projectVector.set(0, 0, cell.radius * .95);
    cell.mesh.localToWorld(projectVector);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion).z;
    projectVector.project(camera);
    const x = (projectVector.x * .5 + .5) * width;
    const y = (-projectVector.y * .5 + .5) * height;
    cell.label.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${scale})`;
    const growthOpacity = THREE.MathUtils.smoothstep(cell.life.value, .2, .9);
    cell.label.style.opacity = (Math.max(0, Math.min(.78, (facing - .22) * 1.2)) * growthOpacity).toFixed(3);
  }
}

const controls = {
  sound: document.querySelector("#sound"),
  fullscreen: document.querySelector("#fullscreen"),
  reset: document.querySelector("#reset"),
  pause: document.querySelector("#pause"),
  add: document.querySelector("#add-cell"),
  remove: document.querySelector("#remove-cell"),
  count: document.querySelector("#cell-count")
};
function setIcon(button, icon) {
  const svg = new DOMParser().parseFromString(CELLS_ICONS[icon], "image/svg+xml").documentElement;
  svg.setAttribute("aria-hidden", "true");
  button.replaceChildren(document.importNode(svg, true));
}
setIcon(controls.sound, "volume-x");
setIcon(controls.fullscreen, "maximize");
setIcon(controls.reset, "rotate-ccw");
setIcon(controls.pause, paused ? "play" : "pause");
setIcon(controls.add, "plus");
setIcon(controls.remove, "minus");
if (demoPlaying) controls.count.setAttribute("aria-live", "off");

function stopDemo() {
  demoPlaying = false;
  demoButton?.classList.remove("is-demonstrating");
  demoButton = null;
  controls.count.setAttribute("aria-live", "polite");
}
if (!presentationMode) {
  document.addEventListener("pointerdown", stopDemo, { capture: true });
  document.addEventListener("keydown", stopDemo, { capture: true });
}

function nearestSurvivor(point, count, skipIndex = -1) {
  let closest;
  let distance = Infinity;
  for (let i = 0; i < count; i++) {
    if (i === skipIndex) continue;
    const cell = cells[i];
    const d = (point.x - cell.motion.x.value) ** 2 + (point.y - cell.motion.y.value) ** 2;
    if (d < distance) {
      closest = cell;
      distance = d;
    }
  }
  return closest;
}

function setCellCount(nextCount) {
  const next = THREE.MathUtils.clamp(nextCount, MIN_CELLS, MAX_CELLS);
  if (next === targetCount) return;
  const previous = targetCount;
  const nextLayout = getCellLayout(next);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (i < next) {
      const destination = nextLayout.points[i];
      if (cell.desiredGrowth === 0 && cell.life.value < .01) {
        const parent = nearestSurvivor(destination, Math.min(previous, next), i);
        if (parent) {
          const direction = new THREE.Vector3(destination.x - parent.motion.x.value, destination.y - parent.motion.y.value, .12).normalize();
          for (const axis of ["x", "y", "z"]) {
            cell.motion[axis].value = parent.motion[axis].value + direction[axis] * parent.r * .92;
            cell.motion[axis].velocity = parent.motion[axis].velocity;
          }
          cell.life.value = .005;
          cell.life.velocity = .08;
        }
      }
      cell.target.set(destination.x, destination.y, destination.z);
      cell.desiredGrowth = 1;
    } else {
      cell.desiredGrowth = 0;
      if (cell.life.value > .001) {
        const parent = nearestSurvivor(cell.position, next);
        const destination = nextLayout.points[parent.index];
        cell.target.set(destination.x, destination.y, destination.z + .04);
      }
    }
  }
  targetCount = next;
  layout = nextLayout;
  updateCameraTarget();
  controls.count.value = String(next).padStart(2, "0");
  controls.count.setAttribute("aria-label", `${next} 个细胞`);
  controls.add.disabled = next === MAX_CELLS;
  controls.remove.disabled = next === MIN_CELLS;
  if (!reducedMotion) {
    controls.count.getAnimations().forEach(animation => animation.cancel());
    controls.count.animate(
      [{ opacity: .3, transform: `translateY(${next > previous ? 5 : -5}px)` }, { opacity: .85, transform: "translateY(0)" }],
      { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }
  pulse = .4;
  lastInteraction = performance.now();
  playNote(next - 1);
}
controls.add.addEventListener("click", () => setCellCount(targetCount + 1));
controls.remove.addEventListener("click", () => setCellCount(targetCount - 1));

function togglePause() {
  paused = !paused;
  controls.pause.setAttribute("aria-pressed", String(paused));
  controls.pause.setAttribute("aria-label", paused ? "播放动画" : "暂停动画");
  controls.pause.title = paused ? "播放动画" : "暂停动画";
  setIcon(controls.pause, paused ? "play" : "pause");
}
controls.pause.addEventListener("click", togglePause);
controls.reset.addEventListener("click", () => {
  targetYaw = -.025;
  targetPitch = .025;
  targetZoom = 1;
  lastInteraction = 0;
  pulse = .8;
  playNote(0);
});
controls.fullscreen.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
});
addEventListener("fullscreenchange", () => {
  const full = Boolean(document.fullscreenElement);
  setIcon(controls.fullscreen, full ? "minimize" : "maximize");
  controls.fullscreen.title = full ? "退出全屏" : "全屏";
  controls.fullscreen.setAttribute("aria-label", controls.fullscreen.title);
});

let audio;
let master;
let soundOn = false;
let audioVoices = [];
async function toggleSound() {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audio = new AudioContextClass();
    master = audio.createGain();
    master.gain.value = 0;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -20;
    master.connect(compressor).connect(audio.destination);
    audioVoices = [55, 82.4069, 110, 164.8138].map((frequency, i) => {
      const oscillator = audio.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const gain = audio.createGain();
      gain.gain.value = [.18, .07, .05, .018][i];
      oscillator.connect(gain).connect(master);
      oscillator.start();
      return { oscillator, gain };
    });
  }
  await audio.resume();
  soundOn = !soundOn;
  master.gain.setTargetAtTime(soundOn ? .28 : 0, audio.currentTime, .45);
  setIcon(controls.sound, soundOn ? "volume-2" : "volume-x");
  controls.sound.setAttribute("aria-pressed", String(soundOn));
  controls.sound.title = soundOn ? "关闭声音" : "开启声音";
  controls.sound.setAttribute("aria-label", controls.sound.title);
  if (soundOn) playNote(0);
}
function playNote(index) {
  if (!audio || !soundOn) return;
  const notes = [220, 246.9417, 293.6648, 329.6276, 369.9944, 440, 493.8833, 587.3295, 659.2551];
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = notes[index % notes.length];
  const at = audio.currentTime;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(.038, at + .08);
  gain.gain.exponentialRampToValueAtTime(.0001, at + 2.6);
  oscillator.connect(gain).connect(master);
  oscillator.start(at);
  oscillator.stop(at + 2.7);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
if (!presentationMode) {
  controls.sound.addEventListener("click", toggleSound);

  canvas.addEventListener("pointerdown", event => {
    pointer.set(event.clientX / width * 2 - 1, 1 - event.clientY / height * 2);
    dragging = true;
    dragDistance = 0;
    pointerDown = { x: event.clientX, y: event.clientY, yaw: targetYaw, pitch: targetPitch };
    canvas.setPointerCapture(event.pointerId);
    lastInteraction = performance.now();
  });
  canvas.addEventListener("pointermove", event => {
    pointer.set(event.clientX / width * 2 - 1, 1 - event.clientY / height * 2);
    if (!dragging) return;
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    dragDistance = Math.hypot(dx, dy);
    targetYaw = pointerDown.yaw + dx * .0035;
    targetPitch = THREE.MathUtils.clamp(pointerDown.pitch + dy * .0025, -.55, .55);
    lastInteraction = performance.now();
  });
  canvas.addEventListener("pointerup", event => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (dragDistance < 7) {
      pulse = 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(cells.filter(cell => cell.mesh.visible).map(cell => cell.mesh))[0];
      playNote(hit ? hit.object.userData.index : 0);
    }
    pointerDown = null;
    lastInteraction = performance.now();
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; pointerDown = null; });
  canvas.addEventListener("pointerleave", () => { if (!dragging) pointer.set(-10, -10); });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    targetZoom = THREE.MathUtils.clamp(targetZoom - event.deltaY * .0005, .72, 1.24);
    lastInteraction = performance.now();
  }, { passive: false });
  addEventListener("keydown", event => {
    if (event.target instanceof HTMLButtonElement) return;
    if (event.code === "Space") { event.preventDefault(); togglePause(); }
    if (event.key.toLowerCase() === "m") toggleSound();
    if (event.key.toLowerCase() === "r") controls.reset.click();
    if (event.key === "+" || event.key === "=") setCellCount(targetCount + 1);
    if (event.key === "-") setCellCount(targetCount - 1);
  });
}

let firstFrame = true;
let frame = 0;
let pageVisible = true;
function renderFrame() {
  const now = performance.now();
  const dt = Math.min((now - previousFrame) / 1000, .05);
  previousFrame = now;
  const moving = !paused && pageVisible && !document.hidden;
  if (moving) time += dt;
  if (demoPlaying && moving) {
    demoTime += dt;
    const next = demoCountAt(demoTime);
    if (next !== targetCount) {
      demoButton?.classList.remove("is-demonstrating");
      demoButton = next > targetCount ? controls.add : controls.remove;
      demoButton.classList.add("is-demonstrating");
      demoButtonUntil = demoTime + .6;
      setCellCount(next);
    }
    if (demoButton && demoTime > demoButtonUntil) {
      demoButton.classList.remove("is-demonstrating");
      demoButton = null;
    }
  }
  shared.uTime.value = time;
  pulse *= Math.exp(-dt * 2.8);
  shared.uPulse.value = pulse;
  if (!dragging && performance.now() - lastInteraction > 11000 && !paused) {
    targetYaw = -.025 + Math.sin(time * .24) * .11;
    targetPitch = .025 + Math.sin(time * .19) * .045;
  }
  const follow = 1 - Math.exp(-dt * 7);
  yaw += (targetYaw - yaw) * follow;
  pitch += (targetPitch - pitch) * follow;
  zoom += (targetZoom - zoom) * follow;
  group.rotation.set(pitch, yaw, Math.sin(time * .28) * .018);
  group.scale.setScalar(zoom);
  group.position.y = Math.sin(time * .46) * .045;
  camera.position.z = reducedMotion ? cameraTarget : advanceSpring(cameraDistance, cameraTarget, dt, 32, 11);
  updateCells(time, dt);
  if (!presentationMode && frame++ % 3 === 0) {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(cells.filter(cell => cell.mesh.visible).map(cell => cell.mesh))[0];
    selected = hit ? hit.object.userData.index : -1;
  }
  renderer.render(scene, camera);
  updateLabels();
  if (soundOn && audio) {
    for (let i = 0; i < audioVoices.length; i++) {
      audioVoices[i].oscillator.detune.setTargetAtTime(Math.sin(time * .22 + i) * 3.5, audio.currentTime, .15);
    }
  }
  if (firstFrame) {
    firstFrame = false;
    loading.classList.add("ready");
    setTimeout(() => loading.remove(), 900);
  }
}
function syncPlayback() {
  previousFrame = performance.now();
  renderer.setAnimationLoop(pageVisible && !document.hidden ? renderFrame : null);
}
addEventListener("message", event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== "cells-visibility") return;
  pageVisible = event.data.visible === true;
  syncPlayback();
});
document.addEventListener("visibilitychange", syncPlayback);
syncPlayback();
