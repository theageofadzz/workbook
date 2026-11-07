(() => {
  "use strict";
  const root = document.documentElement;
  const base = new URL(".", document.currentScript.src).pathname;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const crossDocument = "CSSViewTransitionRule" in window && "onpagereveal" in window;
  const surface = ".profile-page, .writing-main, .github-main, .workbook-about > main, #__next > div > .mx-auto, #__next > div > div > .max-w-\\[800px\\]";
  const ease = "cubic-bezier(.22, 1, .36, 1)";
  let exitAnimation;
  let exitTimer;
  let recoveryTimer;
  let destination;
  let localTransition;
  let localAnimation;
  let revision = 0;
  let localSurface;

  root.dataset.pageEnter = "";
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

  window.addEventListener("pagereveal", event => {
    if (!event.viewTransition) return;
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
    const position = event.persisted ? history.state?.workbookPageScroll : restoredScroll;
    if (position) window.scrollTo({ left: position[0], top: position[1], behavior: "instant" });
    if (event.persisted && !reducedMotion.matches && !crossDocument) {
      document.querySelector(surface)?.animate([
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" }
      ], { duration: 300, easing: ease });
    }
  });

  // Use document navigation consistently across the legacy and standalone pages.
  window.addEventListener("click", event => {
    const anchor = event.target instanceof Element && event.target.closest("a[href]");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey || anchor.hasAttribute("download")
      || (anchor.target && anchor.target !== "_self")) return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !(url.pathname === base.slice(0, -1) || url.pathname.startsWith(base))
      || /\.[\w]+$/.test(url.pathname) || anchor.hasAttribute("data-no-transition")) return;
    if (url.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "")) return;
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
      { opacity: 1, transform: "translateY(0)" },
      { opacity: .35, transform: "translateY(-6px)" }
    ], { duration: 120, easing: "ease-out", fill: "forwards" });
    exitTimer = setTimeout(() => {
      location.assign(destination);
      // Recover if a navigation is interrupted or the page stays in the history cache.
      recoveryTimer = setTimeout(resetExit, 1200);
    }, 120);
  }, true);

  function clearLocalSurface() {
    localSurface?.style.removeProperty("view-transition-name");
    localSurface = null;
    root.removeAttribute("data-page-local");
  }

  function change(update, element) {
    const current = ++revision;
    localTransition?.skipTransition();
    localAnimation?.cancel();
    clearLocalSurface();
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
    localAnimation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 90, easing: "ease-out", fill: "forwards"
    });
    localAnimation.finished.then(() => {
      if (current !== revision) return;
      localAnimation.cancel();
      update();
      localAnimation = element.animate([
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" }
      ], { duration: 280, easing: ease });
    }).catch(() => {});
  }

  window.WorkbookMotion = { change };
})();
