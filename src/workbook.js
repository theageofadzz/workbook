(() => {
  const script = document.currentScript;
  const base = new URL(".", script.src).pathname.replace(/\/$/, "");
  const repository = "https://github.com/theageofadzz/workbook";
  let config = { title: "Workbook", subtitle: "作品集 / 我的设计工程师职业生涯" };
  const githubIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-1/2 text-neutral-600" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.8A5.3 5.3 0 0 0 18.7 5a5 5 0 0 0-.1-3.6S17.4 1 15 2.8a13.4 13.4 0 0 0-6 0C6.6 1 5.4 1.4 5.4 1.4A5 5 0 0 0 5.3 5a5.3 5.3 0 0 0-1.5 3.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 9 18.1V22"/></svg>';

  function applyBrand() {
    const heading = [...document.querySelectorAll("h1")].find(node => node.textContent === "设计垂点");
    if (heading) {
      heading.textContent = config.title;
      const subtitle = heading.nextElementSibling;
      if (subtitle) subtitle.textContent = config.subtitle;
    }
    document.querySelectorAll("h2 a").forEach(anchor => {
      if (anchor.textContent === "设计垂点") anchor.textContent = config.title;
    });
    document.querySelectorAll('a[aria-label="访问 Aragakey 个人主页"]').forEach(anchor => {
      anchor.dataset.workbookSignature = "";
      anchor.href = `${base}/about/`;
      anchor.removeAttribute("target");
      anchor.setAttribute("aria-label", "关于 Workbook");
    });
    const footer = [...document.querySelectorAll('[data-role="footer-item"]')];
    const labels = ["文章首页", "作品与实验", "GitHub 仓库", "关于 Workbook"];
    footer.forEach((anchor, index) => {
      if (!labels[index]) return;
      anchor.dataset.tooltip = labels[index];
      if (anchor.getAttribute("aria-label") !== labels[index]) anchor.setAttribute("aria-label", labels[index]);
      if (index === 2 && anchor.href !== repository) {
        anchor.href = repository;
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
      anchor.href = repository;
      anchor.setAttribute("aria-label", "Workbook GitHub");
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
  }
  if (document.readyState === "complete") setTimeout(start, 100);
  else window.addEventListener("load", () => setTimeout(start, 100), { once: true });
})();
