// Shared helpers for every page: data loading, number formats, small UI controls.

const SITE = {
  cache: {},
  async data(name) {
    if (!this.cache[name]) {
      this.cache[name] = fetch(`data/${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`could not load data/${name}.json`);
        return r.json();
      });
    }
    return this.cache[name];
  },
};

// News categories of the GDP nowcast, in a fixed order with fixed colours (Tableau 10).
const CATEGORIES = [
  ["labor", "Labor", "#4e79a7"],
  ["surveys", "Surveys", "#f28e2b"],
  ["manufacturing", "Manufacturing", "#59a14f"],
  ["retail and consumption", "Retail & consumption", "#e15759"],
  ["housing and construction", "Housing & construction", "#b07aa1"],
  ["international trade", "Trade", "#76b7b2"],
  ["prices", "Prices", "#edc948"],
  ["income and output", "Income & output", "#9c755f"],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(([k, l]) => [k, l]));
const CAT_COLOR = Object.fromEntries(CATEGORIES.map(([k, , c]) => [k, c]));

const fmt = {
  n(x, d = 2) { return x == null ? "–" : x.toFixed(d); },
  signed(x, d = 2) { return x == null ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d); },
  pct(x, d = 0) { return x == null ? "–" : `${(x * 100).toFixed(d)}%`; },
  gain(rel) {   // relative error -> "8% better" / "3% worse"
    if (rel == null) return "–";
    const g = Math.round((1 - rel) * 100);
    return g === 0 ? "same" : g > 0 ? `${g}% better` : `${-g}% worse`;
  },
  date(s) {
    return new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  },
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Segmented control: <div class="seg" data-name="x"><button value="a">A</button>...</div>
function segmented(el, onChange) {
  const buttons = [...el.querySelectorAll("button")];
  const set = (v) => {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.value === v)));
    onChange(v);
  };
  buttons.forEach((b) => b.addEventListener("click", () => set(b.value)));
  return set;
}

function tabs(el) {
  const buttons = [...el.querySelectorAll("button")];
  const show = (id) => {
    buttons.forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute("aria-selected", String(on));
      document.getElementById(b.dataset.tab).hidden = !on;
    });
    history.replaceState(null, "", `#${id}`);
  };
  buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  const fromHash = buttons.find((b) => `#${b.dataset.tab}` === location.hash);
  show((fromHash || buttons[0]).dataset.tab);
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

function mount(id, node) {
  const target = document.getElementById(id);
  target.replaceChildren(node);
}

function showError(id, err) {
  const target = document.getElementById(id);
  if (target) target.innerHTML = `<p class="muted">Could not draw this chart (${err.message}).</p>`;
  console.error(err);
}

document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("nav.main a").forEach((a) => {
    if (a.getAttribute("href") === page) a.setAttribute("aria-current", "page");
  });
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [{ left: "$$", right: "$$", display: true }, { left: "\\(", right: "\\)", display: false }],
    });
  }
});

// Theme colour as a literal value (Plot treats an unknown string such as "var(--x)" as a column name).
const col = (name) => css(`--${name}`);

// Chart width = the width of its container, so charts fill the column on every screen.
const W = (id) => Math.max(320, document.getElementById(id).clientWidth);
