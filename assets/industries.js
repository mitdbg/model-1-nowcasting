const PLOT_STYLE = { background: "transparent", fontSize: "12px" };

document.addEventListener("DOMContentLoaded", async () => {
  let A;
  try { A = await SITE.data("model1_accuracy"); } catch (e) { showError("ind-chart", e); return; }
  try { forecasts(A, await SITE.data("industry_forecasts")); } catch (e) { showError("fc-table", e); }
  overview(A);
  try { pages(await SITE.data("models")); } catch (e) { showError("ind-pages", e); }
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

function pages(M) {
  const ind = M.production.filter((x) => x.kind === "industry");
  const link = (x) => `<a href="${x.page}">${x.name}</a>`;
  document.getElementById("ind-pages").innerHTML = `<thead><tr><th>Industry</th><th>Activity</th><th>Prices</th></tr></thead><tbody>` +
    Object.entries(M.industries).map(([sec, I]) => `<tr><td>${I.label}</td>` +
      ["activity", "prices"].map((b) => `<td>${link(ind.find((x) => x.sector === sec && x.block === b))}</td>`).join("") + "</tr>").join("") + "</tbody>";
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

function forecasts(A, F) {
  const rows = F.rows.map((r) => ({ ...r, label: A.labels[r.sector], record: fcRecord(A, r) }));
  const state = { sort: "industry", block: "all" };
  const order = Object.keys(A.labels);
  const model = (r) => `IND-${r.sector.toUpperCase()}${r.block === "prices" ? "-P5" : ""}`;
  document.getElementById("fc-intro").innerHTML =
    `What each industry model predicts for every series it targets, next to the <strong>AR benchmark</strong>, a forecast
    from the series' own past. Forecasts use the data published by the end of ${MONTH(F.vintage)}. Numbers are the
    % change from the latest published value (capacity utilization: the rate itself, in %); <strong>0</strong> is the first
    month not yet published, and 1, 3, 6 and 12 are months after that. Prices are forecast as plain growth rates, as in
    the price scores below. The model's name under each series links to its page.`;
  const draw = () => {
    let list = rows.filter((r) => state.block === "all" || r.block === state.block);
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (state.sort === "industry") list.sort((a, b) => order.indexOf(a.sector) - order.indexOf(b.sector) || (a.block > b.block ? 1 : a.block < b.block ? -1 : 0) || byName(a, b));
    if (state.sort === "name") list.sort(byName);
    if (state.sort === "record") list.sort((a, b) => (b.record ?? -1e9) - (a.record ?? -1e9));
    const th = (k, label, cls = "") => `<th class="sortable ${cls}" data-sort="${k}">${label}${state.sort === k ? " ▾" : ""}</th>`;
    let html = fcHead(th("name", "Series"), th("record", "Track<br>record", "num")) + "<tbody>";
    let group = null;
    for (const r of list) {
      if (state.sort === "industry" && r.label !== group) {
        group = r.label;
        html += `<tr class="group"><td colspan="${FC_H.length + 4}">${group}</td></tr>`;
      }
      const name = `<a href="model.html?m=${model(r)}">${model(r)}</a>`;
      html += fcRow(r, state.sort === "industry" ? name : `${r.label} · ${name}`);
    }
    const t = document.getElementById("fc-table");
    t.innerHTML = html + "</tbody>";
    t.querySelectorAll("th.sortable").forEach((h) => h.addEventListener("click", () => setSort(h.dataset.sort)));
  };
  const setSort = segmented(document.getElementById("fc-sort"), (v) => { state.sort = v; draw(); });
  segmented(document.getElementById("fc-block"), (v) => { state.block = v; draw(); })("all");
  setSort("industry");
  document.getElementById("fc-note").innerHTML = fcKey() + `<br>
    Track record: how much smaller the model's errors have been than the AR's as a nowcast (month 0), on data as first
    published; see <a href="#industries">Industry by industry</a>. Hover a forecast for its month and range, or a sparkline for the latest value.`;
}
