// One production industry model's page: model.html?m=IND-<INDUSTRY>[-P5] (names: data/models.json).

const PLOT_STYLE = { background: "transparent", fontSize: "12px" };
const ACC_H = [0, 1, 3, 6];      // the horizons scored in model1_accuracy
const SHARE_KEYS = [["g1", "Activity"], ["g2", "Inflation"], ["g3", "Rate spreads"], ["g4", "Rate levels"],
                    ["d", "Industry activity"], ["m", "Industry prices"]];
const SHARE_COLORS = ["#4e79a7", "#edc948", "#76b7b2", "#9c755f", "#f28e2b", "#e15759"];

document.addEventListener("DOMContentLoaded", async () => {
  let M, A, F, D;
  try {
    [M, A, F, D] = await Promise.all(["models", "model1_accuracy", "industry_forecasts", "datasets"].map((n) => SITE.data(n)));
  } catch (e) { showError("m-overview", e); return; }
  const name = new URLSearchParams(location.search).get("m");
  const m = M.production.find((x) => x.name === name && x.kind === "industry");
  if (!m) {
    document.getElementById("m-title").textContent = "Model not found";
    document.getElementById("m-lead").innerHTML = `There is no production industry model called “${name || ""}”. See the
      <a href="structure.html#production">list of models</a>.`;
    document.querySelectorAll("main h2, main .toc, main figure, main .table-wrap, main details").forEach((x) => (x.hidden = true));
    return;
  }
  const I = M.industries[m.sector];
  const ctx = { m, I, A, M, prices: m.block === "prices", label: I.label };
  ctx.sibling = M.production.find((x) => x.sector === m.sector && x.name !== m.name);
  header(ctx);
  forecastTable(ctx, F);
  accuracy(ctx);
  structure(ctx);
  data(ctx, D);
});

const lower = (s) => (s === "International trade" ? "international trade" : s.toLowerCase());

function header({ m, I, prices, sibling, label }) {
  document.title = `${m.name} · KEYNES`;
  document.getElementById("m-crumb").textContent = m.name;
  document.getElementById("m-title").innerHTML = `${m.name} <span class="muted">· ${label} industry model, ${prices ? "prices" : "activity"}</span>`;
  document.getElementById("m-lead").textContent = prices
    ? `Forecasts of ${lower(label)} prices, 0 to 12 months ahead, from the ${lower(label)} industry model with prices measured as plain growth rates.`
    : `Forecasts of ${lower(label)} activity (output, orders, sales, jobs and the like), 0 to 12 months ahead.`;
  document.getElementById("m-sibling").innerHTML = `<span class="tag">production</span> The same model's ${prices ? "activity" : "price"}
    forecasts are on <a href="${sibling.page}">${sibling.name}</a>. All industry models: <a href="industries.html">Industry models</a>.`;
}

// ------------------------------------------------------------------ forecasts

function forecastTable({ m, A, prices, label }, F) {
  const rows = F.rows.filter((r) => r.sector === m.sector && (r.block === "prices") === prices)
    .map((r) => ({ ...r, record: fcRecord(A, r) })).sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById("m-fc-intro").innerHTML =
    `What ${m.name} predicts for ${rows.length === 1 ? "its" : `each of its ${rows.length}`} ${prices ? "price" : "activity"} target${rows.length === 1 ? "" : "s"}, next to the
    <strong>AR benchmark</strong>, a forecast from the series' own past. Forecasts use the data published by the end of
    ${MONTH(F.vintage)}. Numbers are the % change from the latest published value${prices ? "" : " (capacity utilization: the rate itself, in %)"};
    <strong>0</strong> is the first month not yet published, and 1, 3, 6 and 12 are months after that.`;
  document.getElementById("m-fc").innerHTML = fcHead() + "<tbody>" + rows.map((r) => fcRow(r)).join("") + "</tbody>";
  document.getElementById("m-fc-note").innerHTML = fcKey(m.name) + `<br>Track record: how much smaller ${m.name}'s errors have
    been than the AR's as a nowcast (month 0), on data as first published; see <a href="#accuracy">Accuracy</a>.`;
}

// ------------------------------------------------------------------ accuracy

const gain = (rel) => Math.round((1 - rel) * 1000) / 10;

