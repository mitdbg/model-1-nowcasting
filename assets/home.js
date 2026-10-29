const PLOT_STYLE = { background: "transparent", fontSize: "12px" };
const day = (s) => new Date(`${s}T12:00:00`);
const QUARTER_WORDS = { 1: "first", 2: "second", 3: "third", 4: "fourth" };

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { quarters } = await SITE.data("nowcast");
    current(quarters.at(-1));
    accuracyStrip();
    miniGdp(quarters);
  } catch (e) { showError("now-chart", e); }
  try { miniIndustries(await SITE.data("model1_accuracy")); } catch (e) { showError("mini-ind", e); }
});

function current(q) {
  const pts = q.dates.map((d, i) => ({ date: day(d), v: q.nowcast[i] }));
  const last = pts.at(-1);
  const [year, n] = q.q.split("Q").map(Number);
  const qStart = new Date(year, (n - 1) * 3, 1, 12), qEnd = new Date(year, n * 3, 0, 12);   // first and last day
  const month = (d) => d.toLocaleDateString("en-US", { month: "long" });
  document.getElementById("headline").innerHTML =
    `As of ${fmt.date(q.dates.at(-1))}, the model puts ${QUARTER_WORDS[n]}-quarter ${year} growth at ` +
    `<strong>${fmt.n(last.v, 1)}%</strong> a year, up from ${fmt.n(pts[0].v, 1)}% in ${month(pts[0].date)}` +
    `${pts[0].date < qStart ? ", before the quarter began" : ""}.`;

  const bounds = [{ date: qStart, label: "START OF QUARTER" }, { date: qEnd, label: "END OF QUARTER" }];
  const marks = [
    Plot.ruleY([0], { stroke: col("line") }),
    Plot.ruleX(bounds, { x: "date", stroke: col("ink-3"), strokeDasharray: "3 3" }),
    Plot.text(bounds, { x: "date", text: "label", frameAnchor: "top", dy: -14, dx: 4, textAnchor: "start",
                        fill: col("ink-3"), fontSize: 10.5, fontWeight: 600 }),
    Plot.lineY(pts, { x: "date", y: "v", stroke: col("accent"), strokeWidth: 2 }),
    Plot.dot(pts, { x: "date", y: "v", fill: col("accent"), r: 3.5, tip: true,
                    title: (d) => `${fmt.date(d.date.toISOString().slice(0, 10))}: ${fmt.n(d.v, 2)}%` }),
    Plot.text([last], { x: "date", y: "v", text: (d) => `${fmt.n(d.v, 1)}%`, dx: 10, textAnchor: "start",
                        fill: col("ink"), fontWeight: 600 }),
  ];
  if (q.advance != null) {
    marks.push(Plot.ruleY([q.advance], { stroke: col("truth"), strokeDasharray: "4 3" }),
               Plot.text([q.advance], { y: (d) => d, x: () => pts[0].date, text: () => `BEA first estimate ${fmt.n(q.advance, 1)}%`,
                                        dy: -7, textAnchor: "start", fill: col("ink-2") }));
  }
  mount("now-chart", Plot.plot({
    width: W("now-chart"), height: 280, marginTop: 34, marginRight: 50, style: PLOT_STYLE,
    x: { type: "time", label: null, domain: [d3.min([pts[0].date, qStart]), d3.max([last.date, qEnd])] },
    y: { label: "GDP growth, % a year", grid: true, domain: [Math.min(0, ...pts.map((d) => d.v)) - 0.5, Math.max(...pts.map((d) => d.v)) + 0.7] },
    marks,
  }));
  document.getElementById("now-caption").textContent =
    `Weekly nowcast of real GDP growth for ${q.q}, at an annual rate. ` +
    (q.advance == null ? "BEA had not yet published its first estimate at the last update. "
                       : `BEA's first estimate (dashed line) was ${fmt.n(q.advance, 1)}%. `) +
    "The model starts tracking a quarter about a month before it begins, so the earliest points are really forecasts. " +
    "Data released then still matter for two reasons. A quarter's growth is measured against the quarter before, so news " +
    "about the previous quarter's months changes the starting level. And the economy has momentum: strong data for one " +
    "quarter point to more growth in the next. Most of the movement comes later, as data for the quarter's own three months are " +
    "released, during the quarter and in the month after it ends."
}

