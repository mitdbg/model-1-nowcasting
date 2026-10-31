const PLOT_STYLE = { background: "transparent", fontSize: "12px" };
const day = (s) => new Date(`${s}T12:00:00`);
const QUARTER_WORDS = { 1: "first", 2: "second", 3: "third", 4: "fourth" };

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { quarters } = await SITE.data("nowcast");
    current(quarters.find((q) => q.advance == null) || quarters.at(-1));   // the earliest quarter BEA has not published
    miniGdp(quarters);
  } catch (e) { showError("now-chart", e); }
  try {
    const [A, F] = await Promise.all([SITE.data("model1_accuracy"), SITE.data("industry_forecasts")]);
    miniIndustries(A, F);
  } catch (e) { showError("mini-ind", e); }
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

// "up from", "down from" or "unchanged from", judged on the values as printed (one decimal)
const movedFrom = (a, b) => {
  const d = Math.round(b * 10) - Math.round(a * 10);
  return d > 0 ? "up from" : d < 0 ? "down from" : "unchanged from";
};

function current(q) {
  const first = q.nowcast[0], last = q.nowcast.at(-1), sd = q.sd ? q.sd.at(-1) : null;
  const b = quarterBounds(q);
  const [year, n] = q.q.split("Q").map(Number);
  const month = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
  const interval = (z) => `${fmt.n(last - z * sd, 1)}% and ${fmt.n(last + z * sd, 1)}%`;
  document.getElementById("headline").innerHTML =
    `As of ${fmt.date(q.dates.at(-1))}, the model puts ${QUARTER_WORDS[n]}-quarter ${year} growth at ` +
    `<strong>${fmt.n(last, 1)}%</strong> a year, ${movedFrom(first, last)} ${fmt.n(first, 1)}% in ${month(q.dates[0])}` +
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

// The industry series the models have forecast best (one per industry), with their latest forecasts
function miniIndustries(A, F) {
  const record = (r) => {
    const x = A.sectors.find((a) => a.sector === r.sector && a.target === r.target && a.horizon === 0
      && a.span === "real-time" && a.comparison === r.comparison);
    return x && x.rel != null ? Math.round((1 - x.rel) * 100) : null;
  };
  const seen = new Set();
  const rows = F.rows.filter((r) => r.block === "activity" && r.history)
    .map((r) => ({ ...r, record: record(r) })).filter((r) => r.record != null)
    .sort((a, b) => b.record - a.record)
    .filter((r) => !seen.has(r.sector) && seen.add(r.sector)).slice(0, 6);
  const cell = (r, h) => {
    const m = r.model.find((x) => x.h === h), a = r.ar.find((x) => x.h === h);
    return `<td class="num" title="${MONTH(m.month)}"><span class="val">${fcValue(m, r.unit)}</span><span class="ar">AR ${fcValue(a, r.unit)}</span></td>`;
  };
  document.getElementById("mini-ind").innerHTML =
    `<thead><tr><th>Series</th><th></th><th class="num">Now</th><th class="num">+3 mo</th></tr></thead><tbody>` +
    rows.map((r) => `<tr><td><strong>${r.name}</strong><br><span class="muted small">${A.labels[r.sector]} · ${r.record > 0 ? "+" : ""}${r.record}% vs AR</span></td>
      <td>${sparkline(r, 110, 32)}</td>${cell(r, 0)}${cell(r, 3)}</tr>`).join("") + "</tbody>";
  document.getElementById("mini-ind-cap").innerHTML =
    `Six of the series the industry models forecast best (one per industry): the last three years (grey), the model's
    forecast (blue) and the AR benchmark's (dashed). Forecasts are the % change from the latest published value
    (capacity utilization: the rate), on data through ${MONTH(F.vintage)}; "vs AR": how much smaller the model's
    errors have been as a nowcast.`;
}
