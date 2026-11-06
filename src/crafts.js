(() => {
  "use strict";
  const { articles, gallery } = JSON.parse(document.querySelector("#crafts-content").textContent);
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
  const visibleVideos = new Set();
  function refreshMotion() {
    const playing = !document.hidden && !dialog.open && !reducedMotion.matches;
    for (const state of previews.values()) {
      for (const animation of state.animations || []) {
        if (reducedMotion.matches) animation.currentTime = state.duration * .08;
        if (playing && state.visible) animation.play();
        else animation.pause();
      }
    }
    document.querySelectorAll("[data-gallery] video").forEach(video => {
      if (playing && visibleVideos.has(video)) {
        if (!video.src) video.src = video.dataset.src;
        video.play().catch(() => {});
      } else video.pause();
    });
  }
  const galleryViewport = new IntersectionObserver(entries => {
    for (const { target: video, isIntersecting } of entries) {
      if (isIntersecting) visibleVideos.add(video);
      else visibleVideos.delete(video);
    }
    refreshMotion();
  }, { rootMargin: "80px" });

  function initializeGallery() {
    const container = document.querySelector("[data-gallery]");
    const fragment = document.createDocumentFragment();
    for (const item of gallery) {
      const figure = document.createElement("div");
      figure.className = "crafts-item";
      const card = document.createElement("figure");
      card.className = "crafts-card";
      const media = document.createElement("div");
      media.className = "crafts-item-media";
      media.style.setProperty("--craft-ratio", String(item.aspectRatio || 1));
      const image = document.createElement("img");
      image.src = item.posterUrl || item.imageUrl;
      image.alt = item.title;
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);
      if (item.videoUrl) {
        const video = document.createElement("video");
        video.dataset.src = item.videoUrl;
        video.poster = image.src;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "none";
        video.setAttribute("aria-label", item.title);
        media.append(video);
        galleryViewport.observe(video);
      }
      const caption = document.createElement("figcaption");
      caption.append(document.createTextNode(item.title));
      const time = document.createElement("time");
      time.dateTime = item.date;
      time.textContent = item.date;
      caption.append(time);
      card.append(media, caption);
      figure.append(card);
      fragment.append(figure);
    }
    container.append(fragment);
  }

  function sizePreview(frame) {
    const state = previews.get(frame);
    const sheet = frame.querySelector(".article-preview-sheet");
    const scale = frame.clientWidth / 480;
    if (!scale) return;
    frame.style.setProperty("--preview-scale", scale);
    frame.style.setProperty("--preview-sheet-height", `${Math.ceil(frame.clientHeight / scale + 160)}px`);
    const distance = Math.max(0, sheet.scrollHeight - frame.clientHeight / scale);
    const signature = `${frame.clientWidth}:${distance}`;
    if (state.signature === signature) return;
    state.signature = signature;
    const fraction = state.animations?.[0]?.currentTime / state.duration || .06;
    state.animations?.forEach(animation => animation.cancel());
    state.duration = Math.min(36000, 13000 + distance * 16);
    const frames = amount => [
      { transform: "translateY(0)", opacity: 0, offset: 0 },
      { transform: "translateY(0)", opacity: 1, offset: .04 },
      { transform: "translateY(0)", opacity: 1, offset: .14 },
      { transform: `translateY(${amount}px)`, opacity: 1, offset: .84 },
      { transform: `translateY(${amount}px)`, opacity: 1, offset: .95 },
      { transform: `translateY(${amount}px)`, opacity: 0, offset: 1 }
    ];
    const timing = { duration: state.duration, iterations: Infinity, easing: "linear" };
    state.animations = [
      sheet.animate(frames(-distance), timing),
      frame.querySelector(".preview-scrollbar > span").animate(frames((frame.clientHeight - 24) * .83), timing)
    ];
    for (const animation of state.animations) animation.currentTime = fraction * state.duration;
    refreshMotion();
  }
  function initializeWall() {
    initializeGallery();
    const wall = document.querySelector("[data-gallery]");
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
    for (const frame of wall.querySelectorAll(".article-preview")) {
      previews.set(frame, { visible: false });
      sizePreview(frame);
      previewSize.observe(frame);
      previewSize.observe(frame.querySelector(".article-preview-sheet"));
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
    status.textContent = "centurypaw / 文字存档";
    const index = articles.indexOf(article);
    for (const [button, item] of [[previous, articles[index - 1]], [next, articles[index + 1]]]) {
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
    shareReset = setTimeout(() => { status.textContent = "centurypaw / 文字存档"; }, 2400);
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
