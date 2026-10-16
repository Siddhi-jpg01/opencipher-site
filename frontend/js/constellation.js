/* =========================================================
   constellation.js — the project's folders drawn as glowing star clusters.
   The file to read first sits in the middle; the more important a folder,
   the brighter and bigger its cluster. Click (or use the list) to learn more.
   ========================================================= */
window.OC = window.OC || {};

OC.constellation = function (canvas, items, onSelect) {
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STYLE = {
    start:  { n: 520, spread: 46, rgb: [255, 214, 140], size: 1.8, label: "#FFE2B0" },
    core:   { n: 300, spread: 38, rgb: [255, 165, 75], size: 1.55, label: "#F5EEE6" },
    useful: { n: 170, spread: 30, rgb: [240, 205, 175], size: 1.3, label: "#BCB1A6" },
    skip:   { n: 70,  spread: 24, rgb: [150, 136, 124], size: 1.1, label: "#857A70" }
  };
  let w = 0, h = 0, nodes = [], selected = 0, hover = -1, raf, t0 = performance.now();

  function kind(d) { return d.start_here ? "start" : (STYLE[d.importance] ? d.importance : "useful"); }

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    const start = items.findIndex((d) => d.start_here);
    const rest = items.map((d, i) => i).filter((i) => i !== start);
    nodes = items.map((d) => ({ d, k: kind(d) }));
    if (start >= 0) Object.assign(nodes[start], { x: cx, y: cy });
    // every other node gets its own angle (no overlaps); important ones sit closer to the centre
    const order = { core: 0, useful: 1, skip: 2 };
    rest.sort((x, y) => (order[items[x].importance] ?? 1) - (order[items[y].importance] ?? 1));
    rest.forEach((i, n) => {
      const ang = -Math.PI / 2 + 0.35 + (n / rest.length) * Math.PI * 2;
      const rad = R * ({ core: 0.5, useful: 0.72, skip: 0.82 }[items[i].importance] || 0.72);
      nodes[i].x = cx + Math.cos(ang) * rad * (w > h ? 1.45 : 1);
      nodes[i].y = cy + Math.sin(ang) * rad * 0.8;
    });
    // particles: gaussian scatter around each node, each with its own slow orbit
    const k = Math.max(0.6, Math.min(1.2, Math.min(w, h) / 480));
    nodes.forEach((nd) => {
      const s = STYLE[nd.k];
      nd.spread = s.spread * k;
      nd.pts = Array.from({ length: s.n }, () => {
        const r = Math.abs(gauss()) * nd.spread, a = Math.random() * Math.PI * 2;
        return { r, a, sp: (0.15 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1), z: Math.random() };
      });
    });
    draw(performance.now());
  }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.55; }

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    const centre = nodes.find((n) => n.k === "start") || { x: w / 2, y: h / 2 };
    // faint constellation lines from the centre
    ctx.lineWidth = 1;
    nodes.forEach((n, i) => {
      if (n === centre) return;
      const active = i === selected || i === hover;
      ctx.strokeStyle = active ? "rgba(255, 196, 107, 0.45)" : "rgba(255, 226, 196, 0.08)";
      ctx.setLineDash(active ? [] : [2, 6]);
      ctx.beginPath(); ctx.moveTo(centre.x, centre.y); ctx.lineTo(n.x, n.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = "lighter";
    nodes.forEach((n, i) => {
      const s = STYLE[n.k], active = i === selected || i === hover;
      const boost = active ? 1.6 : 1, [r, g, b] = s.rgb;
      // soft glow under the cluster
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.spread * (active ? 2.6 : 2));
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${active ? 0.28 : n.k === "skip" ? 0.05 : 0.14})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, n.spread * 2.6, 0, 6.283); ctx.fill();
      for (const p of n.pts) {
        const a = p.a + (still ? 0 : t * p.sp * 0.25);
        const x = n.x + Math.cos(a) * p.r * (active ? 1.15 : 1), y = n.y + Math.sin(a) * p.r * 0.85 * (active ? 1.15 : 1);
        const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(t * 2 * p.sp + p.z * 9);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, (0.25 + p.z * 0.6) * tw * boost)})`;
        const sz = s.size * (0.6 + p.z * 0.9) * (active ? 1.25 : 1);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    // labels
    ctx.textAlign = "center";
    nodes.forEach((n, i) => {
      const s = STYLE[n.k], active = i === selected || i === hover;
      ctx.font = (n.k === "start" || active ? "600 " : "500 ") + (n.k === "start" ? 15 : 13) + "px 'Hanken Grotesk', system-ui, sans-serif";
      ctx.fillStyle = active ? "#FFC46B" : s.label;
      const ly = n.y + n.spread * 0.9 + 22;
      ctx.fillText(n.d.path, n.x, ly);
      if (n.k === "start") { ctx.font = "500 12px 'Hanken Grotesk', system-ui, sans-serif"; ctx.fillStyle = "#FFC46B"; ctx.fillText("start here", n.x, ly + 18); }
    });
  }
  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

  function pick(e) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 1e9;
    nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = i; } });
    return bd < 60 ? best : -1;
  }
  canvas.addEventListener("pointermove", (e) => { hover = pick(e); canvas.style.cursor = hover >= 0 ? "pointer" : "default"; if (still) draw(performance.now()); });
  canvas.addEventListener("pointerleave", () => { hover = -1; if (still) draw(performance.now()); });
  canvas.addEventListener("click", (e) => { const i = pick(e); if (i >= 0) api.select(i); });

  const api = {
    select(i) { selected = i; onSelect(i); if (still) draw(performance.now()); },
  };
  new ResizeObserver(layout).observe(canvas);
  layout();
  if (!still) raf = requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); if (!document.hidden && !still) raf = requestAnimationFrame(loop); });
  api.select(Math.max(0, items.findIndex((d) => d.start_here)));
  return api;
};
