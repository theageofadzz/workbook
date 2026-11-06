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
  const toc = document.querySelector("#reader-toc");
  const tocButton = document.querySelector("[data-toggle-toc]");
  const status = document.querySelector("[data-reader-status]");
  const previous = document.querySelector("[data-reader-previous]");
  const next = document.querySelector("[data-reader-next]");
  let activeArticle = null;
  let returnFocus = null;
  let progressFrame = 0;
  let shareReset;
  let fontSize = 17;
  const positions = new Map();
  const storage = {
    get(key) { try { return sessionStorage.getItem(`workbook-writing:${key}`); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(`workbook-writing:${key}`, String(value)); } catch {} }
  };
  const storedSize = Number(storage.get("font-size"));
  if (storedSize >= 15 && storedSize <= 22) fontSize = storedSize;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const previews = new Map();
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

  function updateFont() {
    dialog.style.setProperty("--reading-size", `${fontSize}px`);
    document.querySelector("[data-font-value]").value = String(fontSize);
    document.querySelector('[data-font-step="-1"]').disabled = fontSize <= 15;
    document.querySelector('[data-font-step="1"]').disabled = fontSize >= 22;
  }
  document.querySelectorAll("[data-font-step]").forEach(button => {
    button.addEventListener("click", () => {
      fontSize = Math.min(22, Math.max(15, fontSize + Number(button.dataset.fontStep)));
      updateFont();
      storage.set("font-size", fontSize);
      updateProgress();
    });
  });
  updateFont();

  function updateProgress() {
    progressFrame = 0;
    if (!activeArticle || !dialog.open) return;
    const max = scroll.scrollHeight - scroll.clientHeight;
    const percent = Math.round(max > 0 ? Math.min(1, scroll.scrollTop / max) * 100 : 100);
    document.querySelector("[data-reader-progress]").value = percent;
    document.querySelector("[data-reader-percent]").textContent = `${percent}%`;
    positions.set(activeArticle.slug, scroll.scrollTop);
    storage.set(`position:${activeArticle.slug}`, scroll.scrollTop);
  }
  scroll.addEventListener("scroll", () => {
    if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
  }, { passive: true });
  new ResizeObserver(() => {
    if (dialog.open && !progressFrame) progressFrame = requestAnimationFrame(updateProgress);
  }).observe(scroll);

  function showToc(show) {
    toc.hidden = !show;
    tocButton.setAttribute("aria-expanded", String(show));
  }
  tocButton.addEventListener("click", () => showToc(toc.hidden));
  toc.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    const target = document.getElementById(link.hash.slice(1));
    showToc(false);
    target?.scrollIntoView({ block: "start" });
    scroll.focus({ preventScroll: true });
  });

  function openArticle(article, pushHistory = true) {
    if (activeArticle) updateProgress();
    if (!dialog.open) returnFocus = document.activeElement;
    activeArticle = article;
    clearTimeout(shareReset);
    document.querySelector("#reader-title").textContent = article.title;
    document.querySelector("[data-reader-category]").textContent = article.category;
    document.querySelector("[data-reader-date]").textContent = article.publishedAt.replaceAll("-", ".");
    document.querySelector("[data-reader-date]").dateTime = article.publishedAt;
    document.querySelector("[data-reader-minutes]").textContent = `${article.minutes} 分钟阅读`;
    document.querySelector("[data-reader-subtitle]").textContent = article.subtitle || article.description;
    body.innerHTML = article.html;
    toc.replaceChildren();
    const label = document.createElement("p");
    label.textContent = "文章目录";
    toc.append(label);
    for (const heading of article.headings) {
      const link = document.createElement("a");
      link.href = `#${heading.id}`;
      link.textContent = heading.text;
      link.dataset.level = heading.level;
      toc.append(link);
    }
    tocButton.hidden = article.headings.length < 2;
    showToc(false);
    status.textContent = "cicada / centurypaw";
    const index = displayArticles.indexOf(article);
    for (const [button, item] of [[previous, displayArticles[index - 1]], [next, displayArticles[index + 1]]]) {
      button.disabled = !item;
      button.querySelector("strong").textContent = item?.title || (button === previous ? "已是第一篇" : "已是最后一篇");
      button.dataset.slug = item?.slug || "";
    }
    document.title = `${article.title} · theageofadzz`;
    if (pushHistory) {
      const url = new URL(location.href);
      url.searchParams.delete("view");
      url.searchParams.set("read", article.slug);
      if (dialog.open) history.replaceState(history.state, "", url);
      else history.pushState({ ...history.state, writingReader: true }, "", url);
    }
    document.documentElement.classList.add("reading-open");
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
    if (!dialog.open) return;
    updateProgress();
    body.querySelectorAll("iframe").forEach(frame => frame.remove());
    dialog.close();
    document.documentElement.classList.remove("reading-open");
    activeArticle = null;
    refreshMotion();
    showToc(false);
    document.title = "workbook of theageofadzz";
    returnFocus?.focus({ preventScroll: true });
  }
  function closeReader() {
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
  for (const button of [previous, next]) {
    button.addEventListener("click", () => {
      const article = bySlug.get(button.dataset.slug);
      if (article) openArticle(article);
    });
  }
  document.querySelector("[data-share-article]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      status.textContent = "文章链接已复制";
    } catch {
      status.textContent = "请从地址栏复制文章链接";
    }
    clearTimeout(shareReset);
    shareReset = setTimeout(() => { status.textContent = "cicada / centurypaw"; }, 2400);
  });
  function syncLocation() {
    const url = new URL(location.href);
    const article = bySlug.get(url.searchParams.get("read"));
    if (article) openArticle(article, false);
    else dismissWindow();
  }
  window.addEventListener("popstate", syncLocation);
  document.addEventListener("visibilitychange", refreshMotion);
  initializeWall();
  syncLocation();
})();
