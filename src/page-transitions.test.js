import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./page-transitions.js", import.meta.url), "utf8");

function browser({ native = false, reduced = false, saveData = false } = {}) {
  const listeners = new Map();
  const assigned = [];
  const hints = [];
  const animations = [];
  const timers = new Map();
  const scrolls = [];
  const root = {
    dataset: {},
    removeAttribute(name) { delete this.dataset[name.replace(/^data-/, "").replace(/-([a-z])/g, (_, char) => char.toUpperCase())]; }
  };
  class Element {
    constructor(href, attrs = {}) { this.href = href; this.attrs = attrs; this.target = attrs.target || ""; }
    closest() { return this; }
    hasAttribute(name) { return name in this.attrs; }
  }
  function listen(type, callback) {
    const callbacks = listeners.get(type) || [];
    callbacks.push(callback);
    listeners.set(type, callbacks);
  }
  const content = {
    animate(frames, options) {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    }
  };
  const document = {
    documentElement: root,
    currentScript: { src: "https://example.com/workbook/page-transitions.js" },
    referrer: "",
    head: { append(link) { hints.push(link); } },
    createElement() { return {}; },
    addEventListener: listen,
    querySelector() { return content; },
    elementFromPoint() { return document.pointTarget; }
  };
  const location = new URL("https://example.com/workbook/");
  location.assign = url => assigned.push(url);
  const history = { state: { retained: true }, replaceState(state) { this.state = state; } };
  const window = { addEventListener: listen, scrollTo: position => scrolls.push(position) };
  if (native) Object.assign(window, { CSSViewTransitionRule: class {}, onpagereveal: null });
  runInNewContext(source, {
    window, document, location, history, Element, URL, scrollX: 0, scrollY: 420,
    navigator: { connection: { saveData } },
    performance: { getEntriesByType() { return [{ type: "navigate" }]; } },
    matchMedia() { return { matches: reduced }; },
    setTimeout(callback, delay) { const id = {}; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    root, assigned, animations, hints, scrolls, history, window, document,
    fire(type, event = {}) { event.type = type; for (const callback of listeners.get(type) || []) callback(event); },
    link(path, attrs) { return new Element(new URL(path, location).href, attrs); },
    click(target, extra = {}) {
      const event = { target, button: 0, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra };
      this.fire("click", event);
      return event;
    },
    advance(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        timers.delete(id);
        timer.callback();
      }
    }
  };
}

test("rapid fallback clicks follow the last destination and recover after interruption", () => {
  const page = browser();
  page.click(page.link("/workbook/crafts/"));
  page.click(page.link("/workbook/about/"));
  assert.equal(page.animations.length, 1);
  assert.equal(page.assigned.length, 0);
  page.advance(100);
  assert.deepEqual(page.assigned, ["https://example.com/workbook/about/"]);
  page.advance(1200);
  assert.equal(page.animations[0].cancelled, true);
  page.click(page.link("/workbook/github/"));
  page.advance(100);
  assert.equal(page.assigned.at(-1), "https://example.com/workbook/github/");
});

test("native transitions and reduced motion navigate without an artificial exit delay", () => {
  for (const options of [{ native: true }, { reduced: true }]) {
    const page = browser(options);
    assert.equal(page.click(page.link("/workbook/crafts/")).prevented, true);
    assert.equal(page.assigned.length, 1);
    assert.equal(page.animations.length, 0);
  }
});

test("modified, external, download, local anchor and dialog links retain their behavior", () => {
  const page = browser();
  const links = [
    page.link("https://github.com/theageofadzz"),
    page.link("/workbook/#section"),
    page.link("/workbook/?work=cicada-cells"),
    page.link("/workbook/assets/cells/index.html"),
    page.link("/workbook/about/", { target: "_blank" }),
    page.link("/workbook/about/", { download: "" }),
    page.link("/workbook/about/", { "data-no-transition": "" })
  ];
  for (const link of links) assert.equal(page.click(link).prevented, undefined);
  assert.equal(page.click(page.link("/workbook/crafts/"), { metaKey: true }).prevented, undefined);
  assert.equal(page.assigned.length, 0);
  assert.equal(page.animations.length, 0);
});

test("intent prefetch is deduplicated, capped and respects data saving", () => {
  const page = browser();
  page.fire("pointerover", { target: page.link("/workbook/about/#one") });
  page.fire("focusin", { target: page.link("/workbook/about/#two") });
  assert.equal(page.hints.length, 1);
  assert.equal(page.hints[0].href, "https://example.com/workbook/about/");
  page.fire("touchstart", { target: page.link("https://github.com/theageofadzz") });
  assert.equal(page.hints.length, 1);
  for (let index = 0; index < 20; index++) page.fire("pointerover", { target: page.link(`/workbook/article-${index}/`) });
  assert.equal(page.hints.length, 8);
  const limited = browser({ saveData: true });
  limited.fire("focusin", { target: limited.link("/workbook/crafts/") });
  assert.equal(limited.hints.length, 0);
});

test("history traversal restores scroll before reveal and reverses its motion", () => {
  const page = browser({ native: true });
  page.fire("pagehide");
  assert.equal(page.history.state.retained, true);
  assert.deepEqual([...page.history.state.workbookPageScroll], [0, 420]);
  page.window.navigation = { activation: { navigationType: "traverse", entry: { index: 1 }, from: { index: 2 } } };
  page.fire("pagereveal");
  assert.equal(page.root.dataset.pageDirection, "back");
  assert.equal(page.scrolls[0].top, 420);
});

test("a fresh input interrupts the previous document transition", () => {
  const page = browser({ native: true });
  let skipped = 0;
  const transition = {
    ready: Promise.resolve(),
    finished: new Promise(() => {}),
    skipTransition() { skipped++; }
  };
  page.fire("pagereveal", { viewTransition: transition });
  page.fire("pointerdown");
  assert.equal(skipped, 1);
  page.fire("keydown", { key: "Enter" });
  assert.equal(skipped, 2);
});

test("clicking a transition snapshot still follows the live navigation link", () => {
  const page = browser({ native: true });
  page.fire("pagereveal", { viewTransition: {
    ready: Promise.resolve(), finished: new Promise(() => {}), skipTransition() {}
  } });
  page.document.pointTarget = page.link("/workbook/about/");
  page.document.pointTarget.click = () => page.click(page.document.pointTarget);
  page.fire("pointerdown", { target: page.root });
  page.click(page.root, { clientX: 740, clientY: 650 });
  assert.deepEqual(page.assigned, ["https://example.com/workbook/about/"]);
});

test("interrupted snapshot clicks preserve same-page link actions", () => {
  const page = browser({ native: true });
  page.fire("pagereveal", { viewTransition: {
    ready: Promise.resolve(), finished: new Promise(() => {}), skipTransition() {}
  } });
  page.document.pointTarget = page.link("/workbook/#section");
  let activated = 0;
  page.document.pointTarget.click = () => { activated++; };
  page.fire("pointerdown", { target: page.root });
  assert.equal(page.click(page.root, { clientX: 100, clientY: 100 }).prevented, true);
  assert.equal(activated, 1);
  assert.equal(page.assigned.length, 0);
});

test("buttons remain clickable during a content transition", () => {
  const page = browser({ native: true });
  page.fire("pagereveal", { viewTransition: {
    ready: Promise.resolve(), finished: new Promise(() => {}), skipTransition() {}
  } });
  let returned = false;
  page.document.pointTarget = { closest() { return this; }, click() { returned = true; } };
  page.fire("pointerdown", { target: page.root });
  page.click(page.root, { clientX: 460, clientY: 100 });
  assert.equal(returned, true);
  assert.equal(page.assigned.length, 0);
});
