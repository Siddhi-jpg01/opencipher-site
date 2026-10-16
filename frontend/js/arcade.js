/* =========================================================
   arcade.js — Step 4: Play & earn.
   Hub (#)            player card, games, badges
   #match             Star Match: pair each folder with what it does
   #rush              Jargon Rush: 45-second tech-word speed round
   #build             Command Builder: rebuild the real setup commands
   Every game is generated from the guide for THIS repository.
   High scores pay XP only for the improvement, so replaying can't farm it.
   ========================================================= */

/* every badge in the app (the quiz page awards the first four) */
OC.BADGES = [
  ["finisher", "check", "Finisher", "Finish the Code Quiz"],
  ["flawless", "heart", "Flawless", "Finish the Code Quiz without losing a heart"],
  ["sharp-eye", "bug", "Sharp eye", "Find the bug in real code"],
  ["on-a-roll", "flame", "On a roll", "Five right answers in a row"],
  ["memory", "grid", "Perfect memory", "Clear Star Match in very few moves"],
  ["wizard", "spark", "Word wizard", "Get 12 right in Jargon Rush"],
  ["commander", "terminal", "Command master", "Build every command without a mistake"],
  ["explorer", "star", "Explorer", "Visit all four steps"],
  ["shipper", "trophy", "Ship it", "Finish the whole pull request checklist"]
];

