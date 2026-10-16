/* =========================================================
   setup.js — Step 2: Set it up.
   ========================================================= */
OC.ui.boot("setup", function (g, main) {
  const { $$, esc, decorate } = OC.ui;
  const used = new Set(), dec = (t) => decorate(t, g.glossary, used);
  document.title = g.repo.full_name + " — Set it up";
  const steps = g.setup_steps || [];

  main.innerHTML = OC.ui.aiNotice(g) +
    '<header class="intro"><span class="step-of">Step 2 of 4</span>' +
      '<h1 class="title">Get it running on your computer</h1>' +
      '<p class="lead">First install the tools below. Then open a terminal and run each command in order. Use the Copy button so you don\'t make typos.</p>' +
    "</header>" +

    '<section class="block"><h2 class="h2">What you need first</h2><p class="sub">All of these are free. Skip any you already have.</p>' +
      '<div class="needs">' + (g.prerequisites || []).map((p) =>
        '<div class="glass need"><strong>' + esc(p.name) + "</strong><span>" + dec(p.why) + "</span>" +
        (p.link ? '<a href="' + esc(p.link) + '" target="_blank" rel="noopener">Download</a>' : "") + "</div>").join("") + "</div>" +
    "</section>" +

    '<section class="block"><h2 class="h2">Run these, in order</h2><p class="sub">Lines in grey that start with # are notes, not commands. Where it says YOUR-USERNAME, type your own GitHub name.</p>' +
      '<ol class="run">' + steps.map((s, i) =>
        '<li><span class="run-n" aria-hidden="true">' + (i + 1) + "</span><div>" +
          '<h3 class="h3">' + esc(s.title) + "</h3><p>" + dec(s.detail) + "</p>" +
          (s.command ? OC.ui.codeBlock(s.command, i) : "") + "</div></li>").join("") + "</ol>" +
      '<p class="tip-line">Stuck on an error? Go back to <a href="dashboard.html?id=' + encodeURIComponent(g.id) + '">step 1</a> and ask about it. Paste the error message into the question box.</p>' +
    "</section>" +

    OC.ui.nextBlock(g, "setup");

  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
    const cmd = steps[+b.dataset.copy].command.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    OC.ui.copy(cmd);
  }));
});
