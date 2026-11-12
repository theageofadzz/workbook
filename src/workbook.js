(() => {
  const script = document.currentScript;
  const base = new URL(".", script.src).pathname.replace(/\/$/, "");
  const profile = `${base}/github/`;
  const faviconHref = document.querySelector('link[rel~="icon"]')?.getAttribute("href") || `${base}/assets/intensea-favicon.png`;
  let config = { title: "theageofadzz", headerTitle: "奥兹时代", browserTitle: "workbook of theageofadzz", subtitle: "作品集 / 我的设计工程师职业生涯" };
  let fullBranding = document.readyState === "complete";
  const githubIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-1/2 text-neutral-600 workbook-github-icon" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.8A5.3 5.3 0 0 0 18.7 5a5 5 0 0 0-.1-3.6S17.4 1 15 2.8a13.4 13.4 0 0 0-6 0C6.6 1 5.4 1.4 5.4 1.4A5 5 0 0 0 5.3 5a5.3 5.3 0 0 0-1.5 3.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 9 18.1V22"/></svg>';
  const xiaohongshuIcon = `<img src="${base}/assets/xiaohongshu-logo.svg" alt="" aria-hidden="true" class="size-1/2 workbook-xiaohongshu-icon">`;
  const initializedDrawings = new WeakSet();
  const startedDrawings = new WeakSet();
  const conversations = new WeakMap();
  const weatherStudies = new WeakMap();
  const copyResets = new WeakMap();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const splitTextViewport = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      splitTextViewport.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -100px 0px", threshold: .1 });

  function resetSplitText(element) {
    if (!element) return;
    element.removeAttribute("data-split-text-ready");
    element.classList.remove("workbook-split-text", "is-visible");
  }

  function initializeSplitText(element) {
    if (!element || element.dataset.splitTextReady === "true") return;
    const text = element.textContent;
    if (!text.trim()) return;
    element.dataset.splitTextReady = "true";
    element.dataset.splitText = "rise";
    element.classList.add("workbook-split-text");
    element.setAttribute("aria-label", text);
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    let characterIndex = 0;
    for (const node of textNodes) {
      const fragment = document.createDocumentFragment();
      for (const character of [...node.nodeValue]) {
        if (character === " ") {
          const space = document.createElement("span");
          space.className = "workbook-split-text__space";
          space.textContent = character;
          space.setAttribute("aria-hidden", "true");
          fragment.append(space);
          characterIndex++;
          continue;
        }
        const wrapper = document.createElement("span");
        const letter = document.createElement("span");
        wrapper.className = "workbook-split-text__char-wrap";
        letter.className = "workbook-split-text__char";
        letter.textContent = character;
        letter.setAttribute("aria-hidden", "true");
        letter.style.setProperty("--split-delay", `${characterIndex * 70}ms`);
        wrapper.append(letter);
        fragment.append(wrapper);
        characterIndex++;
      }
      node.replaceWith(fragment);
    }
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      element.classList.add("is-visible");
      return;
    }
    splitTextViewport.observe(element);
  }

  // The writing archive owns its reading windows and uses a standalone document.
  document.addEventListener("click", event => {
    const anchor = event.target instanceof Element && event.target.closest("a[href]");
    if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !["crafts", "github", "about"].some(route => url.pathname.replace(/\/$/, "") === `${base}/${route}`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(url.href);
  }, true);
  const drawingViewport = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const figure = entry.target;
      if (!figure.isConnected) {
        drawingViewport.unobserve(figure);
        continue;
      }
      if (entry.isIntersecting && !startedDrawings.has(figure)) {
        figure.getAnimations({ subtree: true }).forEach(animation => { animation.currentTime = 0; });
        startedDrawings.add(figure);
      }
      figure.classList.toggle("is-visible", entry.isIntersecting);
    }
  }, { threshold: .15 });

  function initializeHomeDock() {
    if (!document.body.hasAttribute("data-workbook-home")) return;
    const track = document.querySelector(".footer-animation > div");
    if (!track) return;
    const items = [...track.querySelectorAll('[data-role="footer-item"]')].map(anchor => ({
      anchor, element: anchor.firstElementChild, size: 40, target: 40, velocity: 0
    })).filter(item => item.element);
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
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
      }
      if (!frame) frame = requestAnimationFrame(render);
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

  function initializeMotionStudies() {
    document.querySelectorAll(".intensea-logo-study, .portfolio-icon-browser").forEach(figure => {
      if (initializedDrawings.has(figure)) return;
      initializedDrawings.add(figure);
      figure.classList.add("is-initialized");
      const toggle = figure.querySelector("[data-logo-toggle], [data-icon-toggle]");
      const action = figure.matches(".portfolio-icon-browser") ? "浏览演示" : "绘制动画";
      const syncToggle = paused => {
        figure.classList.toggle("is-paused", paused);
        toggle.setAttribute("aria-pressed", String(paused));
        toggle.setAttribute("aria-label", `${paused ? "继续" : "暂停"}${action}`);
        toggle.title = `${paused ? "继续" : "暂停"}${action}`;
      };
      toggle.addEventListener("click", () => syncToggle(!figure.classList.contains("is-paused")));
      figure.querySelector("[data-logo-replay], [data-icon-replay]").addEventListener("click", () => {
        figure.getAnimations({ subtree: true }).forEach(animation => { animation.currentTime = 0; });
        syncToggle(false);
      });
      drawingViewport.observe(figure);
    });
  }

  const conversationViewport = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.target.isConnected) {
        conversationViewport.unobserve(entry.target);
        conversations.get(entry.target)?.finish();
        continue;
      }
      conversations.get(entry.target)?.setVisible(entry.isIntersecting);
    }
  }, { threshold: .35 });

  function initializeConversations() {
    document.querySelectorAll("[data-weather-conversation]").forEach(figure => {
      if (conversations.has(figure)) return;
      const message = figure.querySelector(".weather-message");
      const typing = figure.querySelector(".weather-typing");
      const avatar = figure.querySelector(".weather-conversation-avatar");
      let animations = [];
      let sequence = 0;
      let replayTimer = 0;
      let inView = false;
      function finish() {
        sequence++;
        clearTimeout(replayTimer);
        replayTimer = 0;
        figure.classList.remove("is-pending");
        animations.forEach(animation => animation.cancel());
        animations = [];
      }
      function play() {
        finish();
        if (!figure.isConnected || !inView || document.hidden || reducedMotion.matches) return;
        figure.classList.add("is-pending");
        const current = sequence;
        animations.push(typing.animate([
          { opacity: 0, transform: "scale(.85)", offset: 0 },
          { opacity: 1, transform: "scale(1)", offset: .12 },
          { opacity: 1, transform: "scale(1)", offset: .78 },
          { opacity: 0, transform: "scale(.85)", offset: 1 }
        ], { duration: 1040, fill: "both" }));
        typing.querySelectorAll("span").forEach((dot, index) => {
          animations.push(dot.animate([
            { opacity: .45, transform: "translateY(0)" },
            { opacity: 1, transform: "translateY(-3px)" },
            { opacity: .45, transform: "translateY(0)" }
          ], { duration: 480, delay: index * 120, iterations: 2, easing: "ease-in-out" }));
        });
        animations.push(avatar.animate([
          { opacity: 0, transform: "scale(.9)" },
          { opacity: 1, transform: "scale(1)" }
        ], { duration: 260, easing: "ease-out", fill: "both" }));
        const arrival = message.animate([
          { opacity: 0, transform: "translateY(8px) scale(.94)" },
          { opacity: 1, transform: "translateY(0) scale(1)" }
        ], { delay: 900, duration: 560, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" });
        animations.push(arrival);
        arrival.finished.then(() => {
          if (sequence !== current) return;
          finish();
          replayTimer = setTimeout(play, 30_000);
        }).catch(() => {});
      }
      conversations.set(figure, {
        play,
        finish,
        setVisible(visible) {
          if (inView === visible) return;
          inView = visible;
          play();
        }
      });
      figure.classList.add("is-initialized");
      if (!reducedMotion.matches) figure.classList.add("is-pending");
      conversationViewport.observe(figure);
    });
  }
  function refreshConversations() {
    document.querySelectorAll("[data-weather-conversation]").forEach(figure => {
      conversations.get(figure)?.play();
    });
  }
  reducedMotion.addEventListener("change", refreshConversations);
  document.addEventListener("visibilitychange", refreshConversations);

  const weatherStudyViewport = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.target.isConnected) {
        entry.target.pause();
        weatherStudyViewport.unobserve(entry.target);
        continue;
      }
      const state = weatherStudies.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting;
      state.sync();
    }
  }, { threshold: .25 });

  const articleVideoSelector = "video[data-weather-study]";

  function initializeWeatherStudies() {
    document.querySelectorAll(articleVideoSelector).forEach(video => {
      if (weatherStudies.has(video)) return;
      const state = {
        visible: false,
        sync() {
          if (!video.isConnected || !state.visible || document.hidden || reducedMotion.matches) {
            video.pause();
            return;
          }
          video.muted = true;
          video.play().catch(() => {});
        }
      };
      weatherStudies.set(video, state);
      weatherStudyViewport.observe(video);
    });
  }
  function refreshWeatherStudies() {
    document.querySelectorAll(articleVideoSelector).forEach(video => weatherStudies.get(video)?.sync());
  }
  reducedMotion.addEventListener("change", refreshWeatherStudies);
  document.addEventListener("visibilitychange", refreshWeatherStudies);

  const cellsPreviews = new Map();
  const cellsPlaybackFrames = new WeakSet();
  const cellsPlaybackViewport = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      target.dataset.cellsInView = String(isIntersecting);
      target.contentWindow?.postMessage({ type: "cells-visibility", visible: isIntersecting && !document.hidden }, location.origin);
    }
  }, { threshold: .05 });
  function syncCellsPreview(frame, state) {
    if (state.inView && !document.hidden && !reducedMotion.matches) {
      if (!frame.hasAttribute("src")) frame.src = frame.dataset.cellsPreviewSrc;
    } else {
      frame.classList.remove("is-ready");
      if (frame.hasAttribute("src")) frame.removeAttribute("src");
    }
  }
  const cellsPreviewViewport = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      const state = cellsPreviews.get(target);
      if (!state) continue;
      state.inView = isIntersecting;
      syncCellsPreview(target, state);
    }
  }, { rootMargin: "120px", threshold: .01 });
  function initializeCellsPreviews() {
    document.querySelectorAll("iframe[data-cells-playback]").forEach(frame => {
      if (cellsPlaybackFrames.has(frame)) return;
      cellsPlaybackFrames.add(frame);
      frame.addEventListener("load", () => {
        frame.contentWindow?.postMessage({ type: "cells-visibility", visible: frame.dataset.cellsInView === "true" && !document.hidden }, location.origin);
      });
      cellsPlaybackViewport.observe(frame);
    });
    for (const [frame] of cellsPreviews) {
      if (frame.isConnected) continue;
      cellsPreviewViewport.unobserve(frame);
      cellsPreviews.delete(frame);
    }
    document.querySelectorAll("iframe[data-cells-preview-src]").forEach(frame => {
      if (cellsPreviews.has(frame)) return;
      cellsPreviews.set(frame, { inView: false });
      frame.addEventListener("load", () => {
        if (frame.hasAttribute("src")) frame.classList.add("is-ready");
      });
      cellsPreviewViewport.observe(frame);
    });
  }
  function refreshCellsPreviews() {
    for (const [frame, state] of cellsPreviews) syncCellsPreview(frame, state);
    document.querySelectorAll("iframe[data-cells-playback]").forEach(frame => {
      frame.contentWindow?.postMessage({ type: "cells-visibility", visible: frame.dataset.cellsInView === "true" && !document.hidden }, location.origin);
    });
  }
  reducedMotion.addEventListener("change", refreshCellsPreviews);
  document.addEventListener("visibilitychange", refreshCellsPreviews);

  function playBlueprintDemos() {
    document.querySelectorAll("video[data-blueprint-demo]").forEach(video => {
      video.muted = true;
      if (video.paused) video.play().catch(() => {});
    });
  }
  document.addEventListener("visibilitychange", playBlueprintDemos);

  function syncBlueprintFullscreen() {
    document.querySelectorAll("[data-blueprint-fullscreen]").forEach(button => {
      const stage = button.closest(".blueprint-experience-stage");
      const expanded = document.fullscreenElement === stage || stage.classList.contains("is-fullscreen");
      const label = expanded ? "退出全屏体验" : "全屏体验";
      button.setAttribute("aria-pressed", String(expanded));
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  }

  function closeBlueprintFullscreenFallback() {
    const stage = document.querySelector(".blueprint-experience-stage.is-fullscreen");
    if (!stage) return;
    if (stage.matches(":popover-open")) stage.hidePopover();
    stage.removeAttribute("popover");
    stage.classList.remove("is-fullscreen");
    document.documentElement.classList.remove("has-blueprint-fullscreen");
    syncBlueprintFullscreen();
    stage.querySelector("[data-blueprint-fullscreen]").focus({ preventScroll: true });
  }

  document.addEventListener("fullscreenchange", syncBlueprintFullscreen);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeBlueprintFullscreenFallback();
  });
  document.addEventListener("click", async event => {
    const button = event.target instanceof Element && event.target.closest("[data-blueprint-fullscreen]");
    if (!button) return;
    const stage = button.closest(".blueprint-experience-stage");
    if (stage.classList.contains("is-fullscreen")) {
      closeBlueprintFullscreenFallback();
      return;
    }
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
      syncBlueprintFullscreen();
      return;
    }
    if (stage.requestFullscreen) {
      try {
        await stage.requestFullscreen();
        syncBlueprintFullscreen();
        return;
      } catch {}
    }
    if (!stage.showPopover) {
      window.open(stage.querySelector("iframe").src, "_blank", "noopener");
      return;
    }
    // The top layer keeps article animation transforms from containing the expanded scene.
    stage.classList.add("is-fullscreen");
    stage.setAttribute("popover", "manual");
    stage.showPopover();
    document.documentElement.classList.add("has-blueprint-fullscreen");
    syncBlueprintFullscreen();
  });

  function initializeScrollExpands() {
    const article = document.querySelector(".portfolio-essay");
    window.WorkbookScrollExpand?.initialize(article, { scroller: window });
  }

  document.addEventListener("click", async event => {
    const button = event.target instanceof Element && event.target.closest("[data-code-copy]");
    if (!button) return;
    const block = button.closest(".gamestation-code, .blueprint-skill-code");
    const code = block?.querySelector("pre code");
    if (!code) return;
    const defaultLabel = button.dataset.copyLabel || "复制代码";
    clearTimeout(copyResets.get(button));
    let copied = false;
    try {
      await navigator.clipboard.writeText(code.textContent);
      copied = true;
    } catch {
      const selection = window.getSelection();
      const previous = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
      try { copied = document.execCommand("copy"); } catch {}
      selection?.removeAllRanges();
      if (previous) selection?.addRange(previous);
    }
    const label = copied ? "已复制" : "复制失败，请选择内容复制";
    button.dataset.copied = String(copied);
    button.setAttribute("aria-label", label);
    button.title = label;
    block.querySelector("[role=status]").textContent = label;
    copyResets.set(button, setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute("aria-label", defaultLabel);
      button.title = defaultLabel;
      block.querySelector("[role=status]")?.replaceChildren();
    }, 2400));
  });

  function applyBrand() {
    const icon = document.querySelector('link[rel~="icon"]');
    if (icon && icon.getAttribute("href") !== faviconHref) icon.setAttribute("href", faviconHref);
    const headerTitle = config.headerTitle || config.title;
    const heading = [...document.querySelectorAll("h1")].find(node =>
      ["设计垂点", "Workbook", config.title, headerTitle].includes(node.textContent.trim())
    );
    if (heading) {
      if (heading.textContent !== headerTitle) {
        heading.textContent = headerTitle;
        resetSplitText(heading);
      }
      const subtitle = heading.nextElementSibling;
      if (subtitle && subtitle.textContent.trim() !== config.subtitle) {
        subtitle.textContent = config.subtitle;
        resetSplitText(subtitle);
      }
      initializeSplitText(heading);
      initializeSplitText(subtitle);
      const brandGroup = heading.parentElement;
      const mark = brandGroup?.previousElementSibling;
      if (mark?.tagName.toLowerCase() === "svg") {
        const logo = document.createElement("img");
        logo.src = `${base}/assets/intensea-logo.png`;
        logo.alt = "";
        logo.setAttribute("aria-hidden", "true");
        logo.className = `${mark.getAttribute("class") || ""} workbook-header-logo`;
        mark.replaceWith(logo);
      }
    }
    if (!fullBranding) return;
    initializeMotionStudies();
    initializeConversations();
    initializeWeatherStudies();
    initializeCellsPreviews();
    playBlueprintDemos();
    initializeScrollExpands();
    document.title = config.browserTitle || "workbook of theageofadzz";
    document.querySelectorAll("h2 a").forEach(anchor => {
      if (anchor.textContent === "设计垂点") anchor.textContent = config.title;
    });
    document.querySelectorAll('a[aria-label="访问 Aragakey 个人主页"]').forEach(anchor => {
      anchor.dataset.workbookSignature = "";
      anchor.dataset.brand = `${config.title}.`;
      anchor.href = `${base}/about/`;
      anchor.removeAttribute("target");
      anchor.setAttribute("aria-label", `关于 ${config.title}`);
    });
    const footer = [...document.querySelectorAll('[data-role="footer-item"]')];
    const labels = ["首页", "作品", "GitHub 个人主页", "小红书", `关于 ${config.title}`];
    const route = location.pathname.replace(/\/$/, "");
    const activeFooterIndex = route === base ? 0 : route === `${base}/github` ? 2 : route === `${base}/about` ? 4 : 1;
    footer.forEach((anchor, index) => {
      if (!labels[index]) return;
      if (index === activeFooterIndex) {
        if (anchor.getAttribute("aria-current") !== "page") anchor.setAttribute("aria-current", "page");
      } else if (anchor.hasAttribute("aria-current")) anchor.removeAttribute("aria-current");
      anchor.dataset.tooltip = labels[index];
      if (anchor.getAttribute("aria-label") !== labels[index]) anchor.setAttribute("aria-label", labels[index]);
      if (index === 0) {
        const mark = anchor.querySelector("svg.lucide-pyramid");
        if (mark) {
          const logo = document.createElement("img");
          logo.src = faviconHref.replace("intensea-favicon.png", "intensea-logo.png");
          logo.alt = "";
          logo.setAttribute("aria-hidden", "true");
          logo.className = "size-1/2 workbook-home-logo";
          mark.replaceWith(logo);
        }
      }
      if (index === 1) {
        const worksHref = `${base}/crafts/`;
        if (anchor.getAttribute("href") !== worksHref) anchor.setAttribute("href", worksHref);
      }
      if (index === 2) {
        if (anchor.getAttribute("href") !== profile) anchor.href = profile;
        anchor.removeAttribute("target");
        anchor.removeAttribute("rel");
        const icon = anchor.querySelector("svg");
        if (icon && !icon.classList.contains("workbook-github-icon")) icon.outerHTML = githubIcon;
      }
      if (index === 3) {
        const xiaohongshu = config.xiaohongshu || "https://xhslink.cn/o/4PFTntg2jrJ";
        if (anchor.getAttribute("href") !== xiaohongshu) anchor.href = xiaohongshu;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        const icon = anchor.querySelector("svg, img");
        if (icon && !icon.classList.contains("workbook-xiaohongshu-icon")) icon.outerHTML = xiaohongshuIcon;
      }
      if (index === 4) {
        if (!anchor.href.endsWith(`${base}/about/`)) anchor.href = `${base}/about/`;
        anchor.removeAttribute("target");
        anchor.removeAttribute("rel");
      }
    });
    document.querySelectorAll('a[href="https://jiangyijie27.github.io/aragakey"]').forEach(anchor => {
      if (anchor.querySelector("svg")) return;
      anchor.href = profile;
      anchor.setAttribute("aria-label", `${config.title} GitHub`);
    });
    document.querySelectorAll('a[target="_blank"]').forEach(anchor => {
      if (!anchor.rel.includes("noopener")) anchor.rel = `${anchor.rel} noopener`.trim();
    });
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; applyBrand(); });
  });
  function start() {
    initializeHomeDock();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    applyBrand();
    fetch(`${base}/config.json`).then(response => response.json()).then(value => {
      config = value;
      applyBrand();
    }).catch(() => {});
    if (!fullBranding) window.addEventListener("load", () => {
      setTimeout(() => { fullBranding = true; applyBrand(); }, 100);
    }, { once: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
