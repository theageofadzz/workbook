(() => {
  const { repos, calendars } = JSON.parse(document.querySelector("#github-data").textContent);
  const list = document.querySelector("[data-repository-list]");
  const detail = document.querySelector("[data-repository-detail]");
  const baseURL = new URL(".", location.href);
  const range = document.querySelector("[data-contribution-range]");
  const moreActivity = document.querySelector("[data-more-activity]");
  const activityMonths = [...document.querySelectorAll("[data-activity-month]")];
  const tooltip = document.querySelector("[data-contribution-tooltip]");
  let activityLimit = 3;

  function renderContributions() {
    const calendar = calendars.find(item => item.id === range.value) || calendars[0];
    for (const panel of document.querySelectorAll("[data-calendar]")) panel.hidden = panel.dataset.calendar !== calendar.id;
    const eligible = activityMonths.filter(month => {
      const start = `${month.dataset.activityMonth}-01`;
      const end = `${month.dataset.activityMonth}-31`;
      return start <= calendar.to.slice(0, 10) && end >= calendar.from.slice(0, 10);
    });
    activityMonths.forEach(month => { month.hidden = true; });
    eligible.slice(0, activityLimit).forEach(month => { month.hidden = false; });
    moreActivity.hidden = eligible.length <= activityLimit;
    document.querySelector("[data-activity-empty]").hidden = eligible.length !== 0;
    tooltip.hidden = true;
    requestAnimationFrame(() => {
      const scroll = document.querySelector(`[data-calendar="${calendar.id}"] [data-calendar-scroll]`);
      scroll.scrollLeft = scroll.scrollWidth;
    });
  }

  function showContribution(day) {
    tooltip.textContent = day.getAttribute("aria-label");
    tooltip.hidden = false;
    const box = day.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.x + box.width / 2 - width / 2))}px`;
    tooltip.style.top = `${Math.max(8, box.top - tooltip.offsetHeight - 9)}px`;
    day.setAttribute("aria-describedby", "github-contribution-tooltip");
  }

  tooltip.id = "github-contribution-tooltip";
  document.querySelector("[data-contribution-calendars]").addEventListener("pointerover", event => {
    const day = event.target.closest("[data-contribution-day]");
    if (day) showContribution(day);
  });
  document.querySelector("[data-contribution-calendars]").addEventListener("pointerout", event => {
    const day = event.target.closest("[data-contribution-day]");
    if (day && !day.contains(event.relatedTarget)) {
      tooltip.hidden = true;
      day.removeAttribute("aria-describedby");
    }
  });
  document.querySelector("[data-contribution-calendars]").addEventListener("focusin", event => {
    const day = event.target.closest("[data-contribution-day]");
    if (day) {
      for (const cell of day.closest("[data-calendar]").querySelectorAll("[data-contribution-day]")) cell.tabIndex = cell === day ? 0 : -1;
      showContribution(day);
    }
  });
  document.querySelector("[data-contribution-calendars]").addEventListener("focusout", event => {
    tooltip.hidden = true;
    event.target.closest("[data-contribution-day]")?.removeAttribute("aria-describedby");
  });
  document.querySelector("[data-contribution-calendars]").addEventListener("keydown", event => {
    const day = event.target.closest("[data-contribution-day]");
    if (!day || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const days = [...day.closest("[data-calendar]").querySelectorAll("[data-contribution-day]")];
    const index = days.indexOf(day);
    const position = { ArrowLeft: index - 7, ArrowRight: index + 7, ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: days.length - 1 }[event.key];
    days[Math.max(0, Math.min(days.length - 1, position))].focus();
  });
  document.addEventListener("scroll", () => { tooltip.hidden = true; }, true);
  window.addEventListener("resize", () => { tooltip.hidden = true; });
  range.addEventListener("change", () => { activityLimit = 3; renderContributions(); });
  moreActivity.addEventListener("click", () => {
    activityLimit += 3;
    renderContributions();
  });

  function render(focus = false) {
    tooltip.hidden = true;
    const params = new URLSearchParams(location.search);
    const repo = repos.find(item => item.name === params.get("repo"));
    list.hidden = Boolean(repo);
    detail.hidden = !repo;
    if (repo) {
      const heading = document.querySelector("[data-repository-title]");
      heading.textContent = repo.name;
      document.querySelector("[data-repository-description]").textContent = repo.description || "";
      document.querySelector("[data-repository-meta]").textContent = [repo.language, `${repo.stars} Stars`, `${repo.forks} Forks`, `更新于 ${repo.updatedAt.slice(0, 10)}`].filter(Boolean).join(" · ");
      document.querySelector("[data-readme]").innerHTML = repo.readme || "<p>这个仓库暂时没有 README。</p>";
      if (focus) heading.focus({ preventScroll: true });
    } else {
      if (params.get("tab") === "repositories") {
        const url = new URL(location.href);
        url.searchParams.set("tab", "overview");
        history.replaceState(history.state, "", url);
      }
      renderContributions();
      if (focus) document.querySelector('[data-tab="overview"]').focus({ preventScroll: true });
    }
  }

  function navigate(url) {
    if (url.href === location.href) return;
    const update = () => {
      history.pushState({}, "", url);
      render(true);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    if (window.WorkbookMotion) window.WorkbookMotion.change(update, document.querySelector(".github-content"));
    else update();
  }

  document.addEventListener("click", event => {
    const anchor = event.target.closest("a[href]");
    if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
    const url = new URL(anchor.href);
    if (url.origin !== baseURL.origin || url.pathname.replace(/\/$/, "") !== baseURL.pathname.replace(/\/$/, "")) return;
    if (url.hash) return;
    event.preventDefault();
    navigate(url);
  });
  document.querySelector("[data-back]").addEventListener("click", () => navigate(new URL("?tab=overview", baseURL)));
  window.addEventListener("popstate", () => {
    if (window.WorkbookMotion) window.WorkbookMotion.change(() => render(true), document.querySelector(".github-content"));
    else render(true);
  });
  render();
})();
