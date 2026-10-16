/* =========================================================
   dashboard.js — Step 1: What it is.
   ========================================================= */
OC.ui.boot("dashboard", function (g, main) {
  const { $, $$, esc, icon, decorate } = OC.ui;
  const r = g.repo, used = new Set(), dec = (t) => decorate(t, g.glossary, used);
  const link = (p) => r.url + (p.endsWith("/") ? "/tree/" : "/blob/") + (r.default_branch || "main") + "/" + p.replace(/\/$/, "");
  document.title = r.full_name + " — What it is";
  const KIND = { start: "Read this first", core: "Main code", useful: "Helpful later", skip: "You can ignore this for now" };
  const kindOf = (d) => (d.start_here ? "start" : KIND[d.importance] ? d.importance : "useful");

  const facts = [
    r.language && [icon("file"), "Written in " + esc(r.language)],
    [icon("star"), OC.ui.shortNum(r.stars) + " stars on GitHub"],
    r.license && [icon("info"), esc(r.license) + " licence"],
    r.updated_at && [icon("clock"), "Last changed " + OC.ui.ago(r.updated_at)],
    [icon("ext"), '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">Open on GitHub</a>']
  ].filter(Boolean);

  const st = g.where_to_start;
  const rd = g.readiness;

  main.innerHTML = OC.ui.aiNotice(g) +
    '<header class="intro"><span class="step-of">Step 1 of 4</span>' +
      '<h1 class="title repo-title"><span class="owner">' + esc(r.owner) + "/</span>" + esc(r.name) + "</h1>" +
      '<p class="lead">' + dec(g.summary.one_liner) + "</p>" +
      '<div class="facts">' + facts.map((f) => "<span>" + f[0] + f[1] + "</span>").join("") + "</div>" +
      '<div class="stack">' + (g.summary.tech_stack || []).map((t) => '<span class="tag">' + esc(t) + "</span>").join("") + "</div>" +
    "</header>" +

    '<section class="block"><h2 class="h2">In plain English</h2><p class="sub">Words with a dotted line have a short explanation. Hover over them, or tap on a phone.</p>' +
      '<div class="prose">' + (g.summary.plain_explanation || []).map((p) => "<p>" + dec(p) + "</p>").join("") +
      (g.summary.who_its_for ? '<p class="for"><strong>Who it\'s for:</strong> ' + dec(g.summary.who_its_for) + "</p>" : "") + "</div></section>" +

    '<section class="block pair">' +
      (st ? '<div class="glass first-file"><p class="label">Read this file first</p><code class="path">' + esc(st.path) + "</code><p>" + dec(st.why) + '</p><a class="btn" href="' + esc(link(st.path)) + '" target="_blank" rel="noopener">Open it on GitHub</a></div>' : "") +
      '<div class="glass score"><p class="label">How beginner-friendly is this project?</p><div class="score-num">' + esc(rd.score) + "<small> / 100</small></div>" +
        '<p class="score-verdict">' + esc(rd.verdict) + '</p><ul class="checks">' +
        rd.checks.map((c) => '<li class="' + (c.pass ? "yes" : "no") + '">' + icon(c.pass ? "check" : "x") + "<span>" + esc(c.name) + (c.detail ? ' <span class="dim">(' + esc(c.detail) + ")</span>" : "") + "</span></li>").join("") +
      "</ul></div>" +
    "</section>" +

    '<section class="block"><h2 class="h2">Map of the project</h2><p class="sub">Each glowing cluster is a folder or file. Brighter means more important. Click one to see what it does.</p>' +
      '<div class="map"><canvas class="map-canvas" id="map" aria-label="Map of the project. Use the list below to explore it with a keyboard."></canvas>' +
      '<aside class="glass map-info" id="map-info" aria-live="polite"></aside></div>' +
      '<details class="as-list"><summary>See it as a list instead</summary><ul id="map-list"></ul></details>' +
    "</section>" +

    '<section class="block"><h2 class="h2">Ask anything about this project</h2><p class="sub">Where things live, how to run it, what to work on. Answers come from the project\'s own files.</p>' +
      '<div class="glass chat"><div class="chat-log" id="log" aria-live="polite"></div><div class="suggest" id="suggest"></div>' +
      '<form class="chat-form" id="chat"><label class="sr-only" for="q">Your question</label><input id="q" type="text" placeholder="Type a question…" autocomplete="off" maxlength="500"><button class="btn" id="send" type="submit">Ask</button></form></div>' +
      '<p class="engine" id="engine" style="margin-top:12px"></p>' +
    "</section>" +

    '<section class="block"><h2 class="h2">Words you\'ll see</h2><p class="sub">You don\'t need to memorise these. They\'re here when you need them.</p>' +
      '<dl class="words">' + (g.glossary || []).map((w) => "<div><dt>" + esc(w.term) + "</dt><dd>" + esc(w.meaning) + "</dd></div>").join("") + "</dl></section>" +

    OC.ui.nextBlock(g, "dashboard");

  /* ---------- the constellation map ---------- */
  const dirs = g.directories || [];
  function info(i) {
    const d = dirs[i], k = kindOf(d);
    $("#map-info").innerHTML = '<p class="kind ' + k + '">' + KIND[k] + '</p><p class="path">' + esc(d.path) + "</p><p>" + esc(d.role) + "</p>" +
      '<a class="btn-ghost btn-small" href="' + esc(link(d.path)) + '" target="_blank" rel="noopener">' + icon("ext") + "Open on GitHub</a>";
    $$("#map-list button").forEach((b) => b.setAttribute("aria-current", +b.dataset.i === i));
  }
  $("#map-list").innerHTML = dirs.map((d, i) => '<li><button type="button" data-i="' + i + '"><span class="p">' + esc(d.path) + "</span><span>" + esc(KIND[kindOf(d)]) + "</span></button></li>").join("");
  if (dirs.length) {
    const map = OC.constellation($("#map"), dirs, info);
    $$("#map-list button").forEach((b) => b.addEventListener("click", () => map.select(+b.dataset.i)));
  }

  /* ---------- ask a question ---------- */
  const log = $("#log"), q = $("#q"), send = $("#send"), history = [];
  function say(who, text, cls) {
    const m = document.createElement("div");
    m.className = "msg " + cls;
    m.innerHTML = (who ? '<span class="who">' + esc(who) + "</span>" : "") + esc(text);
    log.appendChild(m); log.scrollTop = log.scrollHeight;
    return m;
  }
  say("OpenCipher", "Hi! I've read " + r.full_name + ". Ask me where something is, how to run it, or what to work on first.", "bot");
  const sample = g.id === "sample";
  if (sample) $("#engine").textContent = "This is the example guide, so answers come from the saved information.";
  else OC.api.health().then((h) => {
    $("#engine").textContent = h.ai.reachable ? "Answers are written by " + h.model + "." : "The AI model is off, so answers are a simple search of the project's files.";
  }).catch(() => { $("#engine").textContent = "The server isn't running, so questions can't be answered right now."; });

  const ideas = ["Where does the code start?", "How do I run the tests?", "What should I work on first?"];
  $("#suggest").innerHTML = ideas.map((s) => '<button type="button">' + esc(s) + "</button>").join("");
  $$("#suggest button").forEach((b) => b.addEventListener("click", () => { q.value = b.textContent; ask(); }));

  async function ask() {
    const text = q.value.trim();
    if (!text) return;
    q.value = ""; send.disabled = true;
    say("", text, "me");
    const t = say("OpenCipher", "", "bot typing");
    try {
      let answer;
      if (sample) {
        answer = "In this example, start with " + (st ? st.path : "the README") + ". To get it running: " +
          g.setup_steps.map((s) => (s.command || "").split("\n")[0]).filter(Boolean).join(", then ") + ".";
      } else {
        const res = await OC.api.ask(g.id, text, history);
        answer = res.answer;
      }
      t.classList.remove("typing");
      t.innerHTML = '<span class="who">OpenCipher</span>' + esc(answer);
      history.push({ role: "user", content: text }, { role: "assistant", content: answer });
    } catch (e) {
      t.classList.remove("typing");
      t.innerHTML = '<span class="who">OpenCipher</span>' + esc(e.message);
    }
    log.scrollTop = log.scrollHeight;
    send.disabled = false; q.focus();
  }
  $("#chat").addEventListener("submit", (e) => { e.preventDefault(); ask(); });
});
