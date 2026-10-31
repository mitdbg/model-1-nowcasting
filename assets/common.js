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

// "Results last updated: <time>" under the header, from data/meta.json (written by the data build)
async function updatedNote() {
  try {
    const { updated } = await SITE.data("meta");
    const t = new Date(updated).toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric", month: "short",
      day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    const note = el("div", { class: "updated" }, el("div", { class: "wrap" }, `Results last updated: ${t}`));
    document.querySelector("header.site").after(note);
  } catch (e) { console.error(e); }
}

document.addEventListener("DOMContentLoaded", () => {
  updatedNote();
  let page = location.pathname.split("/").pop() || "index.html";
  if (page === "model.html") page = "structure.html";       // a model's page sits under Models
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

// ---------------------------------------------------------------- fan chart (after the New York Fed's nowcast page)
// A quarter's weekly nowcast with nested 50/60/70/80% probability bands, start/end-of-quarter and BEA-release
// lines, and beside it the probability density of the latest nowcast with the same bands and a table.

const FAN_LEVELS = [[0.8, 1.2816], [0.7, 1.0364], [0.6, 0.8416], [0.5, 0.6745]];   // probability, normal z
const QUARTER_LAG_DAYS = 29;    // BEA's first estimate comes a median 29 days after the quarter ends (2006-2019)

function fanTints() {
  const mix = d3.interpolateRgb(col("bg"), col("accent"));
  return [mix(0.16), mix(0.28), mix(0.42), mix(0.62)];          // 80% (palest) ... 50% (darkest)
}

function quarterBounds(q) {
  const [year, n] = q.q.split("Q").map(Number);
  const start = new Date(year, (n - 1) * 3, 1, 12), end = new Date(year, n * 3, 0, 12);
  const release = q.release ? new Date(`${q.release}T12:00:00`) : new Date(end.getTime() + QUARTER_LAG_DAYS * 864e5);
  return { start, end, release, expected: !q.release };
}

function fanChart(id, q, opts = {}) {
  const day = (s) => new Date(`${s}T12:00:00`);
  const pts = q.dates.map((d, i) => ({ date: day(d), v: q.nowcast[i], sd: q.sd ? q.sd[i] : null }));
  const band = pts.filter((d) => d.sd != null);
  const tints = fanTints();
  const b = quarterBounds(q);
  const ny = opts.nyfed || [];
  const refs = [];
  if (q.advance != null) refs.push({ label: "first estimate", v: q.advance, dash: "5 3" });
  if (opts.latest && q.latest != null) refs.push({ label: "latest revised", v: q.latest, dash: "1.5 3" });

  const host = document.getElementById(id);
  host.innerHTML = band.length ? `<div class="fan"><div class="fan-main"></div><div class="fan-side"></div></div>`
                               : `<div class="fan solo"><div class="fan-main"></div><div class="fan-side"></div></div>`;
  const main = host.querySelector(".fan-main"), side = host.querySelector(".fan-side");
  const lo = d3.min([...pts.map((d) => d.v - 1.2816 * (d.sd || 0)), ...refs.map((r) => r.v), ...ny.map((d) => d.v)]);
  const hi = d3.max([...pts.map((d) => d.v + 1.2816 * (d.sd || 0)), ...refs.map((r) => r.v), ...ny.map((d) => d.v)]);
  const marks = [
    ...FAN_LEVELS.map(([, z], k) => Plot.areaY(band, { x: "date", y1: (d) => d.v - z * d.sd, y2: (d) => d.v + z * d.sd, fill: tints[k] })),
    Plot.ruleY([0], { stroke: col("ink-3"), strokeOpacity: 0.5 }),
    Plot.ruleX([b.start, b.end], { stroke: col("ink-3"), strokeDasharray: "3 3" }),
    Plot.ruleX([b.release], { stroke: col("ink"), strokeDasharray: b.expected ? "2 3" : null, strokeWidth: 1.2 }),
    Plot.text([[b.start, "START OF QUARTER"], [b.end, "END OF QUARTER"]], { x: (d) => d[0], text: (d) => d[1], frameAnchor: "top",
      dy: -22, dx: 3, textAnchor: "start", fill: col("ink-3"), fontSize: 10, fontWeight: 600 }),
    Plot.text([b.release], { x: (d) => d, frameAnchor: "top", dy: -8, dx: -3, textAnchor: "end", fill: col("ink"), fontSize: 10,
      fontWeight: 600, text: () => `${b.expected ? "BEA ESTIMATE EXPECTED ≈ " : "BEA FIRST ESTIMATE "}${d3.timeFormat("%b %-d")(b.release)}` }),
    ...refs.map((r) => Plot.ruleY([r.v], { stroke: col("truth"), strokeDasharray: r.dash })),
    Plot.dot(refs.filter((r) => r.label === "first estimate"), { x: () => b.release, y: "v", r: 5, stroke: col("truth"), strokeWidth: 1.6, fill: col("bg") }),
    Plot.lineY(ny, { x: "date", y: "v", stroke: col("ink-3"), strokeWidth: 1.2 }),
    Plot.dot(ny, { x: "date", y: "v", stroke: col("ink-2"), fill: col("bg"), r: 3.5, strokeWidth: 1.3, tip: true,
      title: (d) => `New York Fed, ${d3.timeFormat("%b %-d, %Y")(d.date)}: ${fmt.n(d.v, 2)}%` }),
    Plot.lineY(pts, { x: "date", y: "v", stroke: col("truth"), strokeWidth: 1.6 }),
    Plot.dot(pts, { x: "date", y: "v", symbol: "diamond2", fill: col("truth"), r: 4.2, tip: true,
      title: (d) => `${d3.timeFormat("%b %-d, %Y")(d.date)}\nnowcast ${fmt.n(d.v, 2)}%` +
        (d.sd != null ? `\n50%: ${fmt.n(d.v - 0.6745 * d.sd, 1)} to ${fmt.n(d.v + 0.6745 * d.sd, 1)}%\n80%: ${fmt.n(d.v - 1.2816 * d.sd, 1)} to ${fmt.n(d.v + 1.2816 * d.sd, 1)}%` : "") }),
    Plot.text(refs, { x: () => b.release, y: "v", dx: 9, textAnchor: "start", fill: col("ink-2"), text: (r) => `${r.label} ${fmt.n(r.v, 1)}%` }),
  ];
  mount_(main, Plot.plot({
    width: Math.max(320, main.clientWidth), height: opts.height || 330, marginTop: 40, marginLeft: 40, marginRight: refs.length ? 120 : 20,
    style: { background: "transparent", fontSize: "12px" },
    x: { type: "time", label: null, domain: [d3.min([pts[0].date, b.start]), d3.max([b.release, pts.at(-1).date])] },
    y: { label: "GDP growth, % a year", grid: true, domain: [Math.min(lo, 0) - 0.3, hi + 0.4] },
    marks,
  }));
  if (!band.length) { side.remove(); return; }

  // density of the latest nowcast, shaded by the same bands
  const last = band.at(-1), m = last.v, s = last.sd;
  const xs = d3.range(m - 4 * s, m + 4 * s, s / 25);
  const pdf = (x) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const curve = xs.map((x) => ({ x, y: pdf(x) }));
  mount_(side, Plot.plot({
    width: Math.max(240, side.clientWidth), height: 200, marginLeft: 40, marginTop: 28,
    style: { background: "transparent", fontSize: "11px" },
    x: { label: "% a year", domain: [m - 4 * s, m + 4 * s] },
    y: { label: `probability density (${d3.timeFormat("%b %-d")(last.date)})`, grid: true, ticks: 4 },
    marks: [
      ...FAN_LEVELS.map(([, z], k) => Plot.areaY(curve.filter((d) => Math.abs(d.x - m) <= z * s), { x: "x", y: "y", fill: tints[k] })),
      Plot.line(curve, { x: "x", y: "y", stroke: col("ink-2"), strokeWidth: 1 }),
      Plot.ruleX([m], { stroke: col("ink"), strokeDasharray: "3 3" }),
      Plot.dot([m], { x: (d) => d, y: 0, symbol: "diamond2", fill: col("truth"), r: 4.5 }),
      Plot.ruleY([0], { stroke: col("ink-3") }),
    ],
  }));
  const rows = [["Nowcast", null, fmt.n(m, 2)]].concat([...FAN_LEVELS].reverse().map(([p, z], k) =>
    [`${p * 100}% probability`, tints[FAN_LEVELS.length - 1 - k], `${fmt.n(m - z * s, 2)} to ${fmt.n(m + z * s, 2)}`]));
  side.append(el("table", { class: "fan-table", html: `<tbody>${rows.map(([l, c, v]) =>
    `<tr><td>${c ? `<i style="background:${c}"></i>` : `<i class="diamond"></i>`}${l}</td><td class="num">${v}</td></tr>`).join("")}</tbody>` }));
}

function mount_(node, child) { node.replaceChildren(child); }

// ---- industry forecasts (industry page table, home page panel)

const MONTH = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

// A forecast in reporting units: % change from the latest value, or the level (capacity utilization)
const fcValue = (x, unit) => x == null || x.value == null ? "–"
  : unit === "level" ? x.value.toFixed(1) : `${fmt.signed(Math.round(x.value * 10) / 10 || 0, 1)}${unit === "cum" ? "%" : ""}`;

function sparkline(row, w = 150, h = 36) {
  const pad = 3;
  const hist = (row.history || []).map(([m, v]) => [new Date(`${m}-15`), v]);
  const path = (k) => (row[k] || []).map((x) => [new Date(`${x.month}-15`), x.path]);
  const start = hist.length ? [[hist[hist.length - 1][0], row.last]] : [];
  const model = start.concat(path("model")), ar = start.concat(path("ar"));
  const band = (row.model || []).filter((x) => x.path_lo != null).map((x) => [new Date(`${x.month}-15`), x.path_lo, x.path_hi]);
  const all = [...hist, ...model, ...ar].map((d) => d[1]).concat(band.flatMap((d) => [d[1], d[2]]));
  const dates = [...hist, ...model].map((d) => d[0]);
  if (!hist.length) return `<span class="muted small">history not shown (third-party data); <a href="${row.fred}" target="_blank" rel="noopener">FRED</a></span>`;
  const x = d3.scaleTime().domain(d3.extent(dates)).range([pad, w - pad]);
  const y = d3.scaleLinear().domain(d3.extent(all)).nice().range([h - pad, pad]);
  const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
  const area = d3.area().x((d) => x(d[0])).y0((d) => y(d[1])).y1((d) => y(d[2]));
  const lastPt = hist[hist.length - 1];
  return `<svg class="spark" width="${w}" height="${h}" role="img" aria-label="${row.name}: history and forecasts">
    <title>${row.name}\nlatest ${MONTH(row.last_month)}: ${row.last.toLocaleString("en-US", { maximumFractionDigits: 2 })}</title>
    <path d="${area([[lastPt[0], row.last, row.last], ...band])}" fill="${col("accent")}" opacity="0.15"/>
    <path d="${line(hist)}" fill="none" stroke="${col("ink-2")}" stroke-width="1.3"/>
    <path d="${line(ar)}" fill="none" stroke="${col("ink-3")}" stroke-width="1.5" stroke-dasharray="3 2"/>
    <path d="${line(model)}" fill="none" stroke="${col("accent")}" stroke-width="2"/>
    <circle cx="${x(lastPt[0])}" cy="${y(row.last)}" r="2.5" fill="${col("ink")}"/>
  </svg>`;
}

const FC_H = [0, 1, 3, 6, 12];

// One row of a forecast table: series, sparkline, latest month, model and AR at each horizon, track record.
// sub: the small line under the series name (defaults to its ID, linked to FRED).
function fcRow(r, sub = "") {
  const cells = FC_H.map((h) => {
    const m = (r.model || []).find((x) => x.h === h), a = (r.ar || []).find((x) => x.h === h);
    const tip = m ? `${MONTH(m.month)}: model ${fcValue(m, r.unit)}` + (m.lo != null ? ` (68% range ${fcValue({ value: m.lo }, r.unit)} to ${fcValue({ value: m.hi }, r.unit)})` : "") + `, AR ${fcValue(a, r.unit)}` : "";
    return `<td class="num" title="${tip}"><span class="val">${fcValue(m, r.unit)}</span><span class="ar">AR ${fcValue(a, r.unit)}</span></td>`;
  }).join("");
  const g = r.record, cls = g == null ? "muted" : g >= 2 ? "good" : g <= -2 ? "bad" : "";
  const id = r.fred ? `<a href="${r.fred}" target="_blank" rel="noopener">${r.target}</a>` : r.target;
  return `<tr><td><strong>${r.name}</strong><br><span class="muted small">${id}${sub ? ` · ${sub}` : ""}</span></td>
    <td>${sparkline(r)}</td><td class="num small">${MONTH(r.last_month)}</td>${cells}
    <td class="num ${cls}" title="Errors as a nowcast, relative to the AR's, on data as first published">${g == null ? "–" : `${g > 0 ? "+" : ""}${g.toFixed(0)}%`}</td></tr>`;
}

const fcHead = (name = "<th>Series</th>", record = '<th class="num">Track<br>record</th>') =>
  `<thead><tr>${name}<th>History and forecast</th><th class="num">Latest</th>
    ${FC_H.map((h) => `<th class="num">${h === 0 ? "0 (now)" : h}</th>`).join("")}${record}</tr></thead>`;

const fcKey = (model = "industry model") =>
  `<span class="fc-key"><i style="border-color:${col("ink-2")}"></i>published data, last 3 years</span>` +
  `<span class="fc-key"><i style="border-color:${col("accent")}"></i>${model} (shaded: 68% range)</span>` +
  `<span class="fc-key"><i style="border-color:${col("ink-3")};border-top-style:dashed"></i>AR benchmark</span>`;

// Track record of a forecast row: % smaller nowcast errors than the AR's, real-time span (model1_accuracy)
const fcRecord = (A, r) => {
  const x = A.sectors.find((a) => a.sector === r.sector && a.target === r.target && a.horizon === 0
    && a.span === "real-time" && a.comparison === r.comparison);
  return x && x.rel != null ? Math.round((1 - x.rel) * 1000) / 10 : null;
};

// ---- model names (data/models.json): a link to a model's page

function modelLink(M, name) {
  if (name === "IND-*") return `<a href="structure.html#production">all industry models</a>`;
  const m = [...M.production, ...M.reference].find((x) => x.name === name);
  return m ? `<a href="${m.page}" title="${m.label}">${name}</a>` : name;
}