function accuracy({ m, I, A, prices, label }) {
  const cmp = prices ? "S-t5 vs AR-t5" : "S vs AR";
  const own = A.sectors.filter((r) => r.sector === m.sector && r.span === "real-time" && r.comparison === cmp
    && (r.block === "prices") === prices);
  const econ = prices ? [] : A.sectors.filter((r) => r.sector === "economy" && r.block === m.sector && r.span === "real-time" && r.comparison === "S vs AR");
  const targets = [...new Set(own.map((r) => r.target))];
  const at = (rows, t, h) => rows.find((r) => r.target === t && r.horizon === h);
  const now = targets.map((t) => at(own, t, 0)).filter((x) => x && x.rel != null);
  const three = targets.map((t) => at(own, t, 3)).filter((x) => x && x.rel != null);
  const median = (xs) => d3.median(xs.map((x) => gain(x.rel)));
  const stat = (v, l) => `<div class="stat"><div class="value">${v}</div><div class="label">${l}</div></div>`;
  const signed = (g) => g == null ? "–" : `${g > 0 ? "+" : ""}${g.toFixed(0)}%`;
  document.getElementById("m-stats").innerHTML =
    stat(`${now.filter((x) => x.rel < 1).length} of ${now.length}`, `${prices ? "price" : "activity"} target${now.length === 1 ? "" : "s"} where ${m.name} beats the AR as a nowcast`) +
    stat(signed(median(now)), "median: how much smaller its nowcast errors are than the AR's") +
    stat(signed(median(three)), "the same, 3 months ahead");

  const td = (x) => {
    if (!x || x.rel == null) return `<td class="num muted">–</td>`;
    const g = gain(x.rel), cls = g >= 2 ? "good" : g <= -2 ? "bad" : "";
    return `<td class="num ${cls}" title="relative error ${fmt.n(x.rel, 3)}, p ${fmt.n(x.p, 2)}">${g > 0 ? "+" : ""}${g.toFixed(0)}%${x.p != null && x.p < 0.1 ? "*" : ""}</td>`;
  };
  let html = `<thead><tr><th>Target</th><th>Model</th>${ACC_H.map((h) => `<th class="num">h = ${h}</th>`).join("")}</tr></thead><tbody>`;
  const r0 = (t) => own.find((r) => r.target === t);
  for (const t of targets.sort((a, b) => r0(a).name.localeCompare(r0(b).name))) {
    const lines = [[m.name, own]];
    if (econ.some((r) => r.target === t)) lines.push([`<a href="structure.html#ind-econ">IND-ECON</a> <span class="muted small">· economy model</span>`, econ]);
    lines.forEach(([lab, rows], i) => {
      html += `<tr>${i === 0 ? `<td rowspan="${lines.length}"><strong>${r0(t).name}</strong><br><span class="muted small">${t}</span></td>` : ""}
        <td>${lab}</td>${ACC_H.map((h) => td(at(rows, t, h))).join("")}</tr>`;
    });
  }
  document.getElementById("m-acc").innerHTML = html + "</tbody>";
  const from = I.real_from ? MONTH(I.real_from) : "the start of the industry's archives";
  const econFrom = econ.length && econ[0].real_from ? MONTH(econ[0].real_from) : null;
  document.getElementById("m-acc-intro").innerHTML =
    `How much smaller ${m.name}'s forecast errors have been than the <strong>AR benchmark</strong>'s, target by target and
    by months ahead (<strong>h</strong>; 0 is the nowcast). The test re-runs the model every month from ${from}, when every
    ${lower(label)} series has an archive of its past releases, using only the data published at each date.` +
    (prices ? ` Both the model and the AR forecast plain growth rates.`
            : econFrom ? ` For comparison, <a href="structure.html#ind-econ">IND-ECON</a>, the economy model, which estimates all 13 industries together (tested from ${econFrom}).` : "");
  document.getElementById("m-acc-note").textContent =
    "Percent better (+) or worse (−) than the AR; * significant at 10% (Diebold–Mariano). Hover a cell for the relative error and p-value.";
}

// ------------------------------------------------------------------ structure

