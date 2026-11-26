// Galactic chemical evolution and planet heating panels of the simulator page.
// Data: js/gce-data.js (window.GCE_DATA), exported from OMEGA runs (see README).
(function () {
  "use strict";
  const D = window.GCE_DATA;
  if (!D) return;
  const $ = (id) => document.getElementById(id);
  const AGE = D.meta.age_gyr, F = [0].concat(D.meta.f);

  // Frank et al. (2014, Icarus 243, 274), Table 1, from Turcotte & Schubert (2002)
  const ISO = {
    k40:  { half: 1.25,  heat: 2.92e-5, earth0: 463.6, label: "^{40}K" },
    th232:{ half: 14.0,  heat: 2.64e-5, earth0: 155.0, label: "^{232}Th" },
    u235: { half: 0.704, heat: 5.69e-4, earth0: 16.4,  label: "^{235}U" },
    u238: { half: 4.47,  heat: 9.46e-5, earth0: 62.4,  label: "^{238}U" },
  };
  const LN2 = Math.log(2);

  // ---------- shared drawing helpers (same look as the shell plots) ----------
  let col = {};
  function readColours() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    col = { ink: g("--ink"), soft: g("--ink-soft"), faint: g("--ink-faint"), sans: g("--sans"),
      c1: g("--c1"), c2: g("--c2"), c4: g("--c4"), c5: g("--c5"), r4: g("--r4"), r6: g("--r6"), star: g("--star") };
  }
  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cv.clientWidth, h: cv.clientHeight };
  }
  const font = (ctx, px) => { ctx.font = px + "px " + col.sans; };
  function drawRich(ctx, s, x, y, px) {
    const parts = []; const re = /\^\{([^}]*)\}/g; let last = 0, m;
    while ((m = re.exec(s))) { if (m.index > last) parts.push([s.slice(last, m.index), false]); parts.push([m[1], true]); last = re.lastIndex; }
    if (last < s.length) parts.push([s.slice(last), false]);
    const small = Math.round(px * 0.72), align = ctx.textAlign;
    const widths = parts.map(([t, up]) => { font(ctx, up ? small : px); return ctx.measureText(t).width; });
    let cx = align === "center" ? x - widths.reduce((a, b) => a + b, 0) / 2 : align === "right" ? x - widths.reduce((a, b) => a + b, 0) : x;
    ctx.textAlign = "left";
    parts.forEach(([t, up], i) => { font(ctx, up ? small : px); ctx.fillText(t, cx, up ? y - px * 0.38 : y); cx += widths[i]; });
    ctx.textAlign = align; font(ctx, px);
  }
  const minus = (n) => String(n).replace("-", "−");
  function axes(ctx, box, xr, yr, o) {
    const { x0, y0, w, h } = box;
    const X = (v) => x0 + (v - xr[0]) / (xr[1] - xr[0]) * w, Y = (v) => y0 + h - (v - yr[0]) / (yr[1] - yr[0]) * h;
    ctx.strokeStyle = col.faint; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w), Math.round(h));
    ctx.fillStyle = col.soft; ctx.textAlign = "center"; ctx.textBaseline = "top";
    o.xt.forEach((t) => { const p = Math.round(X(t.v)) + 0.5; ctx.beginPath(); ctx.moveTo(p, y0 + h); ctx.lineTo(p, y0 + h - 5); ctx.moveTo(p, y0); ctx.lineTo(p, y0 + 5); ctx.stroke(); drawRich(ctx, t.l, p, y0 + h + 5 + (t.l.indexOf("^{") >= 0 ? 4 : 0), 12); });
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    o.yt.forEach((t) => { const p = Math.round(Y(t.v)) + 0.5; ctx.beginPath(); ctx.moveTo(x0, p); ctx.lineTo(x0 + 5, p); ctx.moveTo(x0 + w, p); ctx.lineTo(x0 + w - 5, p); ctx.stroke(); drawRich(ctx, t.l, x0 - 6, p + (t.l.indexOf("^{") >= 0 ? 2 : 0), 12); });
    ctx.fillStyle = col.ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    drawRich(ctx, o.xl, x0 + w / 2, y0 + h + 40, 13);
    ctx.save(); ctx.translate(x0 - o.yo, y0 + h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = "top"; drawRich(ctx, o.yl, 0, 4, 13); ctx.restore();
    return { X, Y };
  }
  function line(ctx, pts, c, wd, dash) {
    ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.setLineDash(dash || []); ctx.beginPath(); let on = false;
    pts.forEach((p) => { if (!p || !isFinite(p[0]) || !isFinite(p[1])) { on = false; return; } on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; });
    ctx.stroke(); ctx.setLineDash([]);
  }
  const ticks = (a, b, s, fmt) => { const t = []; for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) t.push({ v, l: fmt(v) }); return t; };
  const nf = (d) => (v) => minus(Math.abs(v) < 1e-9 ? "0" : v.toFixed(d));
  function legend(id, items) {
    $(id).innerHTML = items.map((it) => it.sq ? '<span><b class="mk sq"></b>' + it.l + "</span>" : it.dot ? '<span><b class="mk dotc" style="background:' + it.c + ';border-color:' + it.c + '"></b>' + it.l + "</span>"
      : '<span><i' + (it.dash ? ' class="dash"' : "") + ' style="--c:' + it.c + '"></i>' + it.l + "</span>").join("");
  }

  // ---------- the selected OMEGA track, interpolated in f between exact runs ----------
  // the merger is the one set by the shell model's sliders at the top of the page
  const tfOf = () => Math.pow(10, +ui.tf.value);     // the formation slider is log10 of Gyr
  const ui = { f: $("gceF"), tf: $("planetT"), uth: $("planetUTh"), mix: $("mix"), mdot: $("mdot"), down: $("downturn") };
  const FAMS = [["PPM", 1], ["PPM3", 3], ["PPM10", 10], ["PPM50", 50]];
  const RATES = [["7.95E+01", 4e-5], ["7.95E+02", 4e-4], ["7.95E+03", 4e-3]];
  const ZERO = "0.00E+00";
  const mdotOf = (v) => (+v <= -5.45 ? 0 : Math.pow(10, +v));
  // weights on the two nearest calculated points in log space; outside the range the end
  // pair's trend is extended (weights then fall outside 0-1)
  function logPair(list, v) {
    const lv = Math.log10(v), ls = list.map((x) => Math.log10(x[1]));
    let i = 0; while (i < ls.length - 2 && lv > ls[i + 1]) i++;
    const w = (lv - ls[i]) / (ls[i + 1] - ls[i]);
    return [[list[i][0], 1 - w], [list[i + 1][0], w]];
  }
  function mixWeights(mix, downturn) {
    const ppm = logPair(FAMS, mix);
    if (downturn) return ppm;
    // no slowdown: the MLT merger, moved by the same trend with mixing speed as the 3D-inspired ones
    return [["MLT", 1]].concat(ppm, [["PPM", -1]]);
  }
  function rateWeights(mdot) {
    if (mdot <= 0) return [[ZERO, 1]];
    if (mdot < RATES[0][1]) { const w = mdot / RATES[0][1]; return [[ZERO, 1 - w], [RATES[0][0], w]]; }
    return logPair(RATES, mdot);
  }
  function mergerChoice() {
    const mix = Math.pow(10, +ui.mix.value), mdot = mdotOf(ui.mdot.value), down = ui.down.checked;
    const corners = [];
    mixWeights(mix, down).forEach(([fam, wm]) => rateWeights(mdot).forEach(([rk, wr]) => corners.push([fam + "_" + rk, wm * wr])));
    return { corners, mix, mdot, mlt: !down };
  }
  function track() {
    const ch = mergerChoice(), parts = ch.corners.filter((c) => Math.abs(c[1]) > 1e-9);
    const n = AGE.length, out = { feh: new Array(n).fill(0), kfe: new Array(n).fill(0), r40: new Array(n).fill(0) };
    parts.forEach(([key, w]) => { const t = trackOf(key); for (let j = 0; j < n; j++) { out.feh[j] += w * t.feh[j]; out.kfe[j] += w * t.kfe[j]; out.r40[j] += w * Math.log(Math.max(t.r40[j], 1e-30)); } });
    out.r40 = out.r40.map(Math.exp); out.choice = ch;
    return out;
  }
  function trackOf(key) {
    const f = +ui.f.value, c = D.cases[key];
    if (f <= 0) return D.base;
    let i = 0; while (i < F.length - 2 && F[i + 1] < f) i++;
    const fa = F[i], fb = F[i + 1], A = fa === 0 ? D.base : c[String(fa)], B = c[String(fb)], t = (f - fa) / (fb - fa);
    const mix = (k) => A[k].map((v, j) => v + t * (B[k][j] - v));
    return { feh: mix("feh"), kfe: mix("kfe"), r40: A.r40.map((v, j) => Math.exp(Math.log(Math.max(v, 1e-30)) + t * (Math.log(Math.max(B.r40[j], 1e-30)) - Math.log(Math.max(v, 1e-30))))) };
  }
  const interpAge = (arr, tg) => {
    for (let j = 1; j < AGE.length; j++) if (AGE[j] >= tg) { const u = (tg - AGE[j - 1]) / (AGE[j] - AGE[j - 1]); return arr[j - 1] + u * (arr[j] - arr[j - 1]); }
    return arr[arr.length - 1];
  };

  // ---------- [K/Fe] vs [Fe/H] ----------
  function drawGCE(tr) {
    const cv = $("gcePlot"); const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h);
    const box = { x0: 62, y0: 10, w: w - 62 - 16, h: h - 10 - 50 }, xr = [-3, 0.6], yr = [-1.0, 1.3];
    const { X, Y } = axes(ctx, box, xr, yr, { xt: ticks(-3, 0.5, 0.5, nf(1)), yt: ticks(-1, 1.25, 0.5, nf(1)), xl: "[Fe/H]", yl: "[K/Fe]", yo: 52 });
    ctx.save(); ctx.beginPath(); ctx.rect(box.x0, box.y0, box.w, box.h); ctx.clip();
    ctx.fillStyle = col.star; ctx.globalAlpha = 0.35;
    D.stars.apogee.forEach(([x, y]) => { ctx.fillRect(X(x) - 1, Y(y) - 1, 2, 2); });
    ctx.globalAlpha = 0.6; ctx.fillStyle = col.r4;
    D.stars.stellab.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(X(x), Y(y), 2, 0, 2 * Math.PI); ctx.fill(); });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col.faint; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(box.x0, Y(0)); ctx.lineTo(box.x0 + box.w, Y(0)); ctx.stroke(); ctx.setLineDash([]);
    line(ctx, D.base.feh.map((x, j) => [X(x), Y(D.base.kfe[j])]), col.ink, 1.8);
    if (+ui.f.value > 0) line(ctx, tr.feh.map((x, j) => [X(x), Y(tr.kfe[j])]), col.c2, 2.6);
    // where the gas is when the Sun and the planet form
    const tf = tfOf();
    ctx.strokeStyle = col.ink; ctx.lineWidth = 1.5; ctx.strokeRect(X(0) - 5, Y(0) - 5, 10, 10);
    ctx.fillStyle = col.ink; ctx.beginPath(); ctx.arc(X(interpAge(tr.feh, tf)), Y(interpAge(tr.kfe, tf)), 5.5, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
    const items = [{ c: col.ink, l: "Massive stars" }];
    if (+ui.f.value > 0) items.push({ c: col.c2, l: "+ shell mergers" });
    items.push({ sq: true, l: "Sun" }, { dot: true, c: col.ink, l: "Your planet" });
    items.push({ dot: true, c: col.r4, l: "STELLAB stars" }, { dot: true, c: col.star, l: "APOGEE stars" });
    legend("gceLegend", items);
  }

  // ---------- 40K/K in the gas against Galactic time ----------
  function drawR40(tr) {
    const cv = $("r40Plot"); const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h);
    const box = { x0: 62, y0: 10, w: w - 62 - 16, h: h - 10 - 50 }, xr = [0, AGE[AGE.length - 1]];
    const lg = (v) => Math.log10(Math.max(v, 1e-30));
    // fixed range: holds every OMEGA run (all cases, all fractions) after the first 0.3 Gyr
    const lo = -4, hi = -1;
    const yt = []; for (let e = lo; e <= hi; e++) yt.push({ v: e, l: "10^{" + minus(e) + "}" });
    const { X, Y } = axes(ctx, box, xr, [lo, hi], { xt: ticks(0, xr[1], 2, nf(0)), yt, xl: "Time since the Galaxy formed (Gyr)", yl: "^{40}K/K in the gas", yo: 52 });
    ctx.save(); ctx.beginPath(); ctx.rect(box.x0, box.y0, box.w, box.h); ctx.clip();
    line(ctx, AGE.map((t, j) => [X(t), Y(lg(D.base.r40[j]))]), col.ink, 1.8);
    if (+ui.f.value > 0) line(ctx, AGE.map((t, j) => [X(t), Y(lg(tr.r40[j]))]), col.c2, 2.6);
    // the Sun at birth, and the chosen planet
    const ts = D.meta.t_ss_gyr;
    ctx.strokeStyle = col.faint; ctx.lineWidth = 1.5; ctx.strokeRect(X(ts) - 5, Y(lg(D.meta.ref_ss)) - 5, 10, 10);
    const tf = tfOf(), rf = interpAge(tr.r40, tf);
    ctx.fillStyle = col.ink; ctx.beginPath(); ctx.arc(X(tf), Y(lg(rf)), 5, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
    legend("r40Legend", [{ c: col.ink, l: "Massive stars" }].concat(+ui.f.value > 0 ? [{ c: col.c2, l: "+ shell mergers" }] : []));
    $("r40Legend").innerHTML += '<span><b class="mk sq"></b>Solar birth ratio</span><span><b class="mk dot"></b>Your planet</span>';
  }

  // ---------- radiogenic heating of the planet's mantle ----------
  function heating(c40, uth) {
    // c in ppb (1e-9 kg/kg); returns pW/kg (1e-12 W/kg) at planet age t (Gyr)
    const c0 = { k40: c40, th232: ISO.th232.earth0 * uth, u235: ISO.u235.earth0 * uth, u238: ISO.u238.earth0 * uth };
    return (k, t) => c0[k] * 1e-9 * ISO[k].heat * Math.exp(-LN2 * t / ISO[k].half) * 1e12;
  }
  function drawHeat(tr) {
    const cv = $("heatPlot"); const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h);
    const box = { x0: 62, y0: 10, w: w - 62 - 16, h: h - 10 - 50 }, xr = [0, 6];
    const tf = tfOf(), uth = Math.pow(10, +ui.uth.value);
    // the planet's 40K/K relative to the NuGrid gas at the Sun's birth, so that the NuGrid
    // model gives Earth's initial mantle 40K (Frank et al. 2014) for a planet born with the Sun
    const rSun = interpAge(D.base.r40, D.meta.t_ss_gyr);
    const rf = interpAge(tr.r40, tf), c40 = ISO.k40.earth0 * rf / rSun;
    const H = heating(c40, uth), He = heating(ISO.k40.earth0, 1);
    const ts = []; for (let t = 0; t <= xr[1] + 1e-9; t += 0.05) ts.push(t);
    const tot = (Hf, t) => ["k40", "th232", "u235", "u238"].reduce((s, k) => s + Hf(k, t), 0);
    let hi = 0; ts.forEach((t) => { hi = Math.max(hi, tot(H, t), tot(He, t)); });
    hi = Math.ceil(hi / 10) * 10;
    const step = hi > 80 ? 20 : 10;
    const { X, Y } = axes(ctx, box, xr, [0, hi], { xt: ticks(0, 6, 1, nf(0)), yt: ticks(0, hi, step, nf(0)), xl: "Time since the planet formed (Gyr)", yl: "Heat production (pW per kg of mantle)", yo: 52 });
    ctx.save(); ctx.beginPath(); ctx.rect(box.x0, box.y0, box.w, box.h); ctx.clip();
    line(ctx, ts.map((t) => [X(t), Y(tot(He, t))]), col.faint, 1.6, [6, 4]);
    const cs = { k40: col.c2, th232: col.c5, u235: col.r6, u238: col.c1 };
    ["th232", "u235", "u238", "k40"].forEach((k) => line(ctx, ts.map((t) => [X(t), Y(H(k, t))]), cs[k], 1.8));
    line(ctx, ts.map((t) => [X(t), Y(tot(H, t))]), col.ink, 2.6);
    ctx.restore();
    legend("heatLegend", [{ c: col.ink, l: "Total" }, { c: cs.k40, l: "<sup>40</sup>K" }, { c: cs.th232, l: "<sup>232</sup>Th" },
      { c: cs.u235, l: "<sup>235</sup>U" }, { c: cs.u238, l: "<sup>238</sup>U" }, { c: col.faint, dash: true, l: "Earth, total" }]);
    $("pK40").textContent = (c40 / ISO.k40.earth0).toFixed(2) + "× Earth";
    $("pHeat0").textContent = tot(H, 0).toFixed(0) + " pW/kg";
    $("pHeatNow").textContent = tot(H, 4.567).toFixed(1) + " pW/kg";
  }

  // the merger the Galaxy uses: the shell model's own settings
  function describe(ch) {
    const sci = (v) => { if (!(v > 0)) return "0"; const e = Math.floor(Math.log10(v)); return (v / Math.pow(10, e)).toFixed(1) + " \u00d7 10<sup>" + minus(e) + "</sup>"; };
    const m = (ch.mix < 10 ? ch.mix.toFixed(1) : ch.mix.toFixed(0)) + "\u00d7 " + (ch.mlt ? "mixing length theory" : "3D-inspired");
    return m + ", " + sci(ch.mdot) + " M<sub>\u2609</sub>/s";
  }
  function draw() {
    $("gceFOut").textContent = Math.round(+ui.f.value * 100) + "%";
    const tf = tfOf(); $("planetTOut").textContent = (tf < 1 ? tf.toPrecision(2) : tf.toFixed(1)) + " Gyr";
    $("planetUThOut").textContent = Math.pow(10, +ui.uth.value).toFixed(2) + "× Earth";
    const tr = track(); drawGCE(tr); drawR40(tr); drawHeat(tr);
    $("gceCase").innerHTML = describe(tr.choice);
    $("pFeH").textContent = minus(interpAge(tr.feh, tfOf()).toFixed(2));
  }
  [ui.f, ui.tf, ui.uth].forEach((el) => el.addEventListener("input", draw));
  ui.mix.addEventListener("input", draw); ui.mdot.addEventListener("input", draw); ui.down.addEventListener("change", draw);
  let rT = null; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(draw, 80); });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColours(); draw(); });
  ui.tf.max = String(Math.log10(AGE[AGE.length - 1]).toFixed(3));
  ui.tf.value = String(Math.log10(D.meta.t_ss_gyr).toFixed(3));
  readColours(); draw();
})();
