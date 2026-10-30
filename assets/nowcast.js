const day = (s) => new Date(`${s}T12:00:00`);
const LO = -9, HI = 9;
const clip = (v) => Math.max(LO, Math.min(HI, v));
const PLOT_STYLE = { background: "transparent", fontSize: "12px" };

document.addEventListener("DOMContentLoaded", async () => {
  let D;
  try {
    const [d, s] = await Promise.all([SITE.data("nowcast"), SITE.data("nowcast_structure")]);
    D = d;
    SITE.seriesNames = Object.fromEntries(s.series.map((x) => [x.id, x.name]));
  } catch (e) { showError("hist-chart", e); return; }
  const Q = D.quarters;
  const byQ = Object.fromEntries(Q.map((q) => [q.q, q]));
  history(Q);
  quarterExplorer(Q, byQ);
  accuracyStrip();
  accuracy(D);
  ablations(D);
  shares(D);
});

// ------------------------------------------------------------------ every quarter

function history(Q) {
  const paths = Q.flatMap((q) => q.dates.map((d, i) => ({ q: q.q, date: day(d), v: q.nowcast[i], done: q.advance != null })));
  const truth = Q.filter((q) => q.advance != null).map((q) => ({ q: q.q, date: day(q.release), advance: q.advance, latest: q.latest }));
  const state = { period: "2016-2026", truth: "advance" };
  const ranges = { "2006-2015": ["2006-02-01", "2016-03-01"], "2016-2026": ["2015-11-01", "2027-01-01"], all: ["2006-02-01", "2027-01-01"] };

  const draw = () => {
    const [a, b] = ranges[state.period].map(day);
    const inR = (d) => d.date >= a && d.date <= b;
    const t = truth.filter(inR);
    const off = t.filter((d) => d[state.truth] < LO || d[state.truth] > HI);
    const label = state.truth === "advance" ? "first estimate" : "latest revised";
    const current = Q.at(-1);
    mount("hist-chart", Plot.plot({
      width: W("hist-chart"), height: 420, marginLeft: 40, marginRight: 20, style: PLOT_STYLE,
      x: { type: "time", domain: [a, b], label: null },
      y: { domain: [LO, HI], label: "GDP growth, %", grid: true, ticks: [-8, -4, 0, 4, 8], tickFormat: (v) => (v > 0 ? `+${v}` : v) },
      marks: [
        Plot.ruleY([0], { stroke: col("ink-3"), strokeOpacity: 0.5 }),
        Plot.line(paths.filter(inR), { x: "date", y: (d) => clip(d.v), z: "q", stroke: col("accent"),
          strokeOpacity: (d) => (d.done ? 0.5 : 1), strokeWidth: (d) => (d.done ? 1.3 : 2.4) }),
        Plot.line(t, { x: "date", y: (d) => clip(d[state.truth]), stroke: col("truth"), strokeWidth: 1.8 }),
        Plot.dot(t, { x: "date", y: (d) => clip(d[state.truth]), fill: col("truth"), r: 3 }),
        Plot.text(off, { x: "date", y: (d) => clip(d[state.truth]), dx: 6, dy: (d) => (d[state.truth] > 0 ? 8 : -8),
          textAnchor: "start", fill: col("ink-2"), text: (d) => `${d.q}: ${fmt.signed(d[state.truth], 1)} (off scale)` }),
        Plot.tip(t, Plot.pointer({ x: "date", y: (d) => clip(d[state.truth]),
          title: (d) => { const q = Q.find((x) => x.q === d.q);
            return `${d.q}\nGDP, ${label}: ${fmt.n(d[state.truth], 1)}%\nlast nowcast: ${fmt.n(q.nowcast.at(-1), 1)}%`; } })),
        day(current.dates.at(-1)) <= b ? Plot.text([current], { x: (q) => day(q.dates.at(-1)), y: (q) => clip(q.nowcast.at(-1)),
          dy: -14, textAnchor: "end", fill: col("ink"), fontWeight: 600, text: (q) => `${q.q} now: ${fmt.signed(q.nowcast.at(-1), 1)}%` }) : null,
      ],
    }));
  };
  segmented(document.getElementById("hist-period"), (v) => { state.period = v; draw(); })("2016-2026");
  segmented(document.getElementById("hist-truth"), (v) => { state.truth = v; draw(); })("advance");

  const pre = Q.filter((q) => q.advance != null && q.q <= "2019Q4");
  const miss = pre.map((q) => Math.abs(q.nowcast.at(-1) - q.advance));
  const within = miss.filter((m) => m < 1).length / miss.length;
  document.getElementById("hist-note").textContent =
    `Most lines end close to the black dot. Before the pandemic, the last nowcast was within 1 point of BEA's first ` +
    `estimate in ${Math.round(within * 100)}% of quarters, and missed by ${fmt.n(d3.mean(miss), 2)} points on average. ` +
    `The large misses come at turning points, where the model moved the right way but not far enough: in 2008Q4 its ` +
    `last nowcast was ${fmt.n(byQuarter(Q, "2008Q4").nowcast.at(-1), 1)}% against a first estimate of ` +
    `${fmt.n(byQuarter(Q, "2008Q4").advance, 1)}%, and in 2020Q2 ${fmt.n(byQuarter(Q, "2020Q2").nowcast.at(-1), 1)}% ` +
    `against ${fmt.n(byQuarter(Q, "2020Q2").advance, 1)}%.`;
}

