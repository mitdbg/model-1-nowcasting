document.addEventListener("DOMContentLoaded", async () => {
  let rows;
  try { rows = await SITE.data("datasets"); } catch (e) { showError("tbl", e); return; }
  const kind = (r) => r.source.split(":")[0];
  const src = document.getElementById("f-src");
  [...new Set(rows.map((r) => r.source))].sort().forEach((s) => src.append(el("option", { value: s }, s)));
  const q = document.getElementById("q"), used = document.getElementById("f-used");

  const draw = () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const keep = rows.filter((r) => (!src.value || r.source === src.value)
      && (!used.value || r.used.some((u) => u.startsWith(used.value)))
      && words.every((w) => `${r.id} ${r.name} ${r.source}`.toLowerCase().includes(w)));
    document.getElementById("count").textContent = `${keep.length} of ${rows.length} series`;
    let html = `<thead><tr><th>ID</th><th>Series</th><th>Source group</th><th>Frequency</th><th>Enters as</th><th>Used in</th></tr></thead><tbody>`;
    for (const r of keep) {
      const id = r.fred ? `<a href="${r.fred}" target="_blank" rel="noopener"><code>${r.id}</code></a>` : `<code>${r.id}</code>`;
      html += `<tr><td>${id}</td><td>${r.name}</td><td><span class="tag">${kind(r)}</span> ${r.source.split(": ")[1] || ""}</td>
        <td>${r.freq}</td><td>${r.transform}</td><td>${r.used.map((u) => `<span class="tag">${u}</span>`).join("")}</td></tr>`;
    }
    document.getElementById("tbl").innerHTML = html + "</tbody>";
  };
  [q, src, used].forEach((x) => x.addEventListener("input", draw));
  draw();
});
