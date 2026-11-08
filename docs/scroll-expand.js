(() => {
  "use strict";

  const controllers = new WeakMap();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sourceOf = image => [
    image.currentSrc,
    image.getAttribute("src"),
    image.getAttribute("srcset")
  ].filter(Boolean).join(" ");

  function isAnimatedImage(image) {
    return /\.(?:gif|apng)(?:[?#]|$)/i.test(sourceOf(image))
      || image.classList.contains("icon-browser-motion")
      || image.closest(".portfolio-icon-browser, .gamestation-screen, .portfolio-cover, .weather-tutorial-cover");
  }

  function shouldEnhance(image) {
    if (!(image instanceof HTMLImageElement)
      || image.closest("[data-scroll-expand], video, .profile-page, .writing-dock, .work-preview, .article-preview")
      || image.hasAttribute("data-scroll-expand-ignore")
      || image.getAttribute("aria-hidden") === "true"
      || isAnimatedImage(image)) return false;
    return true;
  }

  function wrap(image) {
    const target = image.parentElement?.tagName === "PICTURE" ? image.parentElement : image;
    const shell = document.createElement("span");
    const frame = document.createElement("span");
    shell.className = "scroll-expand";
    frame.className = "scroll-expand__frame";
    shell.dataset.scrollExpand = "";
    if (image.classList.contains("preview-cover")) shell.classList.add("scroll-expand--cover");
    target.replaceWith(shell);
    shell.append(frame);
    frame.append(target);
    return { shell, frame };
  }

  function createController(scroller) {
    let scheduled = false;
    const states = new Set();
    const controller = {
      add(state) {
        states.add(state);
        state.image.addEventListener("load", controller.request, { once: true });
      },
      request() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          controller.update();
        });
      },
      update() {
        const viewport = scroller === window
          ? { top: 0, bottom: innerHeight, height: innerHeight }
          : (() => {
            const rect = scroller.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: scroller.clientHeight };
          })();
        for (const state of states) {
          if (!state.shell.isConnected) {
            states.delete(state);
            continue;
          }
          if (reducedMotion.matches || !viewport.height) {
            state.shell.style.setProperty("--scroll-expand-progress", "1");
            state.shell.style.setProperty("--scroll-expand-inset", "0%");
            state.shell.style.setProperty("--scroll-expand-scale", "1");
            state.shell.style.setProperty("--scroll-expand-radius", "4px");
            continue;
          }
          const rect = state.shell.getBoundingClientRect();
          const travel = viewport.height * .65 + rect.height * .35;
          const progress = clamp((viewport.bottom - rect.top) / Math.max(1, travel), 0, 1);
          const inset = (1 - progress) * 10;
          state.shell.style.setProperty("--scroll-expand-progress", progress.toFixed(3));
          state.shell.style.setProperty("--scroll-expand-inset", `${inset.toFixed(2)}%`);
          state.shell.style.setProperty("--scroll-expand-scale", (0.9 + progress * .1).toFixed(3));
          state.shell.style.setProperty("--scroll-expand-radius", `${(4 + (1 - progress) * 8).toFixed(2)}px`);
        }
      }
    };
    const eventTarget = scroller === window ? window : scroller;
    eventTarget.addEventListener("scroll", controller.request, { passive: true });
    window.addEventListener("resize", controller.request, { passive: true });
    reducedMotion.addEventListener("change", controller.request);
    controllers.set(scroller, controller);
    return controller;
  }

  function initialize(root, { scroller = window } = {}) {
    if (!root) return;
    const controller = controllers.get(scroller) || createController(scroller);
    for (const image of root.querySelectorAll("img")) {
      if (!shouldEnhance(image)) continue;
      const state = wrap(image);
      state.image = image;
      controller.add(state);
    }
    controller.request();
  }

  window.WorkbookScrollExpand = { initialize };
})();
