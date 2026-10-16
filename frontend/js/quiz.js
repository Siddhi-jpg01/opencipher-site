/* =========================================================
   quiz.js — Step 4: Practise.
   Round types: mcq | truefalse | fill | find_bug | predict | order
   XP is paid once per question per project, so replaying can't farm it.
   Keys: 1-4 choose, Enter checks / continues.
   ========================================================= */
OC.ui.boot("arcade", function (g, main) {
  const { $, $$, esc, icon } = OC.ui;
  const HEARTS = 3, XP_Q = 10, XP_PUZZLE = 25, BONUS = 5;
  const KIND = { mcq: "Choose one", truefalse: "True or false", fill: "Fill the gap", find_bug: "Find the bug", predict: "What does it print?", order: "Put in order" };
  let rounds, i, hearts, combo, best, xp, results, cur, phase;
  document.title = g.repo.full_name + " — Practise";

  main.innerHTML = OC.ui.aiNotice(g) +
    '<a class="back-link" href="arcade.html?id=' + encodeURIComponent(g.id) + '">' + icon("back") + "Back to the arcade</a>" +
    '<header class="intro"><span class="step-of">Arcade game</span><h1 class="title">Code Quiz</h1>' +
    '<p class="lead">Questions and code puzzles made from this project. You have three hearts. Get three right in a row for bonus points.</p></header>' +
    '<div class="game-wrap"><section class="glass game" id="game" aria-live="polite"></section></div>';

  function start() {
    const qs = (g.quiz || []).slice(), ps = (g.puzzles || []).slice();
    rounds = [];
    while (qs.length || ps.length) { rounds.push(...qs.splice(0, 2)); if (ps.length) rounds.push(ps.shift()); }
    i = 0; hearts = HEARTS; combo = 0; best = 0; xp = 0; results = [];
    if (!rounds.length) { $("#game").innerHTML = '<div class="result"><h2>No practice yet</h2><p>This guide has no questions. Make it again with the AI model running.</p></div>'; return; }
    show();
  }

  function hud(lost) {
    return '<div class="hud"><span class="hearts" aria-label="' + hearts + ' hearts left">' +
      Array.from({ length: HEARTS }, (_, n) => icon("heart", (n < hearts ? "full" : "empty") + (n === lost ? " lost" : ""))).join("") + "</span>" +
      '<span class="hud-item" id="combo" title="Right answers in a row">' + icon("flame") + combo + " in a row</span>" +
      '<span class="hud-item" id="sxp">' + icon("bolt") + "+" + xp + " XP</span>" +
      '<span class="count">' + (i + 1) + " of " + rounds.length + "</span></div>" +
      '<div class="track"><span style="width:' + (results.filter((r) => r !== undefined).length / rounds.length) * 100 + '%"></span></div>';
  }

  function show() {
    cur = rounds[i]; phase = "answer"; cur._pick = null;
    let body = "", q = esc(cur.question || cur.title);
    if (cur.type === "fill") q = esc(cur.question).replace(/_{2,}/, '<span class="blank" id="blank">?</span>');
    if (cur.type === "find_bug") {
      body = '<div class="codebox" role="radiogroup" aria-label="Lines of code">' + cur.lines.map((l, n) =>
        '<button type="button" class="line" role="radio" aria-checked="false" data-n="' + n + '"><span class="ln">' + (n + 1) + "</span><span>" + esc(l) + "</span></button>").join("") +
        '</div><p class="help">Click the line that is wrong.</p>';
    } else if (cur.type === "predict") {
      body = '<div class="codebox">' + cur.lines.map((l, n) => '<div class="line static"><span class="ln">' + (n + 1) + "</span><span>" + esc(l) + "</span></div>").join("") + "</div>" +
        '<p class="predict-q">' + esc(cur.prompt) + '</p><div class="predict"><label class="sr-only" for="pin">Your answer</label><input id="pin" type="text" autocomplete="off" placeholder="Type your answer"></div>';
    } else if (cur.type === "order") {
      let o = cur.lines.map((_, n) => n);
      do { o = shuffle(o); } while (o.length > 1 && o.every((v, n) => v === n));
      cur._pick = o;
    } else {
      const two = cur.type === "truefalse";
      body = '<div class="options' + (two ? " two" : "") + '" role="radiogroup">' + cur.options.map((o, n) =>
        '<button type="button" class="opt' + (cur.type === "fill" ? " opt--word" : "") + '" role="radio" aria-checked="false" data-n="' + n + '"><span class="key">' + (n + 1) + "</span><span>" + esc(o) + "</span></button>").join("") + "</div>";
    }
    $("#game").innerHTML = hud() + '<span class="tag gold kind">' + KIND[cur.type] + '</span><h2 class="question">' + q + '</h2><div id="answer">' + body + "</div>" +
      '<div id="fb"></div><div class="actions"><button type="button" class="btn" id="act" disabled>Check</button></div>';
    if (cur.type === "order") { drawOrder(); $("#act").disabled = false; }
    $$(".opt").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.n)));
    $$(".line:not(.static)").forEach((b) => b.addEventListener("click", () => {
      cur._pick = +b.dataset.n; $$(".line").forEach((x) => x.setAttribute("aria-checked", x === b)); $("#act").disabled = false;
    }));
    const pin = $("#pin");
    if (pin) { pin.addEventListener("input", () => { cur._pick = pin.value; $("#act").disabled = !pin.value.trim(); }); pin.focus(); }
    $("#act").addEventListener("click", () => (phase === "answer" ? check() : next()));
  }
  function pick(n) {
    if (phase !== "answer" || !cur.options || n >= cur.options.length) return;
    cur._pick = n;
    $$(".opt").forEach((b) => b.setAttribute("aria-checked", +b.dataset.n === n));
    if ($("#blank")) $("#blank").textContent = cur.options[n];
    $("#act").disabled = false;
  }
  function drawOrder(focus) {
    const o = cur._pick;
    $("#answer").innerHTML = '<ol class="order">' + o.map((li, pos) => '<li data-pos="' + pos + '"><span class="n">' + (pos + 1) + "</span><code>" + esc(cur.lines[li]) + '</code><span class="arrows">' +
      '<button type="button" data-mv="-1" aria-label="Move up"' + (pos === 0 ? " disabled" : "") + ">" + icon("up") + '</button><button type="button" data-mv="1" aria-label="Move down"' + (pos === o.length - 1 ? " disabled" : "") + ">" + icon("down") + "</button></span></li>").join("") +
      '</ol><p class="help">Use the arrows to move each line into the right order.</p>';
    $$("[data-mv]").forEach((b) => b.addEventListener("click", () => {
      const pos = +b.closest("li").dataset.pos, to = pos + +b.dataset.mv;
      [o[pos], o[to]] = [o[to], o[pos]];
      drawOrder({ pos: to, mv: b.dataset.mv });
    }));
    if (focus) { const t = $('.order li[data-pos="' + focus.pos + '"] [data-mv="' + focus.mv + '"]'); (t && !t.disabled ? t : $('.order li[data-pos="' + focus.pos + '"] button:not(:disabled)')).focus(); }
  }

  const norm = (s) => String(s || "").trim().toLowerCase().replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, " ");
  function check() {
    let right;
    if (cur.type === "find_bug") {
      right = cur._pick === cur.bug_line;
      $$(".line").forEach((b) => { const n = +b.dataset.n; if (n === cur.bug_line) b.classList.add("right"); else if (n === cur._pick) b.classList.add("wrong"); });
    } else if (cur.type === "order") {
      right = cur._pick.every((v, n) => v === n);
      $$(".order li").forEach((li) => li.classList.add(cur._pick[+li.dataset.pos] === +li.dataset.pos ? "right" : "wrong"));
    } else if (cur.type === "predict") {
      right = (cur.answers || []).some((a) => norm(a) === norm(cur._pick));
      const pin = $("#pin"); pin.classList.add(right ? "right" : "wrong"); pin.readOnly = true;
    } else {
      right = cur._pick === cur.answer;
      $$(".opt").forEach((b) => { const n = +b.dataset.n; if (n === cur.answer) b.classList.add("right"); else if (n === cur._pick) b.classList.add("wrong"); });
    }
    $("#answer").classList.add("locked");
    results[i] = right; phase = "review";
    OC.store.touchDay();
    let head, lost;
    if (right) {
      combo++; best = Math.max(best, combo);
      const amount = (["find_bug", "order", "predict"].includes(cur.type) ? XP_PUZZLE : XP_Q) + (combo >= 3 ? BONUS : 0);
      const got = OC.store.award(g.id, "q:" + (cur.id || cur.question || cur.title), amount);
      xp += got;
      head = got ? "Correct! +" + got + " XP" + (combo >= 3 ? " (streak bonus)" : "") : "Correct! (You already earned the XP for this one.)";
    } else {
      combo = 0; hearts--; lost = hearts;
      head = hearts > 0 ? "Not quite" : "Out of hearts";
    }
    let extra = "";
    if (!right && cur.type === "predict") extra = " The answer is " + (cur.answers || [])[0] + ".";
    if (!right && cur.type === "order") extra = " The right order is: " + cur.lines.join(", then ") + ".";
    // refresh the HUD in place
    const tmp = document.createElement("div"); tmp.innerHTML = hud(lost);
    $(".hud").replaceWith(tmp.firstChild); $(".track").replaceWith(tmp.lastChild);
    if (right) { const el = $("#sxp"); el.classList.add("bump"); }
    $("#fb").innerHTML = '<div class="feedback ' + (right ? "ok" : "no") + '"><strong>' + esc(head) + "</strong><p>" + esc((cur.explanation || "") + extra) + "</p></div>";
    const act = $("#act");
    act.textContent = hearts <= 0 ? "See my results" : i === rounds.length - 1 ? "Finish" : "Next question";
    act.focus({ preventScroll: true });
  }
  function next() { if (hearts <= 0) return finish(false); if (++i >= rounds.length) return finish(true); show(); }

  document.addEventListener("keydown", (e) => {
    if (!cur || !$("#act")) return;
    if (e.target.tagName === "INPUT" && e.key !== "Enter") return;
    if (/^[1-9]$/.test(e.key) && phase === "answer" && cur.options) pick(+e.key - 1);
    if (e.key === "Enter" && !$("#act").disabled && document.activeElement !== $("#act")) { e.preventDefault(); $("#act").click(); }
  });

  function finish(completed) {
    const correct = results.filter(Boolean).length, score = Math.round((correct / rounds.length) * 100);
    const p = OC.store.progress(g.id), bugIdx = rounds.findIndex((r) => r.type === "find_bug");
    const earned = [];
    if (completed) earned.push("finisher");
    if (completed && hearts === HEARTS) earned.push("flawless");
    if (bugIdx >= 0 && results[bugIdx]) earned.push("sharp-eye");
    if (best >= 5) earned.push("on-a-roll");
    const fresh = earned.filter((b) => !p.badges.includes(b));
    if (completed) p.bestScore = Math.max(p.bestScore || 0, score);
    OC.store.saveProgress(g.id, p);
    fresh.forEach((b) => { if (OC.store.badge(g.id, b)) xp += 20; });
    p.badges = OC.store.progress(g.id).badges;
    const B = [["finisher", "check", "Finished", "Answered every question"], ["flawless", "heart", "Flawless", "Didn't lose a heart"],
               ["sharp-eye", "star", "Sharp eye", "Found the bug in real code"], ["on-a-roll", "flame", "On a roll", "Five right in a row"]];
    const title = !completed ? "Out of hearts" : score === 100 ? "Perfect!" : score >= 70 ? "You're ready" : "Good start";
    const line = !completed ? "No problem. Every mistake here is one you won't make on the real project. Have another look at step 1, then try again."
      : score >= 70 ? "You understand this project well enough to make your first contribution." : "Read through steps 1 and 2 again, then go for a higher score.";
    cur = null;
    $("#game").innerHTML = '<div class="result"><div class="result-num">' + score + "<small>%</small></div><h2>" + esc(title) + "</h2><p>" + esc(line) + "</p>" +
      '<div class="result-stats"><div><strong>' + correct + "/" + rounds.length + "</strong><span>right</span></div><div><strong>+" + xp + "</strong><span>XP earned</span></div><div><strong>" + OC.store.stats().streak + "</strong><span>day streak</span></div></div>" +
      '<ul class="badges">' + B.map((b) => '<li class="badge' + (p.badges.includes(b[0]) ? "" : " locked") + '"><span class="bi">' + icon(b[1]) + "</span><div><strong>" + esc(b[2]) +
        (fresh.includes(b[0]) ? '<span class="new">New</span>' : "") + "</strong><span>" + esc(b[3]) + "</span></div></li>").join("") + "</ul>" +
      '<div class="result-actions"><button type="button" class="btn-ghost" id="again">' + icon("refresh") + 'Play again</button><a class="btn" href="arcade.html?id=' + encodeURIComponent(g.id) + '">Back to the arcade</a></div></div>';
    $("#again").addEventListener("click", start);
    const rn = $(".result-num").getBoundingClientRect();
    if (completed) OC.ui.burst(rn.left + rn.width / 2, rn.top + rn.height / 2, 100);
  }
  function shuffle(a) { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }

  start();
});
