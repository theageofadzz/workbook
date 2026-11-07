(() => {
  const { repos } = JSON.parse(document.querySelector("#github-data").textContent);
  const list = document.querySelector("[data-repository-list]");
  const detail = document.querySelector("[data-repository-detail]");
  const repositories = document.querySelector("[data-repositories]");
  const search = document.querySelector("[data-repo-search]");
  const language = document.querySelector("[data-language-filter]");
  const baseURL = new URL(".", location.href);
  let previousTab = "overview";

  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of repositories.children) {
      card.hidden = !card.textContent.toLocaleLowerCase().includes(query) || Boolean(language.value && card.dataset.language !== language.value);
      if (!card.hidden) count++;
    }
    document.querySelector("[data-result-count]").textContent = `${count} 个仓库`;
    document.querySelector("[data-empty]").hidden = count !== 0;
  }

  function render(focus = false) {
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
      const tab = params.get("tab") === "repositories" ? "repositories" : "overview";
      previousTab = tab;
      for (const link of document.querySelectorAll("[data-tab]")) {
        if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
      repositories.classList.toggle("is-list", tab === "repositories");
      document.querySelector("[data-list-title]").textContent = tab === "repositories" ? "全部仓库" : "公开项目";
      filter();
      if (focus) document.querySelector(`[data-tab="${tab}"]`).focus({ preventScroll: true });
    }
  }

  function navigate(url) {
    history.pushState({}, "", url);
    render(true);
    window.scrollTo({ top: 0, behavior: "instant" });
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
  document.querySelector("[data-back]").addEventListener("click", () => navigate(new URL(`?tab=${previousTab}`, baseURL)));
  document.querySelector(".github-search").addEventListener("submit", event => event.preventDefault());
  search.addEventListener("input", filter);
  language.addEventListener("change", filter);
  window.addEventListener("popstate", () => render(true));
  render();
})();
