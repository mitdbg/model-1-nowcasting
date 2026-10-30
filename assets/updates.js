// The Updates page: every model-update log (data/updates.json), newest first; the latest one open.
document.addEventListener("DOMContentLoaded", async () => {
  const host = document.getElementById("updates");
  let logs;
  try { logs = await SITE.data("updates"); } catch (e) { showError("updates", e); return; }
  if (!logs.length) { host.innerHTML = `<p class="muted">No updates yet.</p>`; return; }
  host.replaceChildren(...logs.map((u, i) => {
    const title = (u.markdown.match(/^# (.*)$/m) || [, u.file])[1].replace(/^Model update /, "");
    // one-line summary: each quarter's nowcast change, from the log's Nowcasts table
    const moves = [...u.markdown.matchAll(/^\| (\d{4}Q\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)]
      .map((m) => `${m[1]}: ${m[2].trim() === "new" ? "new" : m[2].trim() + " → "}${m[3].trim()}`);
    const d = el("details", { class: "update" });
    if (i === 0) d.open = true;
    d.append(el("summary", { html: `<strong>${title}</strong><span class="muted"> · ${moves.join(" · ") || "no nowcast change"}</span>` }),
             el("div", { class: "update-body", html: marked.parse(u.markdown.replace(/^# .*\n/, "")) }));
    return d;
  }));
});
