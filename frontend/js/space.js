/* =========================================================
   space.js — the visuals.
   OC.blackHole(canvas)  real-time light-bending black hole (WebGL)
   OC.starfield(canvas)  quiet twinkling stars for the inner pages
   ========================================================= */
window.OC = window.OC || {};

/* ---------------------------------------------------------------- black hole */
OC.blackHole = function (canvas, opts) {
  opts = opts || {};
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { canvas.classList.add("no-webgl"); return { setZoom() {}, stop() {} }; }

  const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
  /* Rays leave the camera and are bent towards the hole step by step
     (acceleration -1.5 h^2 r / r^5, the standard Schwarzschild photon trick).
     Where a ray crosses the disk plane we add glowing, swirling gas; rays that
     fall inside r = 1 hit the event horizon and stay black. */
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uZoom; uniform vec2 uMouse; uniform float uShift;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }

vec3 sky(vec3 d){
  vec3 q = d * 160.0; vec3 id = floor(q);
  float h = hash3(id);
  float s = step(0.992, h) * smoothstep(0.45, 0.0, length(fract(q) - 0.5)) * (0.5 + 0.5*hash3(id + 7.0));
  vec3 star = s * mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash3(id + 3.0));
  float neb = fbm(d.xy * 2.5 + d.z) * fbm(d.yz * 3.0 + 4.0);
  return star * 1.4 + vec3(0.09, 0.035, 0.02) * neb * neb * 3.0;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  uv.x -= uShift;
  float dist = mix(23.0, 5.5, uZoom);
  float tilt = 0.16 + uMouse.y * 0.06;
  float yaw = uMouse.x * 0.18 + uTime * 0.01;
  vec3 ro = vec3(sin(yaw)*cos(tilt), sin(tilt), -cos(yaw)*cos(tilt)) * dist;
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0.0,1.0,0.0), fw)), up = cross(fw, rt);
  vec3 vel = normalize(fw * 1.55 + uv.x*rt + uv.y*up);
  vec3 pos = ro;
  vec3 hv = cross(pos, vel); float h2 = dot(hv, hv);
  vec3 col = vec3(0.0); float alpha = 0.0; bool captured = false;

  for (int i = 0; i < 170; i++){
    float r2 = dot(pos, pos); float r = sqrt(r2);
    if (r < 1.0){ captured = true; break; }
    if (r > 45.0 || alpha > 0.985) break;
    float dt = clamp(r * 0.055, 0.035, 0.7);
    vec3 acc = -1.5 * h2 * pos / pow(r2, 2.5);
    vec3 npos = pos + vel * dt;
    vel += acc * dt;
    if (pos.y * npos.y < 0.0){
      vec3 p = mix(pos, npos, pos.y / (pos.y - npos.y));
      float pr = length(p.xz);
      if (pr > 2.4 && pr < 11.0){
        float ang = atan(p.z, p.x);
        float swirl = ang + uTime * 0.55 / pow(pr, 1.5) * 4.0;
        float gas = fbm(vec2(pr * 1.6, swirl * 2.5)) * 0.75 + fbm(vec2(pr * 5.0, swirl * 7.0)) * 0.45;
        float edge = smoothstep(2.4, 3.1, pr) * smoothstep(11.0, 6.0, pr);
        float temp = pow(2.8 / pr, 1.35);
        vec3 c = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.58, 0.14), clamp(temp, 0.0, 1.0));
        c = mix(c, vec3(1.0, 0.9, 0.62), clamp(temp * temp * 1.4 - 0.55, 0.0, 1.0));
        vec3 dv = normalize(vec3(-p.z, 0.0, p.x));
        float dop = pow(clamp(1.0 + 0.62 * dot(dv, -normalize(vel)), 0.15, 2.0), 3.0);
        float I = edge * pow(gas, 1.6) * temp * 2.3 * dop;
        col += (1.0 - alpha) * c * I;
        alpha += (1.0 - alpha) * clamp(I * 0.85, 0.0, 1.0);
      }
    }
    pos = npos;
  }
  if (!captured) col += (1.0 - alpha) * sky(normalize(vel));
  col = 1.0 - exp(-col * 1.55);
  float vig = smoothstep(1.35, 0.25, length((gl_FragCoord.xy - 0.5*uRes) / uRes.y));
  gl_FragColor = vec4(col * (0.35 + 0.65 * vig), 1.0);
}`;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.classList.add("no-webgl"); return { setZoom() {}, stop() {} }; }
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ["uRes", "uTime", "uZoom", "uMouse", "uShift"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

  // Render below screen resolution and let CSS scale it up: big speed win, still looks smooth
  const SCALE = opts.scale || (innerWidth < 700 ? 0.55 : 0.6);
  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth * SCALE)), h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  let zoom = 0, zoomTarget = 0, mx = 0, my = 0, tmx = 0, tmy = 0, raf = 0, last = 0, t0 = performance.now();
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  addEventListener("pointermove", (e) => { tmx = e.clientX / innerWidth - 0.5; tmy = e.clientY / innerHeight - 0.5; }, { passive: true });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / 45) return;          // cap at ~45 fps to keep laptops cool
    last = now;
    resize();
    zoom += (zoomTarget - zoom) * 0.03;
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    const wide = canvas.clientWidth / canvas.clientHeight;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, still ? 8 : (now - t0) / 1000);
    gl.uniform1f(U.uZoom, zoom);
    gl.uniform2f(U.uMouse, mx, my);
    gl.uniform1f(U.uShift, typeof opts.shift === "function" ? opts.shift(wide) : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (still && Math.abs(zoomTarget - zoom) < 0.001) cancelAnimationFrame(raf);
  }
  raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); });
  return {
    setZoom(z) { zoomTarget = z; if (still) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); }
  };
};

/* ---------------------------------------------------------------- starfield */
OC.starfield = function (canvas) {
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars = [], w = 0, h = 0, raf;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 5200) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() < 0.9 ? Math.random() * 0.9 + 0.3 : Math.random() * 1.4 + 1,
      p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.2, warm: Math.random() < 0.35
    }));
    draw(0);
  }
  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(s.p + t * 0.001 * s.s));
      ctx.fillStyle = s.warm ? `rgba(255, 214, 170, ${a})` : `rgba(235, 238, 255, ${a * 0.85})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
  }
  function loop(t) { draw(t); raf = requestAnimationFrame(loop); }
  resize();
  addEventListener("resize", resize);
  if (!still) raf = requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); if (!document.hidden && !still) raf = requestAnimationFrame(loop); });
};