function accuracyStrip() {
  // pre-pandemic MSE on the day before BEA's first estimate (nowcast page, "Scores in full")
  const grey = "#9aa1ad";
  const label = (p, above, anchor, extra = {}) => Plot.text([p], { x: "v", y: () => 0.5, text: (d) => `${d.name} ${d.v}`,
    dy: above ? -16 : 18, textAnchor: anchor, fill: col("ink"), ...extra });
  const ours = { name: "our nowcast", v: 1.37 }, ny = { name: "New York Fed's own model", v: 1.3 };
  const older = { name: "our replica of the older NY Fed model", v: 1.71 }, ar = { name: "benchmark", v: 3.93 };
  mount("acc-strip", Plot.plot({
    width: Math.min(W("acc-strip"), 760), height: 120, marginLeft: 20, marginRight: 40, marginTop: 24, style: PLOT_STYLE,
    x: { domain: [0, 4.5], label: "mean squared error →", ticks: [0, 1, 2, 3, 4] },
    y: { axis: null, domain: [0, 1] },
    marks: [
      Plot.ruleY([0.5], { stroke: col("line"), strokeWidth: 2 }),
      Plot.dot([older, ar], { x: "v", y: () => 0.5, fill: grey, r: 6, stroke: col("bg"), strokeWidth: 1.5 }),
      Plot.dot([ny], { x: "v", y: () => 0.5, stroke: col("ink-2"), strokeWidth: 1.6, r: 7 }),
      Plot.dot([ours], { x: "v", y: () => 0.5, fill: col("accent"), r: 6.5, stroke: col("bg"), strokeWidth: 1.5 }),
      label(ours, true, "end", { fontWeight: 650, dx: 4 }),
      label(ny, false, "end", { dx: 4 }),
      label(older, false, "start", { dx: -4 }),
      label(ar, true, "middle"),
    ],
  }));
}

function miniGdp(Q) {
  const q = Q.filter((x) => x.advance != null && x.q >= "2020Q4");
  const rows = q.map((x) => ({ q: x.q, date: day(x.release), last: x.nowcast.at(-1), adv: x.advance }));
  mount("mini-gdp", Plot.plot({
    width: W("mini-gdp"), height: 170, marginLeft: 30, style: PLOT_STYLE,
    x: { type: "time", label: null, ticks: 4 },
    y: { label: null, grid: true, ticks: 4, tickFormat: (v) => `${v}%` },
    marks: [
      Plot.ruleY([0], { stroke: col("ink-3"), strokeOpacity: 0.5 }),
      Plot.line(rows, { x: "date", y: "adv", stroke: col("truth"), strokeWidth: 1.5 }),
      Plot.dot(rows, { x: "date", y: "last", fill: col("accent"), r: 3, tip: true,
                       title: (r) => `${r.q}\nlast nowcast ${fmt.n(r.last, 1)}%\nfirst estimate ${fmt.n(r.adv, 1)}%` }),
    ],
  }));
}

function miniIndustries(A) {
  const best = Object.entries(A.labels).map(([k, label]) => {
    const rs = A.sectors.filter((r) => r.sector === k && r.horizon === 0 && r.span === "real-time"
      && r.comparison === "S vs AR" && r.block !== "prices" && r.rel != null);
    return { label, g: rs.length ? Math.round((1 - d3.median(rs, (r) => r.rel)) * 100) : null };
  }).filter((r) => r.g != null).sort((a, b) => b.g - a.g);
  mount("mini-ind", Plot.plot({
    width: W("mini-ind"), height: 16 * best.length + 30, marginLeft: 120, marginRight: 40, style: PLOT_STYLE,
    x: { label: null, ticks: 4, tickFormat: (v) => `${v}%` },
    y: { domain: best.map((r) => r.label), label: null, tickSize: 0 },
    marks: [
      Plot.barX(best, { x: "g", y: "label", fill: (r) => (r.g > 0 ? col("good") : col("bad")), fillOpacity: 0.75, inset: 2.5 }),
      Plot.text(best, { x: "g", y: "label", text: (r) => `${r.g > 0 ? "+" : ""}${r.g}%`, dx: 4, textAnchor: "start", fill: col("ink-2"), fontSize: 11,
                         x: (r) => Math.max(r.g, 0) }),
      Plot.ruleX([0], { stroke: col("ink-3") }),
    ],
  }));
}