OC.ui.boot("arcade", function (g, main) {
  const { $, $$, esc, icon } = OC.ui;
  document.title = g.repo.full_name + " — Play & earn";
  const shuffle = (a) => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const badgeName = (k) => (OC.BADGES.find((b) => b[0] === k) || [0, 0, k])[2];
  const best = (k) => ((OC.store.progress(g.id).best || {})[k] || 0);
  let cleanup = null;          // stops timers when leaving a game

  /* ---------- data each game needs ---------- */
  const pairs = (g.directories || []).filter((d) => d.role).slice(0, 6).map((d) => ({ a: d.path, b: short(d.role, 70), path: true }));
  const memoryPairs = pairs.length >= 3 ? pairs : (g.glossary || []).slice(0, 6).map((w) => ({ a: w.term, b: short(w.meaning, 70), path: false }));
  const words = (g.glossary || []).filter((w) => w.term && w.meaning);
  const commands = buildCommands();
  function short(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; }
  function buildCommands() {
    const out = [], seen = new Set();
    (g.setup_steps || []).forEach((s) => (s.command || "").split("\n").forEach((line) => {
      line = line.trim();
      const toks = line.split(/\s+/);
      if (!line || line.startsWith("#") || seen.has(line) || toks.length < 2 || toks.length > 7) return;
      seen.add(line); out.push({ title: s.title, line, toks });
    }));
    const slug = "fix/my-first-change";
    [["Make your own branch", "git checkout -b " + slug], ["Upload your branch to GitHub", "git push origin " + slug]].forEach(([title, line]) => {
      if (!seen.has(line)) out.push({ title, line, toks: line.split(" ") });
    });
    return out.slice(0, 6);
  }

  /* auto badges from the other steps */
  const prog = OC.store.progress(g.id);
  if (OC.STEPS.every((s) => prog.visited[s.page])) OC.store.badge(g.id, "explorer", "Explorer");
  if (Object.values(prog.checks || {}).filter(Boolean).length >= 7) OC.store.badge(g.id, "shipper", "Ship it");

  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const h = location.hash.slice(1);
    if (h === "match" && memoryPairs.length >= 3) return match();
    if (h === "rush" && words.length >= 4) return rush();
    if (h === "build" && commands.length >= 2) return build();
    hub();
  }
  addEventListener("hashchange", () => { route(); scrollTo({ top: 0 }); });

  /* =================================================== HUB */
  function hub() {
    const s = OC.store.stats(), r = OC.rank(s.xp), p = OC.store.progress(g.id);
    const games = [
      { href: "quiz.html?id=" + encodeURIComponent(g.id), icon: "bug", title: "Code Quiz", tint: "rgba(255, 122, 46, 0.3)",
        text: "Questions and puzzles about this project: find the bug, predict the output, put the steps in order.", meta: p.bestScore ? "Best " + p.bestScore + "%" : "New", ok: (g.quiz || []).length > 0 },
      { href: "#match", icon: "grid", title: "Star Match", tint: "rgba(255, 214, 140, 0.28)",
        text: "Flip the stars and pair every " + (pairs.length >= 3 ? "folder with what it does" : "word with its meaning") + ". Fewer moves, more points.", meta: best("game:match") ? "Best +" + best("game:match") + " XP" : "New", ok: memoryPairs.length >= 3 },
      { href: "#rush", icon: "clock", title: "Jargon Rush", tint: "rgba(255, 170, 80, 0.3)",
        text: "45 seconds. Match each tech word to its meaning as fast as you can. Streaks multiply your score.", meta: best("game:rush") ? "Best +" + best("game:rush") + " XP" : "New", ok: words.length >= 4 },
      { href: "#build", icon: "terminal", title: "Command Builder", tint: "rgba(255, 240, 220, 0.18)",
        text: "Put the real commands for this project back together, piece by piece. Learn them by building them.", meta: best("game:build") ? "Best +" + best("game:build") + " XP" : "New", ok: commands.length >= 2 }
    ];
    const got = new Set(p.badges);
    main.innerHTML = OC.ui.aiNotice(g) +
      '<header class="intro"><span class="step-of">Step 4 of 4</span><h1 class="title">Play &amp; earn</h1>' +
      '<p class="lead">Mini-games made from ' + esc(g.repo.name) + '. Every game teaches you something real about the project. Earn XP, climb the ranks, collect badges.</p></header>' +

      '<section class="glass player"><div class="player-orb" aria-hidden="true">' + (r.index + 1) + "</div><div>" +
        '<p class="player-rank">' + esc(r.name) + '</p><p class="player-next">' + (r.next ? r.need + " XP until you become a <strong>" + esc(r.next) + "</strong>" : "Top rank reached. Legendary.") + "</p>" +
        '<div class="player-bar"><span style="width:' + r.pct + '%"></span></div>' +
        '<div class="ranks">' + OC.RANKS.map((x, n) => '<span class="' + (n <= r.index ? "got" : "") + '">' + esc(x.name) + "</span>").join("") + "</div></div>" +
        '<div class="player-stats"><div><strong>' + s.xp + "</strong><span>total XP</span></div><div><strong>" + Math.max(1, s.streak) + "</strong><span>day streak</span></div><div><strong>" + got.size + "/" + OC.BADGES.length + "</strong><span>badges</span></div></div>" +
      "</section>" +

      '<section><h2 class="h2" style="margin-bottom:8px">Choose a game</h2><p class="muted" style="margin-bottom:24px">Beat your own high score to earn more XP.</p><div class="games">' +
        games.map((x) => x.ok
          ? '<a class="glass game-card" href="' + x.href + '" style="--tint:' + x.tint + '"><span class="game-icon">' + icon(x.icon) + "</span><h3>" + x.title + "</h3><p>" + esc(x.text) + "</p>" +
            '<div class="game-meta"><span class="tag gold">' + esc(x.meta) + '</span><span class="play">Play ' + icon("play") + "</span></div></a>"
          : '<div class="glass game-card" style="cursor:default;opacity:.5"><span class="game-icon">' + icon("lock") + "</span><h3>" + x.title + "</h3><p>Not enough information in this project for this game yet.</p></div>").join("") +
      "</div></section>" +

      '<section class="block"><h2 class="h2" style="margin-bottom:8px">Badges</h2><p class="muted" style="margin-bottom:24px">Each badge is worth 20 XP. Some come from the games, some from finishing the steps.</p><div class="badges">' +
        OC.BADGES.map((b) => '<div class="badge' + (got.has(b[0]) ? "" : " locked") + '"><span class="bi">' + icon(got.has(b[0]) ? b[1] : "lock") + "</span><div><strong>" + esc(b[2]) + "</strong><span>" + esc(b[3]) + "</span></div></div>").join("") +
      "</div></section>" +
      '<div class="next"><div><h2 class="h2">Ready for the real thing?</h2><p>Everything you practised here is what you\'ll use on your first pull request.</p></div><a class="btn" href="tasks.html?id=' + encodeURIComponent(g.id) + '">Go to my task</a></div>';
  }

  /* shared bits for game screens */
  function frame(title, intro, rules, startLabel, onStart) {
    main.innerHTML = '<div class="game-screen"><a class="back" href="#">' + icon("back") + "Back to the arcade</a>" +
      '<header class="g-head"><h1>' + title + "</h1><p>" + intro + "</p></header><div id=\"stage\">" +
      '<div class="glass start-panel"><h2>How to play</h2><ul>' + rules.map((r) => "<li>" + icon("check") + "<span>" + r + "</span></li>").join("") + "</ul><br>" +
      '<button type="button" class="btn" id="start">' + icon("play") + startLabel + "</button></div></div></div>";
    $("#start").addEventListener("click", onStart);
    $("#start").focus();
  }
  function finishPanel(o) {
    const res = OC.store.awardBest(g.id, o.key, o.xpValue);
    if (o.badge) OC.store.badge(g.id, o.badge, badgeName(o.badge));
    OC.store.touchDay();
    $("#stage").innerHTML = '<div class="glass done-panel"><div class="done-num">' + o.big + "</div><h2>" + esc(o.title) + "</h2><p>" + esc(o.line) + "</p>" +
      '<div class="done-xp">' + icon("bolt") + (res.xp ? "+" + res.xp + " XP" + (res.prev ? " for beating your best" : "") : "No new XP. Beat your best of " + res.best + " to earn more.") + "</div>" +
      '<div class="done-actions"><button type="button" class="btn" id="again">' + icon("refresh") + 'Play again</button><a class="btn-ghost" href="#">Back to the arcade</a></div></div>';
    $("#again").addEventListener("click", o.again);
    const r = $(".done-num").getBoundingClientRect();
    if (res.xp || o.win) OC.ui.burst(r.left + r.width / 2, r.top + r.height / 2, 90);
  }
  function floatText(el, text, neg) {
    const r = el.getBoundingClientRect(), f = document.createElement("div");
    f.className = "float" + (neg ? " neg" : ""); f.textContent = text;
    f.style.left = r.right - 60 + "px"; f.style.top = r.top + "px";
    document.body.appendChild(f); setTimeout(() => f.remove(), 900);
  }

  /* =================================================== STAR MATCH */
  function match() {
    frame("Star Match", "Every star hides " + (memoryPairs[0].path ? "a folder or file, or what it does" : "a word or its meaning") + ". Find the pairs.",
      ["Click a star to flip it, then click another.", "If the two cards belong together, they stay open.", "Clear the board in as few moves as you can."],
      "Start", play);
    function play() {
      const cards = shuffle(memoryPairs.flatMap((p, i) => [{ i, text: p.a, path: p.path }, { i, text: p.b, path: false }]));
      let open = [], moves = 0, found = 0, sec = 0, lock = false;
      const t = setInterval(() => { sec++; const el = $("#m-time"); if (el) el.textContent = sec + "s"; }, 1000);
      cleanup = () => clearInterval(t);
      $("#stage").innerHTML = '<div class="glass g-hud"><span class="item">' + icon("grid") + 'Pairs <strong id="m-found">0/' + memoryPairs.length + '</strong></span>' +
        '<span class="item">' + icon("refresh") + 'Moves <strong id="m-moves">0</strong></span><span class="item">' + icon("clock") + '<strong id="m-time">0s</strong></span>' +
        '<span class="best">' + (best("game:match") ? "Your best: +" + best("game:match") + " XP" : "First game") + "</span></div>" +
        '<div class="board" id="board">' + cards.map((c, n) => '<button type="button" class="card" data-n="' + n + '" aria-label="Hidden card ' + (n + 1) + '"><span class="face front"></span>' +
          '<span class="face back-face' + (c.path ? " is-path" : "") + '">' + esc(c.text) + "</span></button>").join("") + "</div>";
      $$(".card").forEach((b) => b.addEventListener("click", () => {
        const n = +b.dataset.n;
        if (lock || b.classList.contains("up") || b.classList.contains("done")) return;
        b.classList.add("up"); b.setAttribute("aria-label", cards[n].text);
        open.push(n);
        if (open.length < 2) return;
        moves++; $("#m-moves").textContent = moves;
        const [x, y] = open.map((k) => $$(".card")[k]);
        if (cards[open[0]].i === cards[open[1]].i) {
          x.classList.add("done"); y.classList.add("done"); found++; open = [];
          $("#m-found").textContent = found + "/" + memoryPairs.length;
          const r = y.getBoundingClientRect(); OC.ui.burst(r.left + r.width / 2, r.top + r.height / 2, 24);
          if (found === memoryPairs.length) { clearInterval(t); setTimeout(() => end(moves, sec), 700); }
        } else {
          lock = true; x.classList.add("miss"); y.classList.add("miss");
          setTimeout(() => { [x, y].forEach((c) => { c.classList.remove("up", "miss"); c.setAttribute("aria-label", "Hidden card"); }); open = []; lock = false; }, 950);
        }
      }));
    }
    function end(moves, sec) {
      const n = memoryPairs.length, extra = moves - n;
      const score = Math.max(10, Math.min(100, Math.round(100 - extra * 7 - sec * 0.4)));
      finishPanel({ key: "game:match", xpValue: Math.round(score * 0.4), big: score, win: true,
        title: extra <= 2 ? "Perfect memory!" : score >= 60 ? "Board cleared!" : "Cleared!",
        line: "You found all " + n + " pairs in " + moves + " moves and " + sec + " seconds. Now you know what every part of the project is for.",
        badge: extra <= 2 ? "memory" : null, again: play });
    }
  }

  /* =================================================== JARGON RUSH */
  function rush() {
    const TIME = 45;
    frame("Jargon Rush", "How many tech words from this project can you match in " + TIME + " seconds?",
      ["Pick the right meaning for each word. Keys 1, 2 and 3 work too.", "Three in a row doubles your points.", "A wrong answer costs you 3 seconds."],
      "Start the clock", play);
    function play() {
      let left = TIME * 4, score = 0, right = 0, combo = 0, queue = [], cur = null, locked = false;
      const tick = setInterval(() => {
        left--;
        const bar = $("#timer");
        if (bar) { bar.firstChild.style.width = (left / (TIME * 4)) * 100 + "%"; bar.classList.toggle("low", left < 40); }
        const tl = $("#r-time"); if (tl) tl.textContent = Math.ceil(left / 4) + "s";
        if (left <= 0) { clearInterval(tick); end(); }
      }, 250);
      const key = (e) => { if (/^[1-3]$/.test(e.key)) { const b = $$(".rush-opt")[+e.key - 1]; if (b) b.click(); } };
      document.addEventListener("keydown", key);
      cleanup = () => { clearInterval(tick); document.removeEventListener("keydown", key); };
      $("#stage").innerHTML = '<div class="glass g-hud"><span class="item" id="r-score-wrap">' + icon("bolt") + 'Score <strong id="r-score">0</strong></span>' +
        '<span class="item">' + icon("flame") + '<strong id="r-combo">0</strong> in a row</span><span class="item">' + icon("clock") + '<strong id="r-time">' + TIME + 's</strong></span>' +
        '<span class="best">' + (best("game:rush") ? "Your best: +" + best("game:rush") + " XP" : "First game") + "</span></div>" +
        '<div class="glass rush"><div class="timer" id="timer"><span></span></div><div id="q"></div></div>';
      next();
      function next() {
        if (!queue.length) queue = shuffle(words);
        cur = queue.pop(); locked = false;
        const wrong = shuffle(words.filter((w) => w.term !== cur.term)).slice(0, 2);
        const opts = shuffle([cur].concat(wrong));
        $("#q").innerHTML = '<p class="rush-term">' + esc(cur.term) + '</p><p class="rush-hint">What does it mean?</p><div class="rush-opts">' +
          opts.map((o, n) => '<button type="button" class="rush-opt" data-ok="' + (o.term === cur.term) + '"><span class="key">' + (n + 1) + "</span><span>" + esc(short(o.meaning, 110)) + "</span></button>").join("") + "</div>";
        $$(".rush-opt").forEach((b) => b.addEventListener("click", () => answer(b)));
      }
      function answer(b) {
        if (locked || left <= 0) return;
        locked = true;
        if (b.dataset.ok === "true") {
          combo++; right++;
          const pts = combo >= 3 ? 20 : 10;
          score += pts; b.classList.add("right"); floatText(b, "+" + pts);
          const w = $("#r-score-wrap"); w.classList.remove("bump"); void w.offsetWidth; w.classList.add("bump");
        } else {
          combo = 0; left = Math.max(1, left - 12); b.classList.add("wrong"); floatText(b, "-3s", true);
          $$(".rush-opt").forEach((x) => { if (x.dataset.ok === "true") x.classList.add("right"); });
        }
        $("#r-score").textContent = score; $("#r-combo").textContent = combo;
        setTimeout(() => { if (left > 0) next(); }, b.dataset.ok === "true" ? 350 : 900);
      }
      function end() {
        cleanup(); cleanup = null;
        finishPanel({ key: "game:rush", xpValue: Math.min(60, Math.round(score / 4)), big: score, win: right >= 5,
          title: right >= 12 ? "Word wizard!" : right >= 6 ? "Fast fingers!" : "Time's up!",
          line: "You matched " + right + " word" + (right === 1 ? "" : "s") + ". These are the words you'll see in this project's issues and docs.",
          badge: right >= 12 ? "wizard" : null, again: play });
      }
    }
  }

  /* =================================================== COMMAND BUILDER */
  function build() {
    frame("Command Builder", "Rebuild the real commands you need for " + esc(g.repo.name) + ", one piece at a time.",
      ["Click the pieces in the right order to build the command.", "Click a piece in the command to send it back.", "You have three hearts. One piece in each round is a trick."],
      "Start building", play);
    function play() {
      let i = 0, hearts = 3, right = 0, perfect = true, pool = [], placed = [];
      const rounds = commands;
      cleanup = null;
      render();
      function hud() {
        return '<div class="glass g-hud"><span class="hearts" aria-label="' + hearts + ' hearts left">' + [0, 1, 2].map((n) => icon("heart", n < hearts ? "full" : "empty")).join("") + "</span>" +
          '<span class="item">' + icon("terminal") + "Command <strong>" + (i + 1) + "/" + rounds.length + "</strong></span>" +
          '<span class="item">' + icon("check") + "Built <strong>" + right + "</strong></span>" +
          '<span class="best">' + (best("game:build") ? "Your best: +" + best("game:build") + " XP" : "First game") + "</span></div>";
      }
      function render() {
        const r = rounds[i];
        const others = rounds.flatMap((x) => x.toks).filter((t) => !r.toks.includes(t));
        const decoy = others.length ? others[Math.floor(Math.random() * others.length)] : null;
        pool = shuffle(r.toks.map((t, n) => ({ t, id: n })).concat(decoy ? [{ t: decoy, id: "d" }] : []));
        placed = [];
        $("#stage").innerHTML = hud() + '<div class="glass builder"><p class="builder-task">Build the command for:</p><h2>' + esc(r.title) + "</h2>" +
          '<div class="slot" id="slot"></div><div class="pool" id="pool"></div>' +
          '<div class="row"><button type="button" class="btn-ghost btn-small" id="clear">Clear</button><button type="button" class="btn" id="check" disabled>Check</button></div><div id="msg"></div></div>';
        draw();
        $("#clear").addEventListener("click", () => { pool = pool.concat(placed); placed = []; draw(); });
        $("#check").addEventListener("click", check);
      }
      function draw() {
        $("#slot").innerHTML = '<span class="prompt">$</span>' + (placed.length ? placed.map((p, n) => '<button type="button" class="tok" data-s="' + n + '">' + esc(p.t) + "</button>").join("") : '<span class="placeholder">Click the pieces below</span>');
        $("#pool").innerHTML = pool.map((p, n) => '<button type="button" class="tok" data-p="' + n + '">' + esc(p.t) + "</button>").join("");
        $$("[data-p]").forEach((b) => b.addEventListener("click", () => { placed.push(pool.splice(+b.dataset.p, 1)[0]); draw(); }));
        $$("[data-s]").forEach((b) => b.addEventListener("click", () => { pool.push(placed.splice(+b.dataset.s, 1)[0]); draw(); }));
        $("#check").disabled = !placed.length;
      }
      function check() {
        const r = rounds[i], ok = placed.map((p) => p.t).join(" ") === r.line;
        const slot = $("#slot");
        $$(".builder button").forEach((b) => (b.disabled = true));
        if (ok) {
          right++; slot.classList.add("right");
          const rc = slot.getBoundingClientRect(); OC.ui.burst(rc.left + rc.width / 2, rc.top + rc.height / 2, 30);
          $("#msg").innerHTML = '<p class="answer-line"><strong class="gold">Built it!</strong> This is a real command from the setup guide.</p>';
        } else {
          hearts--; perfect = false; slot.classList.add("wrong");
          $("#msg").innerHTML = '<p class="answer-line"><strong style="color:var(--bad)">Not quite.</strong> The right command is <code>' + esc(r.line) + "</code></p>";
        }
        $(".g-hud").outerHTML = hud();
        setTimeout(() => {
          if (hearts <= 0 || ++i >= rounds.length) return end();
          render();
        }, ok ? 1100 : 2600);
      }
      function end() {
        const all = right === rounds.length;
        finishPanel({ key: "game:build", xpValue: right * 8, big: right + "/" + rounds.length, win: right > 0,
          title: all && perfect ? "Command master!" : hearts <= 0 ? "Out of hearts" : "Nice building!",
          line: all ? "You can now type every command you need to set up this project, from memory." : "Every command you got wrong is shown in step 2. Have a look and try again.",
          badge: all && perfect ? "commander" : null, again: play });
      }
    }
  }

  route();
});
