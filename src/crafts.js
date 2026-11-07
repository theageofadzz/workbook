(() => {
  "use strict";
  const { articles } = JSON.parse(document.querySelector("#crafts-content").textContent);
  const displayArticles = [...articles];
  for (let index = displayArticles.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [displayArticles[index], displayArticles[other]] = [displayArticles[other], displayArticles[index]];
  }
  if (displayArticles.length > 2) {
    const dates = displayArticles.map(article => article.publishedAt);
    if (dates.every((date, index) => !index || date <= dates[index - 1])
      || dates.every((date, index) => !index || date >= dates[index - 1])) {
      [displayArticles[0], displayArticles[1]] = [displayArticles[1], displayArticles[0]];
    }
  }
  const bySlug = new Map(articles.map(article => [article.slug, article]));
  const dialog = document.querySelector("[data-reader]");
  const scroll = document.querySelector("[data-reader-scroll]");
  const body = document.querySelector("[data-reader-body]");
  const cover = document.querySelector("[data-reader-cover]");
  const assetBase = new URL(".", document.currentScript.src);
  let activeArticle = null;
  let returnFocus = null;
  let progressFrame = 0;
  let readerCloseTimer = 0;
  const positions = new Map();
  const storage = {
    get(key) { try { return sessionStorage.getItem(`workbook-writing:${key}`); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(`workbook-writing:${key}`, String(value)); } catch {} }
  };

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const previews = new Map();
  function initializeSplitText() {
    const heading = document.querySelector("[data-split-text]");
    if (!heading) return;
    const text = heading.textContent;
    heading.classList.add("split-text");
    heading.setAttribute("aria-label", text);
    heading.textContent = "";
    for (const [index, character] of [...text].entries()) {
      if (character === " ") {
        const space = document.createElement("span");
        space.className = "split-text__space";
        space.setAttribute("aria-hidden", "true");
        heading.append(space);
        continue;
      }
      const wrapper = document.createElement("span");
      const letter = document.createElement("span");
      wrapper.className = "split-text__char-wrap";
      letter.className = "split-text__char";
      letter.textContent = character;
      letter.setAttribute("aria-hidden", "true");
      letter.style.setProperty("--split-delay", `${index * 70}ms`);
      wrapper.append(letter);
      heading.append(wrapper);
    }
    const show = () => heading.classList.add("is-visible");
    if (reducedMotion.matches) {
      show();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      show();
      observer.disconnect();
    }, { rootMargin: "-100px", threshold: .1 });
    observer.observe(heading);
  }

  function refreshMotion() {
    const playing = !document.hidden && !dialog.open && !reducedMotion.matches;
    for (const state of previews.values()) {
      for (const animation of state.animations || []) {
        if (reducedMotion.matches) animation.currentTime = 0;
        if (playing && state.visible) animation.play();
        else animation.pause();
      }
    }
  }

  function sizePreview(frame) {
    const state = previews.get(frame);
    const sheet = frame.querySelector(".article-preview-sheet");
    const cursor = frame.querySelector(".preview-cursor");
    const scale = frame.clientWidth / 480;
    if (!scale) return;
    frame.style.setProperty("--preview-scale", scale);
    frame.style.setProperty("--preview-sheet-height", `${Math.ceil(frame.clientHeight / scale)}px`);
    const distance = Math.max(0, sheet.scrollHeight - frame.clientHeight / scale);
    const signature = `${frame.clientWidth}:${distance}:${cursor.offsetWidth}:${cursor.offsetHeight}`;
    if (state.signature === signature) return;
    state.signature = signature;
    const fraction = state.animations?.[0]?.currentTime / state.duration || state.phase;
    state.animations?.forEach(animation => animation.cancel());
    state.duration = Math.min(32000, 22000 + distance * 8);
    // The content, scrollbar and pointer share one forward-and-back reading cycle.
    const stops = [[0, 0], [.1, 0], [.28, .45], [.36, .45], [.56, 1], [.64, 1], [.8, .35], [.87, .35], [1, 0]];
    const easing = "cubic-bezier(.25,.65,.35,1)";
    const frames = amount => stops.map(([offset, progress]) => ({
      transform: `translateY(${amount * progress}px)`, offset, easing
    }));
    const timing = { duration: state.duration, iterations: Infinity, easing: "linear" };
    const pointerStops = [
      [0, .7, .32], [.1, .72, .36], [.28, .65, .63], [.36, .62, .61],
      [.56, .73, .74], [.64, .7, .7], [.8, .59, .4], [.87, .62, .38], [1, .7, .32]
    ];
    const cursorInset = 10;
    const cursorTravelX = Math.max(0, frame.clientWidth - cursor.offsetWidth - cursorInset * 2);
    const cursorTravelY = Math.max(0, frame.clientHeight - cursor.offsetHeight - cursorInset * 2);
    state.animations = [
      sheet.animate(frames(-distance), timing),
      frame.querySelector(".preview-scrollbar > span").animate(frames((frame.clientHeight - 24) * .83), timing),
      cursor.animate(pointerStops.map(([offset, x, y]) => ({
        transform: `translate(${cursorInset + cursorTravelX * x}px, ${cursorInset + cursorTravelY * y}px)`, offset, easing
      })), timing)
    ];
    for (const animation of state.animations) animation.currentTime = fraction * state.duration;
    refreshMotion();
  }
  function initializeWall() {
    const wall = document.querySelector("[data-gallery]");
    const cards = new Map([...wall.children].map(card => [card.dataset.slug, card]));
    for (const article of displayArticles) wall.append(cards.get(article.slug));
    const layout = new ResizeObserver(entries => {
      for (const { target: card } of entries) {
        card.parentElement.style.gridRowEnd = `span ${Math.ceil(card.getBoundingClientRect().height) + 12}`;
      }
    });
    for (const card of wall.querySelectorAll(".crafts-card")) {
      card.parentElement.style.gridRowEnd = `span ${Math.ceil(card.getBoundingClientRect().height) + 12}`;
      layout.observe(card);
    }
    wall.classList.add("is-masonry");
    const previewViewport = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) previews.get(target).visible = isIntersecting;
      refreshMotion();
    });
    const previewSize = new ResizeObserver(entries => {
      for (const { target } of entries) sizePreview(target.closest(".article-preview"));
    });
    for (const [index, frame] of [...wall.querySelectorAll(".article-preview")].entries()) {
      previews.set(frame, { visible: false, phase: index % 3 * .025 });
      sizePreview(frame);
      previewSize.observe(frame);
      previewSize.observe(frame.querySelector(".article-preview-sheet"));
      previewSize.observe(frame.querySelector(".preview-cursor"));
      previewViewport.observe(frame);
    }
    reducedMotion.addEventListener("change", refreshMotion);
  }

  function initializeDock() {
    const track = document.querySelector("[data-dock-track]");
    const items = [...track.querySelectorAll("a")].map(anchor => ({
      anchor, element: anchor.querySelector(".writing-dock-item"), size: 40, target: 40, velocity: 0
    }));
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let lastTime = 0;
    function render(time) {
      const steps = Math.ceil(Math.min(64, lastTime ? time - lastTime : 16.667));
      lastTime = time;
      let moving = false;
      for (const item of items) {
        // Match the homepage's React Spring defaults with one millisecond steps.
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
    return reset;
  }

  function updateProgress() {
    progressFrame = 0;
    if (!activeArticle || !dialog.open) return;
    positions.set(activeArticle.slug, scroll.scrollTop);
    storage.set(`position:${activeArticle.slug}`, scroll.scrollTop);
  }
  scroll.addEventListener("scroll", () => {
    if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
  }, { passive: true });
  new ResizeObserver(() => {
    if (dialog.open && !progressFrame) progressFrame = requestAnimationFrame(updateProgress);
  }).observe(scroll);

  function openArticle(article, pushHistory = true) {
    clearTimeout(readerCloseTimer);
    readerCloseTimer = 0;
    dialog.classList.remove("is-closing");
    if (activeArticle) updateProgress();
    if (!dialog.open) returnFocus = document.activeElement;
    activeArticle = article;
    document.querySelector("#reader-title").textContent = article.title;
    document.querySelector("[data-reader-date]").textContent = article.publishedAt.replaceAll("-", ".");
    document.querySelector("[data-reader-date]").dateTime = article.publishedAt;
    document.querySelector("[data-reader-subtitle]").textContent = article.subtitle || article.description;
    cover.hidden = !article.cover;
    if (article.cover) cover.src = new URL(article.cover, assetBase).href;
    else cover.removeAttribute("src");
    body.innerHTML = article.html;
    document.title = `${article.title} · theageofadzz`;
    if (pushHistory) {
      const url = new URL(location.href);
      url.searchParams.delete("view");
      url.searchParams.set("read", article.slug);
      if (dialog.open) history.replaceState(history.state, "", url);
      else history.pushState({ ...history.state, writingReader: true }, "", url);
    }
    document.documentElement.classList.add("reading-open");
    resetDock();
    if (!dialog.open) dialog.showModal();
    refreshMotion();
    // Layout must settle before restoring a saved position inside the reading window.
    const targetPosition = positions.get(article.slug) ?? Number(storage.get(`position:${article.slug}`)) ?? 0;
    requestAnimationFrame(() => {
      scroll.scrollTop = targetPosition;
      updateProgress();
    });
  }

  function dismissWindow() {
    if (!dialog.open || readerCloseTimer) return;
    updateProgress();
    const finish = () => {
      readerCloseTimer = 0;
      body.querySelectorAll("iframe").forEach(frame => frame.remove());
      dialog.close();
      dialog.classList.remove("is-closing");
      document.documentElement.classList.remove("reading-open");
      activeArticle = null;
      refreshMotion();
      document.title = "workbook of theageofadzz";
      returnFocus?.focus({ preventScroll: true });
    };
    if (reducedMotion.matches) finish();
    else {
      dialog.classList.add("is-closing");
      readerCloseTimer = setTimeout(finish, 160);
    }
  }
  function closeReader() {
    if (readerCloseTimer || !dialog.open) return;
    dismissWindow();
    if (history.state?.writingReader) history.back();
    else {
      const url = new URL(location.href);
      url.searchParams.delete("read");
      history.replaceState(history.state, "", url);
    }
  }
  document.querySelector("[data-close-reader]").addEventListener("click", closeReader);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeReader();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if ((event.shiftKey && document.activeElement === first)
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeReader();
  });
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-open-article]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const article = bySlug.get(link.dataset.openArticle);
    if (!article) return;
    event.preventDefault();
    openArticle(article);
  });
  function syncLocation() {
    const url = new URL(location.href);
    const article = bySlug.get(url.searchParams.get("read"));
    if (article) openArticle(article, false);
    else dismissWindow();
  }
  window.addEventListener("popstate", syncLocation);
  document.addEventListener("visibilitychange", refreshMotion);
  const resetDock = initializeDock();
  initializeSplitText();
  initializeWall();
  syncLocation();
})();
