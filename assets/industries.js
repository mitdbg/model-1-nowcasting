const PLOT_STYLE = { background: "transparent", fontSize: "12px" };

document.addEventListener("DOMContentLoaded", async () => {
  let A;
  try { A = await SITE.data("model1_accuracy"); } catch (e) { showError("ind-chart", e); return; }
  overview(A);
  explorer(A);
  national(A);
});

const gain = (rel) => Math.round((1 - rel) * 1000) / 10;

function overview(A) {
  const state = { h: 0, span: "real-time", block: "activity" };
  const sectors = Object.keys(A.labels);
  const draw = () => {
    const comparison = state.block === "prices" ? "S-t5 vs AR-t5" : "S vs AR";
    const rows = A.sectors.filter((r) => r.sector !== "economy" && r.horizon === state.h && r.span === state.span
      && r.comparison === comparison && (state.block === "prices" ? r.block === "prices" : r.block !== "prices"))
      .map((r) => ({ ...r, label: A.labels[r.sector], g: gain(r.rel) }));
    const better = rows.filter((r) => r.g > 0).length;
    document.getElementById("ind-title").textContent =
      `The industry model beats the AR on ${better} of ${rows.length} ${state.block} targets ${state.h === 0 ? "as a nowcast" : `${state.h} month${state.h > 1 ? "s" : ""} ahead`}`;
    const ext = Math.max(10, d3.max(rows, (r) => Math.abs(r.g)) + 4);
    mount("ind-chart", Plot.plot({
      width: W("ind-chart"), height: 440, marginLeft: 130, marginRight: 30, style: PLOT_STYLE,
      x: { domain: [-Math.min(ext, 60), Math.min(ext, 60)], label: null, grid: true,
           tickFormat: (v) => `${v > 0 ? "+" : ""}${v}%` },
      y: { domain: sectors.map((s) => A.labels[s]), label: null },
      marks: [
        Plot.ruleX([0], { stroke: col("ink-3") }),
        Plot.dot(rows, { x: (r) => Math.max(-60, Math.min(60, r.g)), y: "label", r: 6, fillOpacity: 0.85,
          fill: (r) => (r.g >= 0 ? col("good") : col("bad")), stroke: col("bg"), strokeWidth: 1.5,
          symbol: (r) => (r.p != null && r.p < 0.1 ? "diamond" : "circle"), tip: true,
          title: (r) => `${r.label}: ${r.name} (${r.target})\n${fmt.gain(r.rel)} than the AR (relative error ${fmt.n(r.rel, 3)})\np-value ${fmt.n(r.p, 2)}` }),
      ],
    }));
    document.getElementById("ind-caption").textContent =
      (state.span === "real-time" ? "Only forecast dates from when every series of the industry has an archive of its past releases. "
        : "All forecast dates, 2000–2026; before an industry's archives begin, its data are pseudo-real-time. ") +
      "Diamonds: the difference from the AR is significant at 10%. " +
      (state.block === "prices" ? "Price targets use the plain growth rate for both the model and the AR." : "");
  };
  const hSet = segmented(document.getElementById("ind-h"), (v) => { state.h = +v; draw(); });
  const sSet = segmented(document.getElementById("ind-span"), (v) => { state.span = v; draw(); });
  segmented(document.getElementById("ind-block"), (v) => { state.block = v; draw(); });
  document.querySelector('#ind-block button[value="activity"]').setAttribute("aria-pressed", "true");
  state.block = "activity"; sSet("real-time"); hSet("0");
}

