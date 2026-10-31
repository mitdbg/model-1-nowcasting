const PLOT_STYLE = { background: "transparent", fontSize: "12px" };

document.addEventListener("DOMContentLoaded", async () => {
  let A;
  try { A = await SITE.data("model1_accuracy"); } catch (e) { showError("ind-chart", e); return; }
  try { forecasts(A, await SITE.data("industry_forecasts")); } catch (e) { showError("fc-table", e); }
  overview(A);
  explorer(A);
  national(A);
});

const gain = (rel) => Math.round((1 - rel) * 1000) / 10;

function overview(A) {
  const state = { h: 0, block: "activity" };
  const sectors = Object.keys(A.labels);
  const draw = () => {
    const comparison = state.block === "prices" ? "S-t5 vs AR-t5" : "S vs AR";
    const rows = A.sectors.filter((r) => r.sector !== "economy" && r.horizon === state.h && r.span === "real-time"
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
      "Tested only from the date when every series of the industry has an archive of its past releases (2010–2017, by industry), " +
      "so each forecast uses the data as they were first published. Diamonds: the difference from the AR is significant at 10%. " +
      (state.block === "prices" ? "Price targets use the plain growth rate for both the model and the AR." : "");
  };
  const hSet = segmented(document.getElementById("ind-h"), (v) => { state.h = +v; draw(); });
  segmented(document.getElementById("ind-block"), (v) => { state.block = v; draw(); });
  document.querySelector('#ind-block button[value="activity"]').setAttribute("aria-pressed", "true");
  state.block = "activity"; hSet("0");
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
    let html = `<thead><tr><th>Target</th><th>Model</th>${H.map((h) => `<th class="num">h = ${h}</th>`).join("")}</tr></thead><tbody>`;
    for (const t of targets) {
      const r0 = own.find((r) => r.target === t);
      const isPrice = r0.block === "prices";
      const cmp = isPrice ? "S-t5 vs AR-t5" : "S vs AR";
      const lines = [["Industry model", own, "real-time", cmp]];
      if (!isPrice && econ.some((r) => r.target === t)) lines.push([`Economy model <span class="muted small">· tested from ${econ[0].real_from}</span>`, econ, "real-time", "S vs AR"]);
      const has = (l) => H.some((h) => { const x = cell(l[1], t, h, l[2], l[3]); return x && x.rel != null; });
      lines.splice(0, lines.length, ...lines.filter(has));
      if (!lines.length) continue;
      lines.forEach(([label, rows, span, c], i) => {
        html += `<tr>${i === 0 ? `<td rowspan="${lines.length}"><strong>${r0.name}</strong><br><span class="muted small">${t} · ${r0.block}${r0.real_from ? ` · tested from ${r0.real_from}` : ""}</span></td>` : ""}
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

const MONTH = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

// A forecast in reporting units: % change from the latest value, or the level (capacity utilization)
const fcValue = (x, unit) => x == null || x.value == null ? "–"
  : unit === "level" ? x.value.toFixed(1) : `${fmt.signed(Math.round(x.value * 10) / 10 || 0, 1)}${unit === "cum" ? "%" : ""}`;

function sparkline(row) {
  const w = 150, h = 36, pad = 3;
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

function forecasts(A, F) {
  const H = [0, 1, 3, 6, 12];
  const record = (r) => {
    const x = A.sectors.find((a) => a.sector === r.sector && a.target === r.target && a.horizon === 0
      && a.span === "real-time" && a.comparison === r.comparison);
    return x && x.rel != null ? gain(x.rel) : null;
  };
  const rows = F.rows.map((r) => ({ ...r, label: A.labels[r.sector], record: record(r) }));
  const state = { sort: "industry", block: "all" };
  const order = Object.keys(A.labels);
  document.getElementById("fc-intro").innerHTML =
    `What each industry model predicts for every series it targets, next to the <strong>AR benchmark</strong>, a forecast
    from the series' own past. Forecasts use the data published by the end of ${MONTH(F.vintage)}. Numbers are the
    % change from the latest published value (capacity utilization: the rate itself, in %); <strong>0</strong> is the first
    month not yet published, and 1, 3, 6 and 12 are months after that. Prices are forecast as plain growth rates, as in
    the price scores below.`;
  const draw = () => {
    let list = rows.filter((r) => state.block === "all" || r.block === state.block);
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (state.sort === "industry") list.sort((a, b) => order.indexOf(a.sector) - order.indexOf(b.sector) || (a.block > b.block ? 1 : a.block < b.block ? -1 : 0) || byName(a, b));
    if (state.sort === "name") list.sort(byName);
    if (state.sort === "record") list.sort((a, b) => (b.record ?? -1e9) - (a.record ?? -1e9));
    const th = (k, label, cls = "") => `<th class="sortable ${cls}" data-sort="${k}">${label}${state.sort === k ? " ▾" : ""}</th>`;
    let html = `<thead><tr>${th("name", "Series")}<th>History and forecast</th><th class="num">Latest</th>
      ${H.map((h) => `<th class="num">${h === 0 ? "0 (now)" : h}</th>`).join("")}${th("record", "Track<br>record", "num")}</tr></thead><tbody>`;
    let group = null;
    for (const r of list) {
      if (state.sort === "industry" && r.label !== group) {
        group = r.label;
        html += `<tr class="group"><td colspan="${H.length + 4}">${group}</td></tr>`;
      }
      const cells = H.map((h) => {
        const m = (r.model || []).find((x) => x.h === h), a = (r.ar || []).find((x) => x.h === h);
        const tip = m ? `${MONTH(m.month)}: model ${fcValue(m, r.unit)}` + (m.lo != null ? ` (68% range ${fcValue({ value: m.lo }, r.unit)} to ${fcValue({ value: m.hi }, r.unit)})` : "") + `, AR ${fcValue(a, r.unit)}` : "";
        return `<td class="num" title="${tip}"><span class="val">${fcValue(m, r.unit)}</span><span class="ar">AR ${fcValue(a, r.unit)}</span></td>`;
      }).join("");
      const g = r.record, cls = g == null ? "muted" : g >= 2 ? "good" : g <= -2 ? "bad" : "";
      html += `<tr><td><strong>${r.name}</strong><br><span class="muted small">${r.fred ? `<a href="${r.fred}" target="_blank" rel="noopener">${r.target}</a>` : r.target} · ${state.sort === "industry" ? "" : `${r.label} · `}${r.block}</span></td>
        <td>${sparkline(r)}</td><td class="num small">${MONTH(r.last_month)}</td>${cells}
        <td class="num ${cls}" title="Errors as a nowcast, relative to the AR's, on data as first published">${g == null ? "–" : `${g > 0 ? "+" : ""}${g.toFixed(0)}%`}</td></tr>`;
    }
    const t = document.getElementById("fc-table");
    t.innerHTML = html + "</tbody>";
    t.querySelectorAll("th.sortable").forEach((h) => h.addEventListener("click", () => setSort(h.dataset.sort)));
  };
  const setSort = segmented(document.getElementById("fc-sort"), (v) => { state.sort = v; draw(); });
  segmented(document.getElementById("fc-block"), (v) => { state.block = v; draw(); })("all");
  setSort("industry");
  document.getElementById("fc-note").innerHTML =
    `<span class="fc-key"><i style="border-color:${col("ink-2")}"></i>published data, last 3 years</span>` +
    `<span class="fc-key"><i style="border-color:${col("accent")}"></i>industry model (shaded: 68% range)</span>` +
    `<span class="fc-key"><i style="border-color:${col("ink-3")};border-top-style:dashed"></i>AR benchmark</span><br>` +
    `Track record: how much smaller the model's errors have been than the AR's as a nowcast (month 0), on data as first
    published; see <a href="#industries">Industry by industry</a>. Hover a forecast for its month and range, or a sparkline for the latest value.`;
}
