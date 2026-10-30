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
  try { seriesCount(await SITE.data("datasets")); } catch (e) { console.error(e); }
});

// "built using X distinct data series", counted from the series list the build script derives from the model configs
function seriesCount(rows) {
  const uses = (r, m) => r.used.includes(m);
  const gdp = rows.filter((r) => uses(r, "GDP nowcast")).length;
  const ind = rows.filter((r) => uses(r, "Industry models")).length;
  const all = rows.filter((r) => uses(r, "GDP nowcast") || uses(r, "Industry models")).length;
  document.getElementById("series-count").textContent =
    ` These models are built using ${all.toLocaleString("en-US")} distinct data series: ${gdp} for the GDP nowcast and ` +
    `${ind} for the industry models, with ${gdp + ind - all} shared by both.`;
}

function current(q) {
  const first = q.nowcast[0], last = q.nowcast.at(-1), sd = q.sd ? q.sd.at(-1) : null;
  const b = quarterBounds(q);
  const [year, n] = q.q.split("Q").map(Number);
  const month = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
  const interval = (z) => `${fmt.n(last - z * sd, 1)}% and ${fmt.n(last + z * sd, 1)}%`;
  document.getElementById("headline").innerHTML =
    `As of ${fmt.date(q.dates.at(-1))}, the model puts ${QUARTER_WORDS[n]}-quarter ${year} growth at ` +
    `<strong>${fmt.n(last, 1)}%</strong> a year, up from ${fmt.n(first, 1)}% in ${month(q.dates[0])}` +
    `${new Date(`${q.dates[0]}T12:00:00`) < b.start ? ", before the quarter began" : ""}.` +
    (sd != null ? ` There is a 50% chance that growth is between ${interval(0.6745)}, and an 80% chance it is between ${interval(1.2816)}.` : "");
  fanChart("now-chart", q, { height: 320 });
  document.getElementById("now-caption").textContent =
    `Weekly nowcast of real GDP growth for ${q.q}, at an annual rate (diamonds), with the model's 50%, 60%, 70% and 80% ` +
    "probability intervals (darkest to palest). Right: how likely each growth rate is, according to the latest nowcast. " +
    (q.advance == null ? `BEA's first estimate is expected around ${d3.timeFormat("%B %-d")(b.release)} (dotted line). `
                       : `BEA's first estimate (circle and dashed line) was ${fmt.n(q.advance, 1)}%. `) +
    "In 2006–2019 the bands were on the wide side: a 68% band held the first estimate 80% of the time. " +
    "The model starts tracking a quarter about a month before it begins, so the earliest points are really forecasts. " +
    "Data released then still matter for two reasons. A quarter's growth is measured against the quarter before, so news " +
    "about the previous quarter's months changes the starting level. And the economy has momentum: strong data for one " +
    "quarter point to more growth in the next. Most of the movement comes later, as data for the quarter's own three months are " +
    "released, during the quarter and in the month after it ends.";
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
