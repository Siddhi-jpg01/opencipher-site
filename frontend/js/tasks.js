/* =========================================================
   tasks.js — Step 3: Pick a task (recommended issue, checklist, other issues).
   ========================================================= */
OC.ui.boot("tasks", function (g, main) {
  const { $, $$, esc, icon, decorate } = OC.ui;
  const used = new Set(), dec = (t) => decorate(t, g.glossary, used);
  document.title = g.repo.full_name + " — Pick a task";
  const XP_STEP = 10;
  const fc = g.first_contribution || {};
  const rec = (g.issues || []).find((i) => i.number === fc.issue_number) || {};
  const branch = "fix/" + String(fc.title || "my-first-change").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  const testCmd = ((g.setup_steps || []).find((s) => /test/i.test(s.title)) || {}).command;
  const files = (rec.related_files || []).map((f) => "<code>" + esc(f) + "</code>").join(" ");

  const STEPS = [
    ["claim", "Tell the project you're on it", fc.issue_number ? "Leave a comment on issue #" + esc(fc.issue_number) + ", something like \"Hi, I'd like to work on this.\" That way no one else starts the same thing." : "Open a new issue describing the small improvement you'd like to make."],
    ["setup", "Get the project running", 'Follow <a href="setup.html?id=' + encodeURIComponent(g.id) + '">step 2</a> until everything installs and runs.'],
    ["branch", "Make your own branch", "A branch keeps your work separate. Run <code>git checkout -b " + esc(branch) + "</code>"],
    ["change", "Make the change", files ? "You'll mostly be working in " + files + ". Keep it small." : "Keep the change small and focused on the task."],
    ["test", "Check you didn't break anything", testCmd ? "Run <code>" + esc(testCmd.split("\n")[0]) + "</code> and make sure everything passes." : "Try the project yourself to check it still works."],
    ["push", "Save and upload your work", "Run <code>git commit -am \"Describe your change\"</code> and then <code>git push origin " + esc(branch) + "</code>"],
    ["pr", "Open a pull request", "On GitHub, click \"Compare & pull request\"." + (fc.issue_number ? " In the description, write <code>Fixes #" + esc(fc.issue_number) + "</code> so the issue is linked." : "")]
  ];

  main.innerHTML = OC.ui.aiNotice(g) +
    '<header class="intro"><span class="step-of">Step 3 of 4</span>' +
      '<h1 class="title">Pick your first task</h1>' +
      '<p class="lead">We picked one small, real task that suits a beginner. Below it is every step from start to finished pull request. Tick them off as you go.</p>' +
    "</header>" +

    '<section class="glass picked"><p class="label">We suggest starting here</p>' +
      "<h2>" + (fc.issue_number ? '<span class="num">#' + esc(fc.issue_number) + "</span> " : "") + esc(fc.title) + "</h2>" +
      "<p>" + dec(fc.why) + (rec.explanation ? " " + dec(rec.explanation) : "") + "</p>" +
      '<div class="row">' + (rec.url ? '<a class="btn" href="' + esc(rec.url) + '" target="_blank" rel="noopener">Open the task on GitHub</a>' : "") +
        (rec.estimated_time ? '<span class="tag">' + icon("clock") + "About " + esc(rec.estimated_time) + "</span>" : "") +
        (rec.difficulty ? '<span class="tag ' + (rec.difficulty === "easy" ? "ok" : "warn") + '">' + esc(cap(rec.difficulty)) + "</span>" : "") + "</div>" +
    "</section>" +

    '<section class="block"><h2 class="h2">Your path to a pull request</h2><p class="sub">Seven steps. You earn ' + XP_STEP + " XP for each one, and the Ship it badge when you finish.</p>" +
      '<div class="progress-line"><div class="bar"><span id="bar"></span></div><span id="count"></span></div>' +
      '<ol class="pr-path" id="path"></ol><div id="done"></div>' +
    "</section>" +

    '<section class="block"><h2 class="h2">Other open tasks</h2><p class="sub">Tell us what you know and we\'ll put the best matches first.</p>' +
      '<div class="know"><span>I know</span><div class="chips" id="know"></div></div>' +
      '<ul class="tasks" id="tasks"></ul>' +
    "</section>" +

    ((g.contributing_rules || []).length ? '<section class="block"><h2 class="h2">The project\'s rules</h2><p class="sub">The short version of the project\'s CONTRIBUTING file. Follow these and your pull request is far more likely to be accepted.</p>' +
      '<ul class="rules">' + g.contributing_rules.map((x) => "<li>" + icon("check") + "<span>" + dec(x) + "</span></li>").join("") + "</ul></section>" : "") +

    OC.ui.nextBlock(g, "tasks");

  /* ---------- checklist ---------- */
  function drawPath() {
    const p = OC.store.progress(g.id);
    $("#path").innerHTML = STEPS.map((s, i) =>
      '<li><label><input type="checkbox" data-step="' + s[0] + '"' + (p.checks[s[0]] ? " checked" : "") + '><span class="box"><span class="n">' + (i + 1) + "</span>" + icon("check") + "</span>" +
      '<span><span class="t">' + esc(s[1]) + '</span><span class="d">' + s[2] + "</span></span></label></li>").join("");
    const n = STEPS.filter((s) => p.checks[s[0]]).length;
    $("#bar").style.width = (n / STEPS.length) * 100 + "%";
    $("#count").textContent = n + " of " + STEPS.length + " done";
    if (n === STEPS.length) OC.store.badge(g.id, "shipper", "Ship it");
    $("#done").innerHTML = n === STEPS.length ? '<p class="pr-path-done">You did it. Your pull request is with the project now. Keep an eye on GitHub for comments from the maintainers.</p>' : "";
    $$("#path input").forEach((box) => box.addEventListener("change", () => {
      const q = OC.store.progress(g.id);
      q.checks[box.dataset.step] = box.checked;
      OC.store.saveProgress(g.id, q);
      if (box.checked) { const got = OC.store.award(g.id, "step:" + box.dataset.step, XP_STEP); if (got) OC.ui.toast("+" + got + " XP. Nice."); }
      drawPath();
    }));
  }
  drawPath();

  /* ---------- other tasks, ranked by what the learner knows ---------- */
  const kit = new Set(OC.store.toolkit.get());
  OC.SKILLS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = s.label;
    b.setAttribute("aria-pressed", kit.has(s.id));
    b.addEventListener("click", () => {
      kit.has(s.id) ? kit.delete(s.id) : kit.add(s.id);
      b.setAttribute("aria-pressed", kit.has(s.id));
      OC.store.toolkit.set([...kit]);
      drawTasks();
    });
    $("#know").appendChild(b);
  });
  function drawTasks() {
    const name = (id) => (OC.SKILLS.find((s) => s.id === id) || { label: id }).label;
    const rank = { easy: 0, medium: 1, hard: 2 };
    const list = (g.issues || []).map((it) => {
      const sk = it.skills || [];
      const fit = kit.size && sk.length ? Math.round(sk.filter((s) => kit.has(s)).length / sk.length * 100) : null;
      return { it, fit };
    }).sort((a, b) => ((b.fit || 0) - (a.fit || 0)) || ((rank[a.it.difficulty] ?? 1) - (rank[b.it.difficulty] ?? 1)));
    if (!list.length) { $("#tasks").innerHTML = '<li class="muted">There are no open tasks right now. The suggested task above is a great place to start.</li>'; return; }
    $("#tasks").innerHTML = list.map(({ it, fit }) => {
      const verdict = fit === null ? "Pick what you know" : fit >= 100 ? "Great match" : fit >= 50 ? "Good match" : fit > 0 ? "A stretch" : "New for you";
      return '<li class="glass task' + (it.number === fc.issue_number ? " rec" : "") + '"><div class="match"><div class="match-num' + (fit ? "" : " none") + '">' + (fit === null ? "?" : fit + "%") + "</div><small>" + verdict + "</small></div><div>" +
        '<div class="task-top">' + (it.number === fc.issue_number ? '<span class="tag gold">' + icon("spark") + "Suggested</span>" : "") +
          '<span class="tag ' + (it.difficulty === "easy" ? "ok" : it.difficulty === "hard" ? "warn" : "") + '">' + esc(cap(it.difficulty || "medium")) + "</span>" +
          (it.estimated_time ? '<span class="tag">' + icon("clock") + esc(it.estimated_time) + "</span>" : "") +
          (it.skills || []).map((s) => '<span class="tag' + (kit.has(s) ? " gold" : "") + '">' + esc(name(s)) + "</span>").join("") + "</div>" +
        '<h3><a href="' + esc(it.url) + '" target="_blank" rel="noopener"><span class="num">#' + esc(it.number) + "</span>" + esc(it.title) + "</a></h3>" +
        "<p>" + esc(it.explanation) + "</p>" +
        ((it.related_files || []).length ? '<p class="files">Start in ' + it.related_files.map((f) => '<span class="file">' + esc(f) + "</span>").join("") + "</p>" : "") +
        "</div></li>";
    }).join("");
  }
  drawTasks();
  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
});
