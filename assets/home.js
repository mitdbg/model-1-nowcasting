document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { quarters } = await SITE.data("nowcast");
    const q = quarters.at(-1);
    const pts = q.dates.map((d, i) => ({ date: new Date(`${d}T12:00:00`), v: q.nowcast[i] }));
    const last = pts.at(-1);

    document.getElementById("stat-now").textContent = `${fmt.signed(last.v, 1)}%`;
    document.getElementById("stat-now-label").textContent =
      `GDP growth nowcast for ${q.q}, annual rate (as of ${fmt.date(q.dates.at(-1))})`;
    document.getElementById("now-title").textContent =
      `${q.q}: the nowcast moved from ${fmt.n(pts[0].v, 1)}% to ${fmt.n(last.v, 1)}%`;

    const marks = [
      Plot.ruleY([0], { stroke: col("line") }),
      Plot.lineY(pts, { x: "date", y: "v", stroke: col("accent"), strokeWidth: 2 }),
      Plot.dot(pts, { x: "date", y: "v", fill: col("accent"), r: 3.5, tip: true,
                      title: (d) => `${fmt.date(d.date.toISOString().slice(0, 10))}: ${fmt.n(d.v, 2)}%` }),
      Plot.text([last], { x: "date", y: "v", text: (d) => `${fmt.n(d.v, 1)}%`, dx: 10, textAnchor: "start",
                          fill: col("ink"), fontWeight: 600 }),
    ];
    if (q.advance != null) {
      marks.push(Plot.ruleY([q.advance], { stroke: col("truth"), strokeDasharray: "4 3" }),
                 Plot.text([q.advance], { y: (d) => d, x: pts[0].date, text: () => `BEA first estimate ${fmt.n(q.advance, 1)}%`,
                                          dy: -7, textAnchor: "start", fill: col("ink-2") }));
    }
    mount("now-chart", Plot.plot({
      width: W("now-chart"), height: 280, marginRight: 50, style: { background: "transparent", fontSize: "12px" },
      x: { type: "time", label: null },
      y: { label: "%", grid: true, domain: [Math.min(0, ...pts.map((d) => d.v)) - 0.5, Math.max(...pts.map((d) => d.v)) + 0.7] },
      marks,
    }));
    document.getElementById("now-caption").textContent = q.advance == null
      ? `BEA had not yet published its first estimate for ${q.q} at the last update. See the GDP nowcast page for every past quarter.`
      : `BEA's first estimate for ${q.q} (dashed line) was ${fmt.n(q.advance, 1)}%.`;
  } catch (e) { showError("now-chart", e); }
});
