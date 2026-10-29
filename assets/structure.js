const PLOT_STYLE = { background: "transparent", fontSize: "12px" };
const GENERAL = ["g1", "g2", "g3", "g4"];

document.addEventListener("DOMContentLoaded", async () => {
  tabs(document.querySelector(".tabs"));
  try {
    const [g, m] = await Promise.all([SITE.data("nowcast_structure"), SITE.data("model1_structure")]);
    gdpMatrix(g);
    // the economy-model charts need a visible container to measure their width
    const drawM1 = () => { if (!drawM1.done && !document.getElementById("m1").hidden) { drawM1.done = true; model1(m); } };
    document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", drawM1));
    drawM1();
  } catch (e) { showError("gdp-matrix", e); }
});

// ------------------------------------------------------------------ GDP model: loading matrix

function gdpMatrix(S) {
  document.getElementById("gdp-fit").textContent =
    `Fit of ${S.fit_date}, on ${S.months} months of data from ${S.start}.`;
  const cols = [["trend", "Trend"], ["global", "Global"], ["soft", "Soft"], ["nominal", "Nominal"], ["labor", "Labor"], ["covid", "COVID"]];
  // scale bars by a high quantile so a few large loadings do not shrink the rest to dots
  const maxL = d3.quantile(S.series.flatMap((s) => Object.values(s.loadings).map(Math.abs)), 0.95);
  const maxC = d3.quantile(S.series.map((s) => Math.abs(s.covid)), 0.95);
  const bar = (v, max) => {
    const w = Math.max(3, Math.min(60, Math.round(Math.abs(v) / max * 56)));
    return `<span class="bar${v < 0 ? " neg" : ""}" style="width:${w}px"></span>`;
  };
  let html = `<thead><tr><th>Series</th><th>Frequency</th>${cols.map(([, l]) => `<th class="cell">${l}</th>`).join("")}</tr></thead><tbody>`;
  const cats = [...new Set(S.series.map((s) => s.category))];
  for (const c of cats) {
    html += `<tr><td colspan="${cols.length + 2}" class="muted small" style="padding-top:14px"><strong>${CAT_LABEL[c] || c}</strong></td></tr>`;
    for (const s of S.series.filter((x) => x.category === c)) {
      const name = s.fred ? `<a href="${s.fred}" target="_blank" rel="noopener">${s.name}</a>` : s.name;
      html += `<tr><td>${name}${s.stand_in ? ' <span class="tag">ISM stand-in</span>' : ""}</td><td>${s.freq === "Q" ? "quarterly" : "monthly"}</td>`;
      for (const [k, label] of cols) {
        if (k === "trend") html += s.trend ? `<td class="cell" title="Trend: loading fixed at 1">${bar(1, 1)}</td>` : `<td class="cell off">·</td>`;
        else if (k === "covid") html += `<td class="cell" title="COVID: ${fmt.n(s.covid, 2)}">${bar(s.covid, maxC)}</td>`;
        else if (k in s.loadings) html += `<td class="cell" title="${label}: ${fmt.n(s.loadings[k], 3)}">${bar(s.loadings[k], maxL)}</td>`;
        else html += `<td class="cell off">·</td>`;
      }
      html += "</tr>";
    }
  }
  document.getElementById("gdp-matrix").innerHTML = html + "</tbody>";
}

// ------------------------------------------------------------------ economy model

