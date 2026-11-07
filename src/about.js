(() => {
  const toggle = document.querySelector("[data-language-toggle]");
  const translated = [...document.querySelectorAll("[data-en], [data-label-en], [data-alt-en]")].map(element => ({
    element,
    text: element.hasAttribute("data-en") ? element.textContent : null,
    label: element.getAttribute("aria-label"),
    alt: element.getAttribute("alt"),
    title: element.getAttribute("title")
  }));
  let english = false;
  function setLanguage(value) {
    english = value;
    document.documentElement.lang = english ? "en" : "zh-CN";
    for (const { element, text, label, alt, title } of translated) {
      if (text !== null) element.textContent = english ? element.dataset.en : text;
      if (label !== null) element.setAttribute("aria-label", english ? element.dataset.labelEn : label);
      if (label !== null && element.hasAttribute("data-tooltip")) element.dataset.tooltip = english ? element.dataset.labelEn : label;
      if (alt !== null) element.setAttribute("alt", english ? element.dataset.altEn : alt);
      if (title !== null && element.dataset.labelEn) element.title = english ? element.dataset.labelEn : title;
    }
    const action = english ? "切换为中文" : "Switch to English";
    toggle.setAttribute("aria-label", action);
    toggle.title = action;
    toggle.setAttribute("aria-pressed", String(english));
  }
  toggle?.addEventListener("click", () => setLanguage(!english));

  function initializeDock() {
    const track = document.querySelector("[data-dock-track]");
    const items = [...track.querySelectorAll("a")].map(anchor => ({
      anchor, element: anchor.querySelector(".profile-dock-item"), size: 40, target: 40, velocity: 0
    }));
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastTime = 0;
    function render(time) {
      const steps = Math.ceil(Math.min(64, lastTime ? time - lastTime : 16.667));
      lastTime = time;
      let moving = false;
      for (const item of items) {
        for (let step = 0; step < steps; step++) {
          item.velocity += (170 * (item.target - item.size) - 26 * item.velocity) / 1000;
          item.size += item.velocity / 1000;
        }
        if (Math.abs(item.target - item.size) < .01 && Math.abs(item.velocity) < .01) {
          item.size = item.target;
          item.velocity = 0;
        } else moving = true;
        item.element.style.width = `${item.size}px`;
      }
      frame = moving ? requestAnimationFrame(render) : 0;
      if (!moving) lastTime = 0;
    }
    function setTargets(clientX = null) {
      for (const item of items) {
        const rect = item.anchor.getBoundingClientRect();
        const distance = clientX === null ? Infinity : Math.abs(clientX - rect.left - rect.width / 2);
        item.target = reducedMotion.matches ? 40 : 40 + Math.min(40, Math.max(0, 60 - distance));
        if (reducedMotion.matches || document.hidden) {
          item.size = item.target;
          item.velocity = 0;
          item.element.style.width = `${item.size}px`;
        }
      }
      if (reducedMotion.matches || document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
      } else if (!frame) frame = requestAnimationFrame(render);
    }
    const reset = () => setTargets();
    track.addEventListener("pointermove", event => {
      if (hover.matches && event.pointerType !== "touch") setTargets(event.clientX);
    });
    track.addEventListener("pointerleave", reset);
    track.addEventListener("pointercancel", reset);
    track.addEventListener("focusin", event => {
      const anchor = event.target.closest("a");
      if (!anchor?.matches(":focus-visible")) return;
      const rect = anchor.getBoundingClientRect();
      setTargets(rect.left + rect.width / 2);
    });
    track.addEventListener("focusout", event => {
      if (!track.contains(event.relatedTarget)) reset();
    });
    hover.addEventListener("change", reset);
    reducedMotion.addEventListener("change", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    document.addEventListener("visibilitychange", reset);
  }
  initializeDock();
})();
