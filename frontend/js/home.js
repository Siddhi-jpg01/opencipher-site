/* =========================================================
   home.js — the home page: black hole, project input, the journey in.
   ========================================================= */
(function () {
  const { $, $$, esc, icon } = OC.ui;

  /* black hole sits to the right on wide screens, centred on phones */
  const hole = OC.blackHole($("#bh"), { shift: (ratio) => (ratio > 1.15 ? Math.min(0.55, (ratio - 1) * 0.6) : 0) });
  window.__freeze = hole.stop;   // used by automated screenshots

  /* ---------- preferences ---------- */
  function drawLevels() {
    const lvl = OC.store.level.get();
    $$("#levels .chip").forEach((b) => b.setAttribute("aria-checked", b.dataset.level === lvl));
  }
  $$("#levels .chip").forEach((b) => b.addEventListener("click", () => { OC.store.level.set(b.dataset.level); drawLevels(); }));
  drawLevels();

  const picked = new Set(OC.store.toolkit.get());
  OC.SKILLS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = s.label;
    b.setAttribute("aria-pressed", picked.has(s.id));
    b.addEventListener("click", () => {
      picked.has(s.id) ? picked.delete(s.id) : picked.add(s.id);
      b.setAttribute("aria-pressed", picked.has(s.id));
      OC.store.toolkit.set([...picked]);
    });
    $("#skills").appendChild(b);
  });

  /* ---------- is the AI model ready? ---------- */
  const status = $("#status");
  const setStatus = (cls, html) => { status.className = "status " + cls; status.innerHTML = '<span class="dot"></span><span>' + html + "</span>"; };
  OC.api.health().then((h) => {
    if (h.ai.reachable) setStatus("ok", esc(h.model) + " is ready");
    else setStatus("warn", "The AI model is off, so guides will use the project's files only. " + esc(h.ai.detail || ""));
  }).catch(() => setStatus("down", 'The server isn\'t running yet. You can still <a href="dashboard.html?id=sample">see an example</a>.'));

  /* ---------- recently opened ---------- */
  function drawRecent(list) {
    if (!list.length) return;
    $("#recent").hidden = false;
    $("#recent-list").innerHTML = list.slice(0, 4).map((r) => '<a class="glass" href="dashboard.html?id=' + encodeURIComponent(r.id) + '"><strong>' + esc(r.full_name) + "</strong><span>" + esc(r.one_liner) + "</span></a>").join("");
  }
  const local = OC.store.guides.recent();
  drawRecent(local);
  OC.api.recent().then((srv) => { const seen = new Set(local.map((r) => r.id)); drawRecent(local.concat(srv.filter((r) => !seen.has(r.id)))); }).catch(() => {});

  /* ---------- input ---------- */
  const input = $("#repo"), err = $("#err"), go = $("#go");
  function parseRepo(v) {
    const s = (v || "").trim().replace(/^https?:\/\//, "").replace(/^(www\.)?github\.com\//, "").split(/[?#]/)[0].replace(/\/+$/, "");
    const parts = s.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const name = parts[1].replace(/\.git$/, ""), ok = /^[A-Za-z0-9_.-]+$/;
    return ok.test(parts[0]) && ok.test(name) ? parts[0] + "/" + name : null;
  }
  input.addEventListener("input", () => {
    err.textContent = "";
    if (/github\.com\//i.test(input.value)) { const r = parseRepo(input.value); if (r) input.value = r; }
  });
  $$(".try button").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.repo; input.focus(); }));

  /* ---------- the journey in ---------- */
  const STEPS = [
    ["meta", "Finding the project on GitHub"],
    ["readme", "Reading its front page (the README)"],
    ["tree", "Mapping its folders and files"],
    ["deps", "Checking what it needs to run"],
    ["contributing", "Reading the rules for contributors"],
    ["issues", "Looking for tasks you could take on"],
    ["ai_overview", "Explaining it in plain English"],
    ["ai_map", "Matching tasks to what you know"],
    ["ai_practice", "Building your practice game"],
    ["save", "Saving your guide"]
  ];
  let clock;
  function journeyStart(repo) {
    $("#hero-text").hidden = true;
    $("#journey").hidden = false;
    $("#journey").classList.remove("failed");
    $("#j-actions").innerHTML = "";
    $("#j-repo").textContent = repo;
    const t0 = Date.now();
    clearInterval(clock);
    clock = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      $("#j-time").textContent = s < 20 ? "" : "Running for " + (s < 60 ? s + " seconds" : Math.floor(s / 60) + " min " + (s % 60) + " s") + ". The AI part can take a minute or two on a laptop.";
    }, 1000);
    draw({ stage: "meta", done: [] });
  }
  function draw(job) {
    const done = new Set(job.done || []);
    const finished = job.status === "done";
    $("#j-list").innerHTML = STEPS.map(([k, label]) => {
      const skip = job.ai === false && k.startsWith("ai_");
      const cls = finished || done.has(k) ? (skip ? "skip" : "done") : k === job.stage ? "now" : skip ? "skip" : "";
      return '<li class="' + cls + '"><span class="mark">' + (cls === "done" ? icon("check") : "") + "</span>" + esc(label) + (skip ? " (AI model is off)" : "") + "</li>";
    }).join("");
    const current = STEPS.find(([k]) => k === job.stage);
    $("#j-now").textContent = finished ? "Your guide is ready." : (current ? current[1] : "Reading the project") + "…";
    const frac = finished ? 1 : (done.size + 0.5) / STEPS.length;
    $("#j-bar").style.width = Math.round(frac * 100) + "%";
    hole.setZoom(Math.min(0.92, frac * 0.85));           // drift towards the black hole as we go
  }
  function fail(msg, offline) {
    clearInterval(clock);
    hole.setZoom(0);
    $("#journey").classList.add("failed");
    $("#j-now").textContent = msg;
    $("#j-actions").innerHTML = '<button type="button" class="btn-ghost" id="back">Try another project</button>' +
      (offline ? '<a class="btn" href="dashboard.html?id=sample">See an example instead</a>' : "");
    $("#back").addEventListener("click", () => { $("#journey").hidden = true; $("#hero-text").hidden = false; go.disabled = false; input.focus(); });
  }
  async function open(id) {
    const g = await OC.api.guide(id);
    OC.store.guides.put(g);
    hole.setZoom(1);
    setTimeout(() => { location.href = "dashboard.html?id=" + encodeURIComponent(g.id); }, 900);
  }
  async function run(repo, refresh) {
    go.disabled = true;
    journeyStart(repo);
    try {
      const res = await OC.api.analyze(repo, OC.store.level.get(), refresh);
      if (res.status === "done") { draw({ status: "done" }); return await open(res.guide_id); }
      while (true) {
        await new Promise((r) => setTimeout(r, 1200));
        const job = await OC.api.job(res.job_id);
        draw(job);
        if (job.status === "done") { clearInterval(clock); return await open(job.guide_id); }
        if (job.status === "error") throw new Error(job.error);
      }
    } catch (e) {
      fail(e.message, e.offline);
    }
  }

  $("#ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const repo = parseRepo(input.value);
    if (!repo) { err.textContent = "Type it as owner/project, for example pallets/flask."; input.focus(); return; }
    input.value = repo;
    run(repo, false);
  });

  // "Make it again with AI" links arrive as index.html?repo=owner/name&refresh=1
  const pre = parseRepo(OC.ui.param("repo") || "");
  if (pre) { input.value = pre; run(pre, OC.ui.param("refresh") === "1"); }
})();
