(() => {
  const script = document.currentScript;
  const base = new URL(".", script.src).pathname.replace(/\/$/, "");
  const profile = "https://github.com/theageofadzz";
  let config = { title: "theageofadzz", subtitle: "作品集 / 我的设计工程师职业生涯" };
  let fullBranding = document.readyState === "complete";
  const githubIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-1/2 text-neutral-600" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.8A5.3 5.3 0 0 0 18.7 5a5 5 0 0 0-.1-3.6S17.4 1 15 2.8a13.4 13.4 0 0 0-6 0C6.6 1 5.4 1.4 5.4 1.4A5 5 0 0 0 5.3 5a5.3 5.3 0 0 0-1.5 3.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 9 18.1V22"/></svg>';

  function applyBrand() {
    const heading = [...document.querySelectorAll("h1")].find(node =>
      ["设计垂点", "Workbook", config.title].includes(node.textContent.trim())
    );
    if (heading) {
      if (heading.textContent !== config.title) heading.textContent = config.title;
      const subtitle = heading.nextElementSibling;
      if (subtitle && subtitle.textContent.trim() !== config.subtitle) subtitle.textContent = config.subtitle;
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
    const labels = ["文章首页", "作品与实验", "GitHub 个人主页", `关于 ${config.title}`];
    footer.forEach((anchor, index) => {
      if (!labels[index]) return;
      anchor.dataset.tooltip = labels[index];
      if (anchor.getAttribute("aria-label") !== labels[index]) anchor.setAttribute("aria-label", labels[index]);
      if (index === 2 && anchor.href !== profile) {
        anchor.href = profile;
        anchor.rel = "noreferrer";
        const icon = anchor.querySelector("svg");
        if (icon) icon.outerHTML = githubIcon;
      }
      if (index === 3) {
        if (!anchor.href.endsWith(`${base}/about/`)) anchor.href = `${base}/about/`;
        anchor.removeAttribute("target");
      }
    });
    if (document.title === "设计垂点") document.title = config.title;
    else if (document.title.includes("设计垂点")) document.title = document.title.replace("设计垂点", config.title);
    else if (document.title !== config.title && !document.title.endsWith(` · ${config.title}`)) document.title += ` · ${config.title}`;
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
