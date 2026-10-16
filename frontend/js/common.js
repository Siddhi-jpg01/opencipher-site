/* =========================================================
   common.js — loaded by every page before the page's own script.
   OC.api    talks to the backend
   OC.store  browser storage (XP, streak, progress, saved guides)
   OC.ui     top bar, icons, safe text, glossary tooltips, toasts
   ========================================================= */
window.OC = window.OC || {};

/* Where is the backend? Same address when the backend serves the site;
   localhost:8000 when the page is opened from disk or VS Code Live Server. */
OC.API_BASE = (function () {
  if (window.OC_API_BASE !== undefined) return window.OC_API_BASE;
  const { protocol, port, hostname } = location;
  if (protocol === "file:") return "http://localhost:8000";
  if (["5500", "5501", "3000", "5173", "8080"].includes(port)) return "http://" + hostname + ":8000";
  return "";
})();

OC.SKILLS = [
  { id: "python", label: "Python" }, { id: "javascript", label: "JavaScript" }, { id: "html-css", label: "HTML & CSS" },
  { id: "docs", label: "Writing docs" }, { id: "testing", label: "Testing" }, { id: "git", label: "Git" }, { id: "design", label: "Design" }
];

OC.STEPS = [
  { page: "dashboard", label: "What it is" },
  { page: "setup", label: "Set it up" },
  { page: "tasks", label: "Pick a task" },
  { page: "arcade", label: "Play & earn" }
];

/* Ranks: everyone starts as stardust and grows into a black hole */
OC.RANKS = [
  { name: "Stardust", xp: 0 }, { name: "Comet", xp: 60 }, { name: "Planet", xp: 160 },
  { name: "Star", xp: 320 }, { name: "Supernova", xp: 550 }, { name: "Black Hole", xp: 850 }
];
OC.rank = function (xp) {
  let i = 0;
  OC.RANKS.forEach((r, n) => { if (xp >= r.xp) i = n; });
  const cur = OC.RANKS[i], next = OC.RANKS[i + 1];
  return { index: i, name: cur.name, next: next ? next.name : null, need: next ? next.xp - xp : 0,
           pct: next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100 };
};

/* ---------------------------------------------------------------- storage */
OC.store = (function () {
  const P = "oc:";
  const get = (k, d) => { try { const v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* private window */ } };
  const today = () => new Date().toDateString();

  function userId() {
    let id = get("user", null);
    if (!id) { id = "u_" + Math.random().toString(36).slice(2, 10); set("user", id); }
    return id;
  }
  function stats() { return Object.assign({ xp: 0, streak: 0, lastDay: null }, get("stats", {})); }
  function touchDay() {
    const s = stats();
    if (s.lastDay === today()) return s;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    s.streak = s.lastDay === yesterday ? s.streak + 1 : 1;
    s.lastDay = today();
    set("stats", s);
    return s;
  }
  /* XP for any one achievement is paid once, so refreshing can't farm it */
  function award(guideId, key, amount) {
    const p = progress(guideId);
    if (p.awarded[key]) return 0;
    p.awarded[key] = true;
    p.xp = (p.xp || 0) + amount;
    saveProgress(guideId, p);
    const s = touchDay();
    const before = OC.rank(s.xp);
    s.xp += amount;
    set("stats", s);
    OC.ui.refreshXp(true);
    const after = OC.rank(s.xp);
    if (after.index > before.index) setTimeout(() => OC.ui.levelUp(after), 600);
    return amount;
  }
  /* High-score games pay only the improvement over your best, so replaying can't farm XP */
  function awardBest(guideId, key, value) {
    const p = progress(guideId);
    p.best = p.best || {};
    const prev = p.best[key] || 0;
    if (value <= prev) return { xp: 0, best: prev, newBest: false };
    p.best[key] = value;
    saveProgress(guideId, p);
    const xp = award(guideId, key + ":" + value, value - prev);
    return { xp, best: value, newBest: true, prev };
  }
  /* Badges: each one is earned once and pays 20 XP */
  function badge(guideId, key, label) {
    const p = progress(guideId);
    if (p.badges.includes(key)) return false;
    p.badges.push(key);
    saveProgress(guideId, p);
    award(guideId, "badge:" + key, 20);
    if (label) setTimeout(() => OC.ui.toast("Badge unlocked: " + label + " (+20 XP)"), 300);
    return true;
  }
  function progress(guideId) {
    return Object.assign({ checks: {}, visited: {}, awarded: {}, xp: 0, bestScore: 0, badges: [] }, get("progress:" + guideId, {}));
  }
  function saveProgress(guideId, p) {
    set("progress:" + guideId, p);
    if (guideId !== "sample") OC.api.saveProgress(guideId, p);
  }
  const guides = {
    get: (id) => get("guide:" + id, null),
    put: (g) => {
      set("guide:" + g.id, g);
      set("active", g.id);
      const recent = get("recent", []).filter((r) => r.id !== g.id);
      recent.unshift({ id: g.id, full_name: g.repo.full_name, one_liner: g.summary.one_liner, at: Date.now() });
      set("recent", recent.slice(0, 6));
    },
    recent: () => get("recent", []),
    active: () => get("active", null),
    setActive: (id) => set("active", id)
  };
  return {
    get, set, userId, stats, touchDay, award, awardBest, badge, progress, saveProgress, guides,
    toolkit: { get: () => get("toolkit", []), set: (v) => set("toolkit", v) },
    level: { get: () => get("level", "beginner"), set: (v) => set("level", v) }
  };
})();

