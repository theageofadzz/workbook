const artwork = document.querySelector("#stick");
const failure = document.querySelector("#failure");
const variant = location.pathname.endsWith("/model-3.html") ? "car" : "drone";

function showFailure(error) {
  failure.hidden = false;
  artwork.setAttribute("aria-busy", "false");
  console.error("Blueprint could not start", error);
}

document.querySelector("#retry").addEventListener("click", () => location.reload());
window.addEventListener("unhandledrejection", event => showFailure(event.reason));
window.addEventListener("error", event => showFailure(event.error || event.message));
artwork.addEventListener("pointercancel", () => {
  if (!window.__bp) return;
  window.__bp.press = null;
  window.__bp.dragging = false;
  artwork.classList.remove("dragging");
});
artwork.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const bounds = artwork.getBoundingClientRect();
  const pointer = {
    bubbles: true,
    clientX: bounds.left + bounds.width / 2,
    clientY: bounds.top + bounds.height / 2,
    pointerId: 1
  };
  artwork.dispatchEvent(new PointerEvent("pointerdown", pointer));
  window.dispatchEvent(new PointerEvent("pointerup", pointer));
});
new MutationObserver(() => {
  artwork.setAttribute("aria-pressed", String(artwork.classList.contains("flying")));
}).observe(artwork, { attributeFilter: ["class"] });
document.addEventListener("webglcontextlost", event => {
  event.preventDefault();
  showFailure(new Error("WebGL context lost"));
}, true);

try {
  await import(`./${variant}.js`);
} catch (error) {
  showFailure(error);
}