const byQuarter = (Q, q) => Q.find((x) => x.q === q);

// ------------------------------------------------------------------ one quarter

function quarterExplorer(Q, byQ) {
  const sel = document.getElementById("q-select");
  [...Q].reverse().forEach((q) => sel.append(el("option", { value: q.q }, q.q + (q.advance == null ? " (current)" : ""))));
  const fromHash = location.hash.match(/^#q=(\d{4}Q\d)$/);
  sel.value = fromHash && byQ[fromHash[1]] ? fromHash[1] : Q.at(-1).q;
  const draw = () => drawQuarter(byQ[sel.value]);
  sel.addEventListener("change", draw);
  document.getElementById("q-nyfed").addEventListener("change", draw);
  draw();
}

function drawQuarter(q) {
  const pts = q.dates.map((d, i) => ({ date: day(d), v: q.nowcast[i], sd: q.sd ? q.sd[i] : null }));
  const band = pts.filter((d) => d.sd != null);
  const first = pts[0].v, last = pts.at(-1).v;
  document.getElementById("q-title").textContent = q.advance == null
    ? `${q.q}: the nowcast went from ${fmt.n(first, 1)}% to ${fmt.n(last, 1)}%; BEA's first estimate is not out yet`
    : `${q.q}: the nowcast went from ${fmt.n(first, 1)}% to ${fmt.n(last, 1)}%; BEA's first estimate was ${fmt.n(q.advance, 1)}%`;

  const nyAll = q.nyfed.filter((d) => d.date).map((d) => ({ date: day(d.date), v: d.value }));
  document.getElementById("q-nyfed-wrap").hidden = !nyAll.length;
  const ny = document.getElementById("q-nyfed").checked ? nyAll : [];
  const legend = [`<span><i class="diamond-key"></i>our weekly nowcast</span>`,
                  `<span><i style="background:${fanTints()[3]};height:10px"></i>50, 60, 70 and 80% probability intervals</span>`];
  if (q.advance != null) legend.push(`<span><i style="background:${col("truth")}"></i>BEA estimates (dashed: first, dotted: latest)</span>`);
  if (ny.length) legend.push(`<span><i class="ring"></i>New York Fed's published nowcast (its older model, weekly reports 2016–2021)</span>`);
  document.getElementById("q-legend").innerHTML = legend.join("");
  fanChart("q-path", q, { nyfed: ny, latest: true });

  // weekly contributions: news by category, data revisions, re-estimation
  const rows = [];
  q.dates.forEach((d, i) => {
    if (i === 0) return;
    for (const [k, label] of CATEGORIES) {
      const v = q.news[k] ? q.news[k][i] : 0;
      if (v) rows.push({ date: day(d), key: label, v });
    }
    if (q.revisions[i]) rows.push({ date: day(d), key: "Data revisions", v: q.revisions[i] });
    const re = (q.parameters[i] || 0) + (q.latent[i] || 0);
    if (re) rows.push({ date: day(d), key: "Re-estimation", v: re });
  });
  const keys = [...CATEGORIES.map(([, l]) => l), "Data revisions", "Re-estimation"];
  const colors = [...CATEGORIES.map(([, , c]) => c), "#7b8494", "#c3c8d0"];
  document.getElementById("q-news-legend").innerHTML = keys.map((k, i) =>
    `<span><i class="dot" style="background:${colors[i]}"></i>${k}</span>`).join("");
  mount("q-news", Plot.plot({
    width: W("q-news"), height: 260, marginLeft: 40, style: PLOT_STYLE,
    x: { type: "band", label: null, tickFormat: (d) => d3.timeFormat("%b %d")(d),
         domain: q.dates.slice(1).map(day) },
    y: { label: "change, points", grid: true },
    color: { domain: keys, range: colors },
    marks: [
      Plot.barY(rows, { x: "date", y: "v", fill: "key", order: keys, inset: 1, tip: true,
                        title: (d) => `${d3.timeFormat("%b %d, %Y")(d.date)}\n${d.key}: ${fmt.signed(d.v, 2)} points` }),
      Plot.ruleY([0], { stroke: col("ink-3") }),
    ],
  }));
  thinBandTicks("q-news");

  const totals = CATEGORIES.map(([k, l]) => ({ l, v: d3.sum(q.news[k] || []) }))
    .concat([{ l: "data revisions", v: d3.sum(q.revisions) }]);
  const up = totals.filter((t) => t.v > 0.05).sort((a, b) => b.v - a.v).slice(0, 2);
  const down = totals.filter((t) => t.v < -0.05).sort((a, b) => a.v - b.v).slice(0, 2);
  const words = (xs) => xs.map((t) => `${t.l.toLowerCase()} (${fmt.signed(t.v, 2)})`).join(" and ");
  document.getElementById("q-summary").textContent =
    (up.length ? `Pushed up most: ${words(up)}. ` : "") + (down.length ? `Pulled down most: ${words(down)}.` : "");

  const names = SITE.seriesNames || {};
  const t = document.getElementById("q-top");
  t.innerHTML = `<thead><tr><th>Release date</th><th>Data series</th><th>For month</th><th class="num">Actual</th>
    <th class="num">Expected</th><th class="num">Effect on nowcast</th></tr></thead>`;
  const body = el("tbody");
  q.top.forEach((r) => body.append(el("tr", { html:
    `<td>${fmt.date(r.date)}</td><td>${names[r.series] || r.series} <span class="tag">${CAT_LABEL[r.category] || r.category}</span></td>
     <td>${r.month}</td><td class="num">${fmt.n(r.actual, 2)}</td><td class="num">${fmt.n(r.expected, 2)}</td>
     <td class="num ${r.impact > 0 ? "good" : "bad"}">${fmt.signed(r.impact, 2)}</td>` })));
  t.append(body);
}

function thinBandTicks(id) {   // a band axis with 20 dates: keep every third label
  document.querySelectorAll(`#${id} [aria-label="x-axis tick label"] text`).forEach((n, i) => {
    if (i % 3) n.remove();
  });
}

// ------------------------------------------------------------------ accuracy

function accuracyStrip() {
  // pre-pandemic MSE on the day before BEA's first estimate (as in "Scores in full" below)
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

function accuracy(D) {
  const pts = [
    ...[2.2, 1.5, 1.3].map((v, i) => ({ who: "nyfed", weeks: [56, 28, 1][i] / 7, mse: v })),
  ];
  const sc = (variant, span, truth) => D.scores[variant].filter((s) => s.span === span && s.truth === truth);
  const legacy = sc("subs_semi15", "pre-pandemic", "advance").map((s) => ({ weeks: s.days / 7, mse: s.mse }));
  const ar = sc("sn2_semi", "pre-pandemic", "advance").map((s) => ({ weeks: s.days / 7, mse: s.mse_ar }));
  const grey = "#9aa1ad";
  mount("acc-horizon", Plot.plot({
    width: W("acc-horizon"), height: 320, marginLeft: 44, marginRight: 30, style: PLOT_STYLE,
    x: { domain: [20, 0], label: "weeks before BEA's first estimate →", ticks: [20, 16, 12, 8, 4, 0] },
    y: { domain: [0, 4.5], label: "mean squared error", grid: true },
    marks: [
      Plot.ruleX([120 / 7, 29 / 7], { stroke: col("ink-3"), strokeDasharray: "3 3" }),
      Plot.text([[120 / 7, "quarter begins"], [29 / 7, "quarter ends"]], { x: (d) => d[0], y: 4.45, text: (d) => d[1],
        textAnchor: "start", dx: 4, fill: col("ink-3") }),
      Plot.line(ar, { x: "weeks", y: "mse", stroke: grey, strokeDasharray: "4 3" }),
      Plot.line(legacy, { x: "weeks", y: "mse", stroke: grey }),
      Plot.dot(legacy, { x: "weeks", y: "mse", fill: grey, r: 4, symbol: "square", tip: true,
                         title: (d) => `older-model replica, ${Math.round(d.weeks * 7)} days before: ${fmt.n(d.mse, 2)}` }),
      Plot.line(D.horizon, { x: "weeks", y: "mse", stroke: col("accent"), strokeWidth: 2.5 }),
      Plot.dot(D.horizon, { x: "weeks", y: "mse", fill: col("accent"), r: 3, tip: true,
                            title: (d) => `our 2.0 replica, ${d.weeks} week${d.weeks > 1 ? "s" : ""} before: ${fmt.n(d.mse, 2)}` }),
      Plot.dot(pts, { x: "weeks", y: "mse", stroke: col("ink-2"), r: 5, strokeWidth: 1.6, tip: true,
                      title: (d) => `New York Fed 2.0, ${Math.round(d.weeks * 7)} days before: ${d.mse}` }),
      Plot.text([ar.at(-1)], { x: "weeks", y: "mse", text: () => "AR benchmark", dy: -10, textAnchor: "end", fill: col("ink-2") }),
    ],
  }));

  const state = { truth: "advance", span: "pre-pandemic" };
  const MODELS = [["sn2_semi", "Our 2.0 replica"], ["subs_semi15", "Our replica of the older model"]];
  const draw = () => {
    const rows = MODELS.map(([v, name]) => ({ name, s: sc(v, state.span, state.truth) }));
    const ar = rows[0].s;
    const ny = state.span === "pre-pandemic" && state.truth !== "latest" ? D.nyfed_table2[state.truth]
      : state.span === "post-pandemic" && state.truth === "advance" ? D.nyfed_table2.post_advance : null;
    const days = [56, 28, 1];
    const cell = (s, key) => { const x = s.find((r) => r.days === key); return x; };
    let html = `<thead><tr><th>Model</th>${days.map((d) => `<th class="num">${d} day${d > 1 ? "s" : ""} before</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach((r, i) => {
      html += `<tr class="${i === 0 ? "best" : ""}"><td>${r.name}</td>${days.map((d) => {
        const x = cell(r.s, d); return `<td class="num">${x ? fmt.n(x.mse, 2) : "–"}</td>`; }).join("")}</tr>`;
    });
    if (ny) html += `<tr><td>New York Fed 2.0 (published, own sample)</td>${ny.map((v) => `<td class="num">${v}</td>`).join("")}</tr>`;
    html += `<tr><td>AR benchmark</td>${days.map((d) => { const x = cell(ar, d); return `<td class="num">${x ? fmt.n(x.mse_ar, 2) : "–"}</td>`; }).join("")}</tr>`;
    html += `<tr><td class="muted">2.0 replica vs AR: p-value</td>${days.map((d) => { const x = cell(ar, d); return `<td class="num muted">${x ? fmt.n(x.dm_p, 2) : "–"}</td>`; }).join("")}</tr>`;
    html += `<tr><td class="muted">68% band coverage (ideal 0.68)</td>${days.map((d) => { const x = cell(ar, d); return `<td class="num muted">${x ? fmt.n(x.cover68, 2) : "–"}</td>`; }).join("")}</tr>`;
    document.getElementById("acc-table").innerHTML = html + "</tbody>";
    const n = ar[0] ? ar[0].n : 0;
    document.getElementById("acc-note").textContent =
      `Mean squared error over ${n} quarters; 2020Q2 and 2020Q3 are excluded, as in the New York Fed's evaluation. ` +
      `p-values are Diebold–Mariano tests of equal accuracy. The post-pandemic span (2020Q4–2023Q1) holds only 10 quarters.`;
  };
  segmented(document.getElementById("acc-truth"), (v) => { state.truth = v; draw(); })("advance");
  segmented(document.getElementById("acc-span"), (v) => { state.span = v; draw(); })("pre-pandemic");

  const truthName = { advance: "BEA first estimate", third: "BEA third estimate", latest: "latest revised" };
  let html = `<thead><tr><th>Compared with</th><th class="num">Days before</th><th class="num">Quarters</th>
    <th class="num">Our 2.0 replica</th><th class="num">NY Fed published (older model)</th><th class="num">AR</th><th class="num">p-value</th></tr></thead><tbody>`;
  const tOrder = { advance: 0, third: 1, latest: 2 };
  D.head_to_head.slice().sort((a, b) => tOrder[a.truth] - tOrder[b.truth] || b.days - a.days).forEach((r) => {
    html += `<tr><td>${truthName[r.truth]}</td><td class="num">${r.days}</td><td class="num">${r.n}</td>
      <td class="num ${r.mse < r.mse_nyfed ? "good" : ""}">${fmt.n(r.mse, 2)}</td><td class="num">${fmt.n(r.mse_nyfed, 2)}</td>
      <td class="num">${fmt.n(r.mse_ar, 2)}</td><td class="num">${fmt.n(r.dm_p, 2)}</td></tr>`;
  });
  document.getElementById("h2h-table").innerHTML = html + "</tbody>";
}

// ------------------------------------------------------------------ ablations

function ablations(D) {
  const V = [["sn2_semi", "Full 2.0 model"], ["sn2_semi_notrend", "without the trend"], ["sn2_semi_noout", "without outlier scales"],
             ["sn2_semi_nosv", "without stochastic volatility"], ["sn2_semi_nocovid", "without the COVID factor"],
             ["sn2_semi_none", "all four off"], ["subs_semi15", "older model (for reference)"]];
  const rows = V.flatMap(([v, name]) => D.scores[v].filter((s) => s.span === "pre-pandemic" && s.truth === "advance")
    .map((s) => ({ name, when: `${s.days} day${s.days > 1 ? "s" : ""} before`, mse: s.mse, full: v === "sn2_semi" })));
  const whens = ["56 days before", "28 days before", "1 day before"];
  mount("abl-chart", Plot.plot({
    width: W("abl-chart"), height: 430, marginLeft: 200, marginRight: 110, style: PLOT_STYLE,
    x: { label: "mean squared error", grid: true, domain: [0, 3.2] },
    y: { domain: V.map((v) => v[1]), label: null },
    fy: { domain: whens, label: null, axis: "right" },
    marks: [
      Plot.barX(rows, { x: "mse", y: "name", fy: "when", fill: (d) => (d.full ? col("accent") : "#b9bfc9"), inset: 1.5, tip: true,
                        title: (d) => `${d.name}, ${d.when}: ${fmt.n(d.mse, 2)}` }),
      Plot.text(rows, { x: "mse", y: "name", fy: "when", text: (d) => fmt.n(d.mse, 2), dx: 4, textAnchor: "start", fill: col("ink-2") }),
      Plot.ruleX([0], { stroke: col("ink-3") }),
    ],
  }));
}

// ------------------------------------------------------------------ news shares

function shares(D) {
  if (!D.news_shares) return;
  const t = document.getElementById("shares-table");
  const name = (c) => CAT_LABEL[c] || c[0].toUpperCase() + c.slice(1);
  let html = `<thead><tr><th>Category</th><th class="num">Ours 2014–16</th><th class="num">Ours 2017–19</th>
    <th class="num">NY Fed 2014–16</th><th class="num">NY Fed 2017–19</th></tr></thead><tbody>`;
  D.news_shares.forEach((r) => {
    const unit = r.category === "mean quarterly impact" ? "" : "%";
    html += `<tr><td>${name(r.category)}</td>${["2014-2016", "2017-2019", "NY 2014-2016", "NY 2017-2019"]
      .map((k) => `<td class="num">${r[k]}${unit}</td>`).join("")}</tr>`;
  });
  t.innerHTML = html + "</tbody>";
}
