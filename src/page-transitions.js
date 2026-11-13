(() => {
  "use strict";
  const root = document.documentElement;
  const base = new URL(".", document.currentScript.src).pathname;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const crossDocument = "CSSViewTransitionRule" in window && "onpagereveal" in window;
  const surface = ".profile-page, .writing-main, .github-main, .workbook-about > main, #__next > div > .mx-auto, #__next > div > div > .max-w-\\[800px\\]";
  const ease = "cubic-bezier(.16, 1, .3, 1)";
  const prefetched = new Set();
  let exitAnimation;
  let exitTimer;
  let recoveryTimer;
  let destination;
  let pageTransition;
  let interruptedPointer = false;
  let localTransition;
  let localAnimation;
  let revision = 0;
  let localSurface;

  root.dataset.pageEnter = "";
  function setDirection(activation = window.navigation?.activation) {
    root.dataset.pageDirection = activation?.navigationType === "traverse"
      && activation.entry?.index < activation.from?.index ? "back" : "forward";
  }
  setDirection();
  const navigation = performance.getEntriesByType("navigation")[0];
  const restoredScroll = navigation?.type === "back_forward" ? history.state?.workbookPageScroll : null;
  if (navigation?.type === "back_forward"
    || (document.referrer && new URL(document.referrer).origin === location.origin
      && new URL(document.referrer).pathname.startsWith(base))) {
    root.dataset.pageVisit = "internal";
  }

  function resetExit() {
    clearTimeout(exitTimer);
    clearTimeout(recoveryTimer);
    exitAnimation?.cancel();
    exitAnimation = null;
    destination = null;
  }

  document.addEventListener("animationend", event => {
    if (event.animationName === "page-settle-in" && event.target.matches(surface)) {
      root.removeAttribute("data-page-enter");
    }
  });
  window.addEventListener("pageswap", event => setDirection(event.activation));
  window.addEventListener("pagereveal", event => {
    setDirection();
    const position = history.state?.workbookPageScroll;
    if (window.navigation?.activation?.navigationType === "traverse" && position) {
      window.scrollTo({ left: position[0], top: position[1], behavior: "instant" });
    }
    if (!event.viewTransition) return;
    pageTransition = event.viewTransition;
    const transition = pageTransition;
    transition.finished.catch(() => {}).finally(() => {
      if (pageTransition === transition) pageTransition = null;
    });
    root.removeAttribute("data-page-enter");
    event.viewTransition.ready.catch(() => {
      if (!reducedMotion.matches) root.dataset.pageEnter = "";
    });
  });
  window.addEventListener("pagehide", () => {
    // The legacy router uses manual restoration, including for document history.
    history.replaceState({ ...history.state, workbookPageScroll: [scrollX, scrollY] }, "", location.href);
  });
  window.addEventListener("pageshow", event => {
    resetExit();
    setDirection();
    const position = event.persisted ? history.state?.workbookPageScroll : restoredScroll;
    if (position) window.scrollTo({ left: position[0], top: position[1], behavior: "instant" });
    if (event.persisted && !reducedMotion.matches && !crossDocument) {
      document.querySelector(surface)?.animate([
        { opacity: 0, transform: `translateY(${root.dataset.pageDirection === "back" ? -14 : 18}px) scale(.992)` },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ], { duration: 560, easing: ease });
    }
  });

  function interruptMotion(event) {
    interruptedPointer = event?.type === "pointerdown" && event.target === root
      && Boolean(pageTransition || localTransition);
    pageTransition?.skipTransition();
    localTransition?.skipTransition();
  }
  window.addEventListener("pointerdown", interruptMotion, { capture: true, passive: true });
  window.addEventListener("keydown", event => {
    if (["Tab", "Enter", " ", "Escape"].includes(event.key)) interruptMotion();
  }, true);

  function pageLink(target) {
    const anchor = target instanceof Element && target.closest("a[href]");
    if (!anchor || anchor.hasAttribute("download") || anchor.hasAttribute("data-no-transition")
      || (anchor.target && anchor.target !== "_self")) return null;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !(url.pathname === base.slice(0, -1) || url.pathname.startsWith(base))
      || /\.[\w]+$/.test(url.pathname)
      || url.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "")) return null;
    return url;
  }

  function prefetch(target) {
    if (navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || "")) return;
    const url = pageLink(target);
    if (!url) return;
    url.hash = "";
    if (prefetched.has(url.href) || prefetched.size >= 8) return;
    prefetched.add(url.href);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = url.href;
    document.head.append(link);
  }
  document.addEventListener("pointerover", event => prefetch(event.target), { passive: true });
  document.addEventListener("focusin", event => prefetch(event.target));
  document.addEventListener("touchstart", event => prefetch(event.target), { passive: true });

  // Use document navigation consistently across the legacy and standalone pages.
  window.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey) return;
    // Snapshot hits target the root; hand the click to its live control after interruption.
    const snapshotHit = interruptedPointer && event.target === root;
    interruptedPointer = false;
    if (snapshotHit) {
      const control = document.elementFromPoint(event.clientX, event.clientY)?.closest("a[href], button, input, summary, [role='button']");
      if (control) {
        event.preventDefault();
        event.stopImmediatePropagation();
        control.click();
      }
      return;
    }
    const url = pageLink(event.target);
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (reducedMotion.matches || crossDocument) {
      location.assign(url.href);
      return;
    }
    destination = url.href;
    if (exitAnimation) return;
    const content = document.querySelector(surface);
    if (!content) {
      location.assign(destination);
      return;
    }
    exitAnimation = content.animate([
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: .72, transform: "translateY(-4px) scale(.998)" }
    ], { duration: 100, easing: "ease-out", fill: "forwards" });
    exitTimer = setTimeout(() => {
      location.assign(destination);
      // Recover if a navigation is interrupted or the page stays in the history cache.
      recoveryTimer = setTimeout(resetExit, 1200);
    }, 100);
  }, true);

  function clearLocalSurface() {
    localSurface?.style.removeProperty("view-transition-name");
    localSurface = null;
    root.removeAttribute("data-page-local");
  }

  function change(update, element, direction = "forward") {
    const current = ++revision;
    localTransition?.skipTransition();
    localAnimation?.cancel();
    clearLocalSurface();
    root.dataset.pageDirection = direction;
    root.removeAttribute("data-page-enter");
    if (reducedMotion.matches || !element) {
      update();
      return;
    }
    if (document.startViewTransition) {
      root.dataset.pageLocal = "";
      localSurface = element;
      element.style.viewTransitionName = "workbook-content";
      let updated = false;
      const commit = () => {
        if (updated || current !== revision) return;
        updated = true;
        update();
      };
      try {
        localTransition = document.startViewTransition(commit);
        localTransition.ready.catch(() => {});
        localTransition.updateCallbackDone.catch(() => {});
        localTransition.finished.catch(() => {}).finally(() => {
          if (current === revision) {
            clearLocalSurface();
            localTransition = null;
          }
        });
      } catch {
        clearLocalSurface();
        commit();
      }
      return;
    }
    localAnimation = element.animate([{ opacity: 1 }, { opacity: .6 }], {
      duration: 80, easing: "ease-out", fill: "forwards"
    });
    localAnimation.finished.then(() => {
      if (current !== revision) return;
      localAnimation.cancel();
      update();
      localAnimation = element.animate([
        { opacity: .6, transform: "translateY(12px) scale(.996)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ], { duration: 460, easing: ease });
    }).catch(() => {});
  }

  window.WorkbookMotion = { change };
})();