/* ---------------------------------------------------------------- backend */
OC.api = (function () {
  async function req(path, opts) {
    let r;
    try {
      r = await fetch(OC.API_BASE + path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    } catch (e) {
      const err = new Error("The OpenCipher server isn't running. Start it from the VS Code terminal, then try again.");
      err.offline = true;
      throw err;
    }
    let body = null;
    try { body = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw new Error((body && (typeof body.detail === "string" ? body.detail : body.detail && body.detail[0] && body.detail[0].msg)) || "Something went wrong on the server (" + r.status + ").");
    return body;
  }
  return {
    health: () => req("/api/health"),
    analyze: (repo, level, refresh) => req("/api/analyze", { method: "POST", body: JSON.stringify({ repo, level, refresh: !!refresh }) }),
    job: (id) => req("/api/jobs/" + encodeURIComponent(id)),
    guide: (id) => req("/api/guides/" + encodeURIComponent(id)),
    recent: () => req("/api/guides"),
    ask: (guideId, question, history) => req("/api/ask", { method: "POST", body: JSON.stringify({ guide_id: guideId, question, history }) }),
    saveProgress: (guideId, data) => req("/api/progress", { method: "POST", body: JSON.stringify({ user_id: OC.store.userId(), guide_id: guideId, data }) }).catch(() => null)
  };
})();

/* ---------------------------------------------------------------- interface */
OC.ui = (function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const param = (n) => new URLSearchParams(location.search).get(n);

  const P = {
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    ext: '<path d="M14 4h6v6M10 14 20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    spark: '<path d="M12 3c.5 4.5 2 6.5 6.5 7-4.5.5-6 2.5-6.5 7-.5-4.5-2-6.5-6.5-7 4.5-.5 6-2.5 6.5-7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
    flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-9-2 2-2 4-2 5-1-1-2-2-2-4-3 2-6 5-6 8a7 7 0 0 0 7 7z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    send: '<path d="M5 12h14M13 6l6 6-6 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    terminal: '<path d="m5 8 4 4-4 4M12 17h7"/>', bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8v12M7 12H3M21 12h-4M7 16l-3 2M17 16l3 2M9 5l1.5 2M15 5l-1.5 2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', play: '<path d="M7 4l13 8-13 8z"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'
  };
  const icon = (n, cls) => '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || P.info) + "</svg>";

  /* Background stars + glow + the top bar with the 4 steps */
  function shell(current, g) {
    const sky = document.createElement("canvas");
    sky.className = "sky"; sky.setAttribute("aria-hidden", "true");
    const glow = document.createElement("div"); glow.className = "sky-glow";
    document.body.prepend(glow); document.body.prepend(sky);
    if (OC.starfield) OC.starfield(sky);

    const bar = document.createElement("header");
    bar.className = "topbar";
    let nav = "";
    if (g) {
      const p = OC.store.progress(g.id);
      nav = '<nav class="steps-nav" aria-label="Your four steps">' + OC.STEPS.map((s, n) => {
        const cls = s.page === current ? "here" : p.visited[s.page] ? "done" : "";
        return '<a class="' + cls + '" href="' + s.page + ".html?id=" + encodeURIComponent(g.id) + '"' + (s.page === current ? ' aria-current="step"' : "") + '>' +
          '<span class="n">' + (cls === "done" ? icon("check") : n + 1) + "</span>" + s.label + "</a>";
      }).join("") + "</nav>";
    }
    bar.innerHTML = '<a class="wordmark" href="index.html"><span class="wordmark-dot" aria-hidden="true"></span>OpenCipher</a>' + nav +
      '<a class="xp" id="xp" href="' + (g ? "arcade.html?id=" + encodeURIComponent(g.id) : "index.html") + '"></a>';
    document.body.insertBefore(bar, document.body.querySelector("main"));
    refreshXp();
  }
  function refreshXp(bump) {
    const el = $("#xp");
    if (!el) return;
    const s = OC.store.stats(), r = OC.rank(s.xp);
    el.innerHTML = '<span class="rank-name">' + esc(r.name) + '</span><span class="rank-bar"><span style="width:' + r.pct + '%"></span></span>' +
      '<span class="rank-xp">' + icon("bolt") + s.xp + " XP</span>" + (s.streak > 1 ? '<span class="rank-streak">' + icon("flame") + s.streak + "</span>" : "");
    el.title = r.next ? r.need + " XP until you become a " + r.next : "Top rank reached";
    if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  }

  /* Level-up celebration */
  function levelUp(r) {
    const o = document.createElement("div");
    o.className = "levelup"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "New rank");
    o.innerHTML = '<div class="levelup-card"><p class="levelup-kicker">New rank unlocked</p><h2 class="levelup-name">' + esc(r.name) + "</h2>" +
      "<p>" + (r.next ? "Keep going. " + r.need + " more XP to become a " + esc(r.next) + "." : "You reached the top rank. Legendary.") + "</p>" +
      '<button type="button" class="btn">Keep going</button></div>';
    document.body.appendChild(o);
    burst(innerWidth / 2, innerHeight / 2, 140);
    const esc_ = (e) => { if (e.key === "Escape") close(); };
    const close = () => { o.remove(); document.removeEventListener("keydown", esc_); };
    document.addEventListener("keydown", esc_);
    o.querySelector("button").addEventListener("click", close);
    o.addEventListener("click", (e) => { if (e.target === o) close(); });
    o.querySelector("button").focus();
  }

  /* Star burst: a little celebration at (x, y) */
  function burst(x, y, n) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("canvas");
    c.className = "burst"; c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    const cols = ["255,214,140", "255,170,80", "255,122,46", "255,240,220"];
    const ps = Array.from({ length: n || 60 }, () => {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, s: 1 + Math.random() * 2.5, c: cols[(Math.random() * cols.length) | 0] };
    });
    (function frame() {
      ctx.clearRect(0, 0, c.width, c.height);
      let alive = false;
      ps.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.985; p.life -= 0.016;
        if (p.life > 0) { alive = true; ctx.fillStyle = "rgba(" + p.c + "," + p.life + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill(); }
      });
      if (alive) requestAnimationFrame(frame); else c.remove();
    })();
  }
  function footer() {
    const f = document.createElement("footer");
    f.className = "foot";
    f.innerHTML = 'Made by Team OpenCipher for OpenForge 2026. Guides are written by <a href="https://huggingface.co/Qwen/Qwen3-8B" target="_blank" rel="noopener">Qwen3-8B</a>, an open-weight AI model.';
    document.body.appendChild(f);
  }
  function markVisited(g, page) {
    const p = OC.store.progress(g.id);
    if (!p.visited[page]) {
      p.visited[page] = true; OC.store.saveProgress(g.id, p);
      setTimeout(() => { const got = OC.store.award(g.id, "visit:" + page, 5); if (got) toast("+5 XP for exploring a new step"); }, 900);
    }
  }

  /* glossary: underline the first use of each term, show its meaning on hover/focus */
  function decorate(text, glossary, used) {
    text = String(text || "");
    if (!glossary || !glossary.length) return esc(text);
    used = used || new Set();
    const hits = [];
    glossary.forEach((g) => {
      if (!g.term || used.has(g.term.toLowerCase())) return;
      const m = new RegExp("\\b" + g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").exec(text);
      if (m) hits.push({ s: m.index, e: m.index + m[0].length, g });
    });
    hits.sort((a, b) => a.s - b.s);
    let out = "", pos = 0;
    hits.forEach((h) => {
      if (h.s < pos) return;
      used.add(h.g.term.toLowerCase());
      out += esc(text.slice(pos, h.s)) + '<span class="term" tabindex="0" data-term="' + esc(h.g.term) + '" data-def="' + esc(h.g.meaning) + '">' + esc(text.slice(h.s, h.e)) + "</span>";
      pos = h.e;
    });
    return out + esc(text.slice(pos));
  }
  function tooltips() {
    const tip = document.createElement("div");
    tip.className = "tip"; tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    const show = (t) => {
      tip.innerHTML = "<strong>" + esc(t.dataset.term) + "</strong>" + esc(t.dataset.def);
      tip.classList.add("on");
      const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.max(10, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 10)) + "px";
      tip.style.top = (r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10) + "px";
    };
    const hide = () => tip.classList.remove("on");
    document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) show(t); });
    document.addEventListener("mouseout", (e) => { if (e.target.closest(".term")) hide(); });
    document.addEventListener("focusin", (e) => { const t = e.target.closest(".term"); if (t) show(t); });
    document.addEventListener("focusout", hide);
    addEventListener("scroll", hide, { passive: true });
  }

  let tt;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), 2000);
  }
  function copy(text) {
    const ok = () => toast("Copied. Paste it into your terminal.");
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, () => fallback(text, ok));
    fallback(text, ok);
  }
  function fallback(text, ok) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); ok(); } catch (e) { toast("Select the text and copy it yourself."); }
    ta.remove();
  }
  /* terminal commands: grey "# comments", orange "$" prompt */
  function codeBlock(cmd, i) {
    const html = String(cmd || "").split("\n").map((l) => /^\s*#/.test(l) ? '<span class="c-comment">' + esc(l) + "</span>" : '<span class="c-dollar">$ </span>' + esc(l)).join("\n");
    return '<div class="code"><pre>' + html + '</pre><button type="button" class="btn-ghost btn-small copy" data-copy="' + i + '">' + icon("copy") + "Copy</button></div>";
  }
  const shortNum = (n) => { n = +n || 0; return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n); };
  function ago(d) {
    const t = typeof d === "number" ? d : Date.parse(d);
    if (!t) return "";
    const days = Math.round((Date.now() - t) / 86400000);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 31) return days + " days ago";
    const m = Math.round(days / 30);
    return m < 12 ? m + (m === 1 ? " month ago" : " months ago") : Math.round(m / 12) + " years ago";
  }
  function pageState(main, kind, title, text, actions) {
    main.innerHTML = '<div class="state"><div>' + (kind === "loading" ? '<div class="orbit"></div>' : "") +
      '<h1 class="title">' + esc(title) + "</h1><p>" + esc(text) + '</p><div class="actions">' + (actions || "") + "</div></div></div>";
  }

  /* Which guide does this page show? ?id= -> saved in browser -> server -> built-in sample */
  async function loadGuide() {
    const id = param("id") || OC.store.guides.active();
    if (!id) return null;
    if (id === "sample") return window.OC_SAMPLE || null;
    const cached = OC.store.guides.get(id);
    if (cached) return cached;
    const g = await OC.api.guide(id);
    OC.store.guides.put(g);
    return g;
  }
  /* standard page start: load guide, draw the shell, or show a friendly message */
  function boot(page, render) {
    const main = $("main");
    tooltips();
    loadGuide().then((g) => {
      if (g) { OC.store.guides.setActive(g.id); markVisited(g, page); }
      shell(page, g);
      if (!g) return pageState(main, "empty", "Pick a project first", "Paste a GitHub project on the home page and OpenCipher will build this for you.",
        '<a class="btn" href="index.html">Go to the home page</a><a class="btn-ghost" href="' + page + '.html?id=sample">See an example</a>');
      render(g, main);
    }).catch((e) => {
      shell(page, null);
      pageState(main, "error", "This guide didn't load", e.message, '<a class="btn" href="index.html">Go to the home page</a>');
    }).finally(footer);
  }

  function aiNotice(g) {
    if (g.id === "sample") return '<div class="notice glass">' + icon("info") + "<div><strong>This is an example.</strong> It shows what OpenCipher makes for a project. Go to the home page and paste any GitHub project to make your own.</div></div>";
    if (g.ai === "full") return "";
    const why = (g.ai_notes && g.ai_notes[0]) || "The AI model wasn't running.";
    return '<div class="notice glass">' + icon("info") + "<div><strong>Made without the AI model.</strong> " + esc(why) +
      ' Everything here comes straight from the project\'s files. <a href="index.html?repo=' + encodeURIComponent(g.repo.full_name) + '&refresh=1">Make it again with AI</a> once the model is running.</div></div>';
  }
  function nextBlock(g, page) {
    const i = OC.STEPS.findIndex((s) => s.page === page);
    const next = OC.STEPS[i + 1];
    const texts = {
      setup: ["Next: set it up", "Get the project running on your own computer."],
      tasks: ["Next: pick a task", "Choose a small, real piece of work to contribute."],
      arcade: ["Next: play & earn", "Mini-games made from this project. Earn XP, climb the ranks, collect badges."]
    };
    if (!next) return '<div class="next"><div><h2 class="h2">You have everything you need</h2><p>Go back to your task and open your first pull request.</p></div><a class="btn" href="tasks.html?id=' + encodeURIComponent(g.id) + '">Back to my task</a></div>';
    const t = texts[next.page];
    return '<div class="next"><div><h2 class="h2">' + t[0] + "</h2><p>" + t[1] + '</p></div><a class="btn" href="' + next.page + ".html?id=" + encodeURIComponent(g.id) + '">Continue to step ' + (i + 2) + "</a></div>";
  }

  return { $, $$, esc, param, icon, shell, refreshXp, levelUp, burst, footer, markVisited, decorate, tooltips, toast, copy, codeBlock, shortNum, ago, pageState, loadGuide, boot, aiNotice, nextBlock };
})();