function structure({ m, I, M, prices, label }) {
  const series = I.series.filter((s) => s.shares && (s.block === "prices") === prices);
  document.getElementById("m-str-intro").innerHTML =
    `The model has six hidden <strong>factors</strong>: four economy-wide ones (activity, inflation, rate spreads and rate
    levels, estimated from the 126 national series) and two for the industry, ${lower(label)} activity and ${lower(label)} prices.
    Each ${lower(label)} series loads on the economy-wide factors and on its own block's industry factor.` +
    (prices ? ` Shown for the latest fit, which measures prices as changes in growth rates; ${m.name} re-estimates it on plain growth rates.` : "");
  document.getElementById("m-shares-legend").innerHTML = SHARE_KEYS.map(([, l], i) =>
    `<span><i class="dot" style="background:${SHARE_COLORS[i]}"></i>${l}</span>`).join("");
  const rows = series.flatMap((s) => SHARE_KEYS.map(([k, l]) => ({ name: s.name, id: s.id, key: l, v: s.shares[k] || 0 })));
  const total = (s) => d3.sum(SHARE_KEYS, ([k]) => s.shares[k] || 0);
  const order = series.slice().sort((a, b) => total(b) - total(a)).map((s) => s.name);
  mount("m-shares", Plot.plot({
    width: W("m-shares"), height: 26 * series.length + 40, marginLeft: 300, marginRight: 50, style: PLOT_STYLE,
    x: { domain: [0, 1], label: "share explained", tickFormat: "%", grid: true },
    y: { domain: order, label: null, tickFormat: (s) => (s.length > 46 ? `${s.slice(0, 44)}…` : s) },
    color: { domain: SHARE_KEYS.map(([, l]) => l), range: SHARE_COLORS },
    marks: [
      Plot.barX(rows, { x: "v", y: "name", fill: "key", order: SHARE_KEYS.map(([, l]) => l), inset: 1.5, tip: true,
                        title: (r) => `${r.name} (${r.id})\n${r.key}: ${Math.round(r.v * 100)}%` }),
      Plot.text(series, { x: total, y: "name", text: (s) => `${Math.round(total(s) * 100)}%`, dx: 4, textAnchor: "start", fill: col("ink-2") }),
    ],
  }));

  const k = prices ? "prices" : "activity";
  const months = I.factors.months.map((x) => new Date(`${x}-15T12:00:00`));
  const vals = I.factors[k].map((v, i) => ({ date: months[i], v })).filter((d) => d.v != null);
  const recs = M.recessions.filter(([, b]) => b >= I.factors.months[0])
    .map(([a, b]) => ({ a: new Date(`${a}-01T12:00:00`), b: new Date(`${b}-28T12:00:00`) }));
  const ext = d3.quantile(vals.map((d) => Math.abs(d.v)), 0.995) * 1.2;
  document.getElementById("m-factor-title").textContent = `The ${lower(label)} ${k} factor since 1990`;
  mount("m-factor", Plot.plot({
    width: W("m-factor"), height: 240, marginLeft: 40, style: PLOT_STYLE,
    x: { type: "time", label: null },
    y: { label: "sd", grid: true, domain: [-ext, ext], clamp: true },
    marks: [
      Plot.rectX(recs, { x1: "a", x2: "b", y1: -ext, y2: ext, fill: col("ink-3"), fillOpacity: 0.15 }),
      Plot.ruleY([0], { stroke: col("ink-3") }),
      Plot.lineY(vals, { x: "date", y: (d) => Math.max(-ext, Math.min(ext, d.v)), stroke: col("accent"), strokeWidth: 1 }),
      Plot.tip(vals, Plot.pointerX({ x: "date", y: (d) => Math.max(-ext, Math.min(ext, d.v)),
        title: (d) => `${d3.timeFormat("%b %Y")(d.date)}: ${fmt.n(d.v, 2)}` })),
    ],
  }));
  document.getElementById("m-factor-cap").textContent =
    `Latest fit, on the ${MONTH(I.vintage)} data vintage (monthly data from ${MONTH(I.first_month)}). The sign is fixed so that a chosen anchor series loads positively.`;
}

// ------------------------------------------------------------------ data

function data({ m, I, prices, label }, D) {
  const byId = Object.fromEntries(D.map((x) => [x.id, x]));
  document.getElementById("m-data-intro").innerHTML =
    `${m.name} uses the ${I.n_national} national series of FRED-MD (listed on the <a href="data.html">Data</a> page) and the
    ${I.series.length} ${lower(label)} series below, activity and prices alike: the activity and price versions of the model
    use the same data.${prices ? " Here the price series enter as plain growth rates." : ""}`;
  let html = `<thead><tr><th>ID</th><th>Series</th><th>Block</th><th>Enters as</th></tr></thead><tbody>`;
  for (const s of I.series) {
    const id = s.fred ? `<a href="${s.fred}" target="_blank" rel="noopener"><code>${s.id}</code></a>` : `<code>${s.id}</code>`;
    const tr = prices && s.block === "prices" ? "growth rate" : s.transform || (byId[s.id] || {}).transform || "";
    html += `<tr><td>${id}</td><td>${s.name}</td><td>${s.block}</td><td>${tr}</td></tr>`;
  }
  document.getElementById("m-data").innerHTML = html + "</tbody>";
  document.getElementById("m-detail").innerHTML = [
    `<strong>Size</strong>: ${I.n_national + I.series.length} monthly series, ${I.n_months} months from ${MONTH(I.first_month)}; 6 factors with 2 lags.`,
    `<strong>Estimation</strong>: maximum likelihood by the EM algorithm with the Kalman filter and smoother (Bańbura and Modugno 2014), which handles missing values and ragged data edges.`,
    `<strong>Data handling</strong>: FRED-MD's transformation codes${prices ? " (except the industry's prices, as plain growth rates)" : ""}, and the McCracken–Ng outlier rule.`,
    `<strong>Real-time test</strong>: refitted every third month on the data of that date and forecast 0–12 months ahead; scored from ${I.real_from ? MONTH(I.real_from) : "the start of the industry's archives"}.`,
    `<strong>Scores</strong>: root mean squared error relative to the AR's, on cumulative changes; Diebold–Mariano tests with the Harvey–Leybourne–Newbold correction.`,
  ].map((x) => `<li>${x}</li>`).join("");
}