function model1(M) {
  const label = Object.fromEntries(M.factors.map((f) => [f.key, f.label]));
  const fsel = document.getElementById("f-select");
  M.factors.forEach((f) => fsel.append(el("option", { value: f.key },
    GENERAL.includes(f.key) ? `${f.label} (economy-wide, ${f.key})` : `${f.label} (industry)`)));
  const drawFactor = () => {
    const k = fsel.value;
    const rows = M.series.filter((s) => s.shares[k]).map((s) => ({ ...s, v: s.shares[k] }))
      .sort((a, b) => b.v - a.v).slice(0, 20);
    document.getElementById("f-title").textContent = rows.length
      ? `The ${label[k].toLowerCase()} factor explains ${Math.round(rows[0].v * 100)}% of ${rows[0].name}`
      : label[k];
    mount("f-bars", Plot.plot({
      width: W("f-bars"), height: 26 * rows.length + 40, marginLeft: 330, marginRight: 50, style: PLOT_STYLE,
      x: { domain: [0, 1], label: "share explained", tickFormat: "%", grid: true },
      y: { domain: rows.map((r) => r.name), label: null, tickFormat: (s) => (s.length > 52 ? `${s.slice(0, 50)}…` : s) },
      marks: [
        Plot.barX(rows, { x: "v", y: "name", fill: col("accent"), inset: 2, tip: true,
                          title: (r) => `${r.name} (${r.id})\n${r.group}\n${Math.round(r.v * 100)}% explained by this factor` }),
        Plot.text(rows, { x: "v", y: "name", text: (r) => `${Math.round(r.v * 100)}%`, dx: 4, textAnchor: "start", fill: col("ink-2") }),
      ],
    }));
    const months = M.history.months.map((m) => new Date(`${m}-15T12:00:00`));
    const vals = M.history[k].map((v, i) => ({ date: months[i], v }));
    const recs = M.recessions.filter(([, b]) => b >= M.history.months[0]).map(([a, b]) => ({ a: new Date(`${a}-01T12:00:00`), b: new Date(`${b}-28T12:00:00`) }));
    document.getElementById("f-hist-title").textContent = `The ${label[k].toLowerCase()} factor over time`;
    const ext = d3.quantile(vals.map((d) => Math.abs(d.v)), 0.995) * 1.2;
    mount("f-hist", Plot.plot({
      width: W("f-hist"), height: 240, marginLeft: 40, style: PLOT_STYLE,
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
  };
  fsel.addEventListener("change", drawFactor);
  fsel.value = "g1";
  drawFactor();

  // variance shares by group
  const gsel = document.getElementById("g-select");
  const groups = [...new Set(M.series.map((s) => s.group))];
  groups.forEach((g) => gsel.append(el("option", { value: g }, g)));
  const keys = ["Activity", "Inflation", "Rate spreads", "Rate levels", "Own industry"];
  const colors = ["#4e79a7", "#edc948", "#76b7b2", "#9c755f", "#f28e2b"];
  document.getElementById("g-legend").innerHTML = keys.map((k, i) => `<span><i class="dot" style="background:${colors[i]}"></i>${k}</span>`).join("");
  const drawGroup = () => {
    const ss = M.series.filter((s) => s.group === gsel.value);
    const rows = ss.flatMap((s) => [
      ...GENERAL.map((g, i) => ({ name: s.name, id: s.id, key: keys[i], v: s.shares[g] || 0 })),
      { name: s.name, id: s.id, key: "Own industry", v: s.industry ? s.shares[s.industry] || 0 : 0 },
    ]);
    const order = ss.slice().sort((a, b) => b.total - a.total).map((s) => s.name);
    mount("g-bars", Plot.plot({
      width: W("g-bars"), height: 24 * ss.length + 40, marginLeft: 330, marginRight: 50, style: PLOT_STYLE,
      x: { domain: [0, 1], label: "share explained", tickFormat: "%", grid: true },
      y: { domain: order, label: null, tickFormat: (s) => (s.length > 52 ? `${s.slice(0, 50)}…` : s) },
      color: { domain: keys, range: colors },
      marks: [
        Plot.barX(rows, { x: "v", y: "name", fill: "key", order: keys, inset: 1.5, tip: true,
                          title: (r) => `${r.name} (${r.id})\n${r.key}: ${Math.round(r.v * 100)}%` }),
        Plot.text(ss, { x: "total", y: "name", text: (s) => `${Math.round(s.total * 100)}%`, dx: 4, textAnchor: "start", fill: col("ink-2") }),
      ],
    }));
  };
  gsel.addEventListener("change", drawGroup);
  gsel.value = groups.includes("Steel") ? "Steel" : groups[0];
  drawGroup();

  // correlation heatmap (lower triangle)
  const order = M.factors.map((f) => f.label);
  const cells = M.corr.map((c) => ({ a: label[c.a], b: label[c.b], r: c.r }));
  mount("corr", Plot.plot({
    width: Math.min(W("corr"), 720), height: Math.min(W("corr"), 720) * 0.86, marginLeft: 130, marginBottom: 90, style: PLOT_STYLE,
    x: { domain: order.slice(0, -1), label: null, tickRotate: -45 },
    y: { domain: order.slice(1), label: null },
    color: { type: "linear", domain: [-0.6, 0, 0.6], range: ["#e8833a", "#f2f3f5", "#2563c9"], clamp: true },
    marks: [
      Plot.cell(cells, { x: "b", y: "a", fill: "r", inset: 1, rx: 3, tip: true, title: (c) => `${c.a} and ${c.b}: ${fmt.n(c.r, 2)}` }),
      Plot.text(cells.filter((c) => Math.abs(c.r) >= 0.2), { x: "b", y: "a", text: (c) => c.r.toFixed(2).replace("0.", "."),
        fill: "#1a1d23", fontSize: 10 }),
    ],
  }));
}
