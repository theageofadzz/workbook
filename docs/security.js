(() => {
  "use strict";

  // GitHub Pages cannot set frame headers from the repository, so keep a
  // lightweight fallback for pages opened inside another document.
  try {
    if (window.top !== window.self) window.top.location = window.location.href;
  } catch {
    document.documentElement.dataset.embedded = "true";
  }

  const protectedMedia = "img, video, canvas, svg";
  document.addEventListener("contextmenu", event => {
    if (event.target instanceof Element && event.target.closest(protectedMedia)) {
      event.preventDefault();
    }
  }, true);
  document.addEventListener("dragstart", event => {
    if (event.target instanceof Element && event.target.closest(protectedMedia)) {
      event.preventDefault();
    }
  }, true);
})();