function explorer(A) {
  const sel = document.getElementById("ind-select");
  Object.entries(A.labels).forEach(([k, v]) => sel.append(el("option", { value: k }, v)));
  const H = [0, 1, 3, 6];
  const draw = () => {
    const s = sel.value;
    const own = A.sectors.filter((r) => r.sector === s);
    const econ = A.sectors.filter((r) => r.sector === "economy" && r.block === s);
    const targets = [...new Set(own.map((r) => r.target))];
    const cell = (rows, t, h, span, cmp) => rows.find((r) => r.target === t && r.horizon === h && r.span === span && r.comparison === cmp);
    const td = (x) => {
      if (!x || x.rel == null) return `<td class="num muted">–</td>`;
      const g = gain(x.rel), cls = g >= 2 ? "good" : g <= -2 ? "bad" : "";
      return `<td class="num ${cls}" title="relative error ${fmt.n(x.rel, 3)}, p ${fmt.n(x.p, 2)}">${g > 0 ? "+" : ""}${g.toFixed(0)}%${x.p != null && x.p < 0.1 ? "*" : ""}</td>`;
    };
    let html = `<thead><tr><th>Target</th><th>Model and test</th>${H.map((h) => `<th class="num">h = ${h}</th>`).join("")}</tr></thead><tbody>`;
    for (const t of targets) {
      const r0 = own.find((r) => r.target === t);
      const isPrice = r0.block === "prices";
      const cmp = isPrice ? "S-t5 vs AR-t5" : "S vs AR";
      const lines = [["Industry model, real-time data", own, "real-time", cmp], ["Industry model, 2000–2026", own, "all", cmp]];
      if (!isPrice && econ.some((r) => r.target === t)) lines.push(["Economy model, 2000–2026", econ, "all", "S vs AR"]);
      const has = (l) => H.some((h) => { const x = cell(l[1], t, h, l[2], l[3]); return x && x.rel != null; });
      lines.splice(0, lines.length, ...lines.filter(has));
      if (!lines.length) continue;
      lines.forEach(([label, rows, span, c], i) => {
        html += `<tr>${i === 0 ? `<td rowspan="${lines.length}"><strong>${r0.name}</strong><br><span class="muted small">${t} · ${r0.block}${r0.real_from ? ` · real-time from ${r0.real_from}` : ""}</span></td>` : ""}
          <td>${label}</td>${H.map((h) => td(cell(rows, t, h, span, c))).join("")}</tr>`;
      });
    }
    document.getElementById("ind-table").innerHTML = html + "</tbody>";
    document.getElementById("ind-table-note").textContent =
      "Percent better (+) or worse (−) than the AR benchmark; * significant at 10% (Diebold–Mariano). Hover a cell for the exact relative error and p-value. " +
      "Price targets compare both models on plain growth rates.";
  };
  sel.addEventListener("change", draw);
  sel.value = "trade";
  draw();
}

function national(A) {
  const state = { truth: "truth_latest", sub: "full" };
  const models = [["G", "General model"], ["G+AR", "General + AR"], ["Economy", "Economy model"], ["Economy+AR", "Economy + AR"], ["DI", "Diffusion index (DI)"]];
  const H = [0, 1, 3, 6, 12];
  const draw = () => {
    let html = `<thead><tr><th>Indicator</th><th>Model</th>${H.map((h) => `<th class="num">h = ${h}</th>`).join("")}</tr></thead><tbody>`;
    for (const [t, name] of Object.entries(A.national_names)) {
      models.forEach(([m, label], i) => {
        html += `<tr>${i === 0 ? `<td rowspan="${models.length}"><strong>${name}</strong><br><span class="muted small">${t}</span></td>` : ""}<td>${label}</td>`;
        for (const h of H) {
          const x = A.national.find((r) => r.target === t && r.model === m && r.horizon === h && r.span === state.sub && r.truth === state.truth);
          if (!x || x.rel == null) { html += `<td class="num muted">–</td>`; continue; }
          const cls = x.rel <= 0.98 ? "good" : x.rel >= 1.02 ? "bad" : "";
          html += `<td class="num ${cls}" title="p ${fmt.n(x.p, 2)}, ${x.n} forecasts">${fmt.n(x.rel, 2)}</td>`;
        }
        html += "</tr>";
      });
    }
    document.getElementById("nat-table").innerHTML = html + "</tbody>";
  };
  segmented(document.getElementById("nat-truth"), (v) => { state.truth = v; draw(); })("truth_latest");
  segmented(document.getElementById("nat-sub"), (v) => { state.sub = v; draw(); })("full");
}
