(() => {
  const toggle = document.querySelector("[data-language-toggle]");
  const translated = [...document.querySelectorAll("[data-en], [data-label-en], [data-alt-en]")].map(element => ({
    element,
    text: element.hasAttribute("data-en") ? element.textContent : null,
    label: element.getAttribute("aria-label"),
    alt: element.getAttribute("alt"),
    title: element.getAttribute("title")
  }));
  let english = false;
  function setLanguage(value) {
    english = value;
    document.documentElement.lang = english ? "en" : "zh-CN";
    for (const { element, text, label, alt, title } of translated) {
      if (text !== null) element.textContent = english ? element.dataset.en : text;
      if (label !== null) element.setAttribute("aria-label", english ? element.dataset.labelEn : label);
      if (alt !== null) element.setAttribute("alt", english ? element.dataset.altEn : alt);
      if (title !== null && element.dataset.labelEn) element.title = english ? element.dataset.labelEn : title;
    }
    const action = english ? "切换为中文" : "Switch to English";
    toggle.setAttribute("aria-label", action);
    toggle.title = action;
    toggle.setAttribute("aria-pressed", String(english));
  }
  toggle.addEventListener("click", () => setLanguage(!english));
})();
