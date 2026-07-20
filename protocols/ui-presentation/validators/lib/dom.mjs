// In-page DOM scanning/discovery for the word stream. All functions here are
// serialized into page.evaluate — they must stay self-contained (no imports).

// Scan the word stream: container, word elements (index binding, rect, active
// class, letters with state classes), caret element, stats region.
// Returns a plain JSON object.
export function scanWordStream(sel) {
  const q = (s) => document.querySelector(s);
  const container = q(sel.wordStream);
  const tv = q(sel.testView);
  const out = { containerFound: !!container, words: [], caret: null, statsFound: !!q(sel.liveStats),
                testViewVisible: !!tv && tv.offsetParent !== null,
                indexBinding: null, activeIndices: [] };
  if (!container) return out;
  let words = [...container.querySelectorAll(sel.word)];
  if (words.length === 0) words = [...container.children].filter((c) => c.children.length > 0);
  const vocab = new Set(sel.stateClasses);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let wi = null, binding = null;
    for (const a of sel.indexBindingAttrs) {
      if (w.hasAttribute && w.hasAttribute(a)) { wi = Number(w.getAttribute(a)); binding = a; break; }
    }
    if (binding && out.indexBinding === null) out.indexBinding = binding;
    const r = w.getBoundingClientRect();
    const letterEls = [...w.children];
    const letters = letterEls.map((c) => {
      const states = [...c.classList].filter((x) => vocab.has(x));
      return { text: c.textContent, states, classes: [...c.classList] };
    });
    // bare text directly in the word element = letters not element-wrapped (S-UI-002)
    let bareText = "";
    for (const n of w.childNodes) if (n.nodeType === Node.TEXT_NODE) bareText += n.textContent;
    const active = w.classList.contains(sel.activeClass);
    if (active) out.activeIndices.push(wi ?? i);
    out.words.push({
      i, wi, binding, active,
      classes: [...w.classList],
      text: w.textContent,
      bareText,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      letters,
    });
  }
  // caret discovery: unique element within the test view
  const testView = q(sel.testView) || document.body;
  const carets = sel.caret.flatMap((s) => [...testView.querySelectorAll(s)]);
  const uniq = [...new Set(carets)].filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  out.caretCount = uniq.length;
  if (uniq.length >= 1) {
    const el = uniq[0];
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.caret = {
      rect: { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      display: cs.display, visibility: cs.visibility, opacity: Number(cs.opacity),
      area: r.width * r.height,
    };
  }
  // letter rects for the active word (caret boundary computation)
  const active = out.words.find((w) => w.active);
  if (active) {
    const w = words[active.i];
    out.activeLetterRects = [...w.children].map((c) => {
      const r = c.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, width: r.width, bottom: r.bottom, height: r.height };
    });
    const cs = getComputedStyle(w);
    out.activeWordLine = { top: active.rect.top, bottom: active.rect.bottom, fontSize: parseFloat(cs.fontSize) };
  }
  // container visible region (B-UI-006)
  const cr = container.getBoundingClientRect();
  out.containerRect = { top: cr.top, left: cr.left, right: cr.right, bottom: cr.bottom,
                        width: cr.width, height: cr.height };
  out.viewport = { width: innerWidth, height: innerHeight, scrollY: scrollY };
  return out;
}

// Computed-style metrics: token resolution, letter-state colors, font data.
export function scanComputedStyles(sel) {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const tokens = {};
  // Sealed token set per S-UI-004 (ui-presentation v2.0.0: nine slots).
  for (const t of ["--bg", "--main", "--caret", "--text", "--sub", "--error", "--error-extra", "--sub-alt", "--colorful-error"])
    tokens[t] = cs.getPropertyValue(t).trim();
  // raw (authored) token values from stylesheets, for theme.schema.json validation
  const rawTokens = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (rule.selectorText && /^:root$/.test(rule.selectorText.trim())) {
        for (const t of Object.keys(tokens)) {
          const v = rule.style.getPropertyValue(t).trim();
          if (v && rawTokens[t] === undefined) rawTokens[t] = v;
        }
      }
    }
  }
  const words = [...document.querySelectorAll(sel.wordStream + " " + sel.word)];
  const letterFont = (() => {
    const w = words[0]; const c = w && w.children[0];
    if (!c) return null;
    const cs = getComputedStyle(c);
    return { fontSize: parseFloat(cs.fontSize), fontFamily: cs.fontFamily,
             shorthand: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` };
  })();
  const stateColor = (stateClass) => {
    for (const w of words) for (const c of w.children) {
      const has = [...c.classList].some((x) => sel.stateClasses.includes(x));
      if (stateClass === null ? !has : c.classList.contains(stateClass)) {
        const cs = getComputedStyle(c);
        return { color: cs.color, backgroundColor: cs.backgroundColor, text: c.textContent };
      }
    }
    return null;
  };
  const effectiveBg = (() => {
    let el = words[0];
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
      el = el.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  })();
  return {
    tokens, rawTokens, letterFont, effectiveBg,
    states: { untyped: stateColor(null), correct: stateColor("correct"),
              incorrect: stateColor("incorrect"), extra: stateColor("extra") },
  };
}

// Wait one macrotask + animation frame so MutationObserver callbacks and
// rendering settle after a keystroke.
export function settle() {
  return new Promise((r) => setTimeout(() => requestAnimationFrame(() => r()), 0));
}
