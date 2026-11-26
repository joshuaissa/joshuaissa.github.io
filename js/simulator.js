// Interactive front end for the toy shell model in crn-model.js.
(function () {
  "use strict";
  const CRN = window.CRN;
  const $ = (id) => document.getElementById(id);
  const T_END = CRN.T_END;
  const MODEL_SECONDS_PER_SECOND = 100;   // 1000 s of shell time in 10 s
  const R = CRN.REACTIONS;

  // ---------- colours from the page ----------
  let col = {};
  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    col = { ink: g("--ink"), soft: g("--ink-soft"), faint: g("--ink-faint"), rule: g("--rule"),
      c1: g("--c1"), c2: g("--c2"), c3: g("--c3"), c4: g("--c4"), c5: g("--c5"), sans: g("--sans"),
      rx: [1, 2, 3, 4, 5, 6].map((i) => g("--r" + i)) };
    col.cycle = [col.c2, col.c1, col.c5, col.rx[3], col.rx[5]];
  }

  // ---------- canvas helpers ----------
  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: canvas.clientWidth, h: canvas.clientHeight };
  }
  function font(ctx, px) { ctx.font = px + "px " + col.sans; }
  const minus = (n) => String(n).replace("-", "−");
  // canvas labels use ^{...} for raised text, drawn smaller by drawRich
  function pow10Label(e) { return e === 0 ? "1" : "10^{" + minus(e) + "}"; }
  // HTML number with a real superscript exponent
  function fmtSci(v, d) {
    if (!(v > 0)) return "0";
    const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
    return m.toFixed(d) + " × 10<sup>" + minus(e) + "</sup>";
  }
  // Draw text with ^{...} superscripts. Alignment and baseline follow the context's
  // current textAlign ("left", "center", "right") and textBaseline.
  function drawRich(ctx, s, x, y, px) {
    const parts = []; const re = /\^\{([^}]*)\}/g; let last = 0, m;
    while ((m = re.exec(s))) { if (m.index > last) parts.push([s.slice(last, m.index), false]); parts.push([m[1], true]); last = re.lastIndex; }
    if (last < s.length) parts.push([s.slice(last), false]);
    const small = Math.round(px * 0.72), align = ctx.textAlign;
    const widths = parts.map(([t, up]) => { font(ctx, up ? small : px); return ctx.measureText(t).width; });
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    ctx.textAlign = "left";
    parts.forEach(([t, up], i) => {
      font(ctx, up ? small : px);
      ctx.fillText(t, cx, up ? y - px * 0.38 : y);
      cx += widths[i];
    });
    ctx.textAlign = align; font(ctx, px);
  }
  function fmtMix(v) { return (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)) + "×"; }
  function fmtNum(v) { return v >= 1000 ? fmtSci(v, 1) : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : fmtSci(v, 1); }
  function decadeTicks(lo, hi, every) {
    const t = []; for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) if ((e - Math.ceil(lo)) % (every || 1) === 0) t.push({ v: e, l: pow10Label(e) });
    return t;
  }
  function line(ctx, pts, colour, width, dash) {
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath(); let on = false;
    pts.forEach((p) => { if (!p) { on = false; return; } on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; });
    ctx.stroke(); ctx.setLineDash([]);
  }

  // axes with ticks on all four sides; labels beside the axes
  function axes(ctx, box, xr, yr, opt) {
    const { x0, y0, w, h } = box;
    const X = (v) => x0 + (v - xr[0]) / (xr[1] - xr[0]) * w;
    const Y = (v) => y0 + h - (v - yr[0]) / (yr[1] - yr[0]) * h;
    ctx.strokeStyle = col.faint; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w), Math.round(h));
    font(ctx, 12); ctx.fillStyle = col.soft;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    opt.xticks.forEach((t) => {
      const px = Math.round(X(t.v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, y0 + h); ctx.lineTo(px, y0 + h - 5); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + 5); ctx.stroke();
      drawRich(ctx, t.l, px, y0 + h + 5 + (t.l.indexOf("^{") >= 0 ? 4 : 0), 12);
    });
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    opt.yticks.forEach((t) => {
      const py = Math.round(Y(t.v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + 5, py); if (!opt.rightAxis) { ctx.moveTo(x0 + w, py); ctx.lineTo(x0 + w - 5, py); } ctx.stroke();
      drawRich(ctx, t.l, x0 - 6, py + (t.l.indexOf("^{") >= 0 ? 2 : 0), 12);
    });
    font(ctx, 13); ctx.fillStyle = col.ink;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    drawRich(ctx, opt.xlabel, x0 + w / 2, y0 + h + 40, 13);
    ctx.save(); ctx.translate(x0 - opt.ylabelOffset, y0 + h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "top"; drawRich(ctx, opt.ylabel, 0, 4, 13); ctx.restore();
    return { X, Y };
  }
  // turn runs of Unicode superscript digits into <sup> for even rendering in HTML
  const SUPDIG = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const supHtml = (s) => s.replace(/[⁰¹²³⁴-⁹]+/g, (r) => "<sup>" + r.split("").map((c) => SUPDIG.indexOf(c)).join("") + "</sup>");
  function legendItem(it) {
    if (it.html) return it.html;
    if (it.title) return '<span class="lg-title">' + it.title + "</span>";
    if (it.svgDash) return '<span><svg class="lg-dash" width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" stroke-width="2" stroke-dasharray="' + it.svgDash + '"/></svg>' + supHtml(it.l) + "</span>";
    return '<span><i' + (it.cls ? ' class="' + it.cls + '"' : "") + ' style="--c:' + it.c + '"></i>' + supHtml(it.l) + "</span>";
  }
  function setLegend(id, items) { $(id).innerHTML = items.map(legendItem).join(""); }
  const htmlLabel = (s) => s.replace("M☉", "M<sub>☉</sub>");

  // ---------- state ----------
  // The run is computed in the background in short slices; a snapshot is kept every
  // SNAP seconds, and the playback bar shows any computed snapshot.
  const SNAP = 5;
  let model = null, snaps = [], view = null, playT = 0, playing = true, lastTs = null, fluxTop = -Infinity, finalVals = null;
  const ui = { mix: $("mix"), mdot: $("mdot"), downturn: $("downturn"), play: $("play"), scrub: $("tScrub") };
  // the leftmost position of the ingestion slider is no ingestion at all
  const mdotOf = (v) => (+v <= -5.45 ? 0 : Math.pow(10, +v));
  const settings = () => ({ mix: Math.pow(10, +ui.mix.value), mdot: mdotOf(ui.mdot.value), downturn: ui.downturn.checked });
  const copy = (a) => Float64Array.from(a);
  function snapshot() {
    const s = { t: model.t, x: model.x, T: model.T, C: copy(model.C), E: copy(model.E),
      Y: { k39: copy(model.Y.k39), k40: copy(model.Y.k40) }, flux: model.flux.map(copy) };
    let fmax = 0; s.flux.forEach((f) => f.forEach((v) => { fmax = Math.max(fmax, v); }));
    if (fmax > 0) fluxTop = Math.max(fluxTop, Math.ceil(Math.log10(fmax)));
    snaps.push(s);
  }
  function restart() {
    model = CRN.makeModel(settings()); snaps = []; fluxTop = -Infinity; finalVals = null;
    snapshot(); playT = 0; view = snaps[0];
    $("mixOut").textContent = fmtMix(settings().mix);
    $("mdotOut").innerHTML = (settings().mdot > 0 ? fmtSci(settings().mdot, 1) : "0") + " M<sub>☉</sub>/s";
    setPlaying(true); draw();
  }
  function setPlaying(p) {
    playing = p;
    ui.play.setAttribute("aria-label", p ? "Pause" : "Play");
    ui.play.innerHTML = p ? '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/></svg>'
                          : '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2 L14 8 L4 14 Z" fill="currentColor"/></svg>';
  }
  function computeSlice(budgetMs) {
    const t0 = performance.now(), dt = model.dtAuto();
    while (model.t < T_END - 1e-9 && performance.now() - t0 < budgetMs) {
      const next = Math.min(T_END, (Math.floor(model.t / SNAP + 1e-9) + 1) * SNAP);
      while (model.t < next - 1e-9) model.step(Math.min(dt, next - model.t));
      snapshot();
    }
    if (!finalVals && model.t >= T_END - 1e-9) {
      const k40 = model.yieldK40(), k39 = model.mean(model.Y.k39);
      finalVals = { ratio: k40 / k39, k40mass: k40 * CRN.SHELL_MASS, shares: model.destructionShares() };
      readouts();
    }
  }
  function showAt(t) {
    const i = Math.min(snaps.length - 1, Math.max(0, Math.floor(t / SNAP + 1e-9)));
    view = snaps[i];
    ui.scrub.value = String(view.t); $("tOut").textContent = Math.round(view.t) + " s";
  }

  // ---------- abundance profiles ----------
  function drawProfile() {
    const cv = $("profile"); const { ctx, w, h } = fit(cv);
    ctx.clearRect(0, 0, w, h);
    const box = { x0: 62, y0: 10, w: w - 62 - 52, h: h - 10 - 50 };
    const yr = [-9, 0];
    const { X, Y } = axes(ctx, box, [0, 1], yr, {
      xticks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, l: v === 0 || v === 1 ? String(v) : v.toFixed(2) })),
      yticks: decadeTicks(yr[0], yr[1], 3), xlabel: "Position in the shell", ylabel: "Mass fraction", ylabelOffset: 54, rightAxis: true });
    const N = CRN.N, x = view.x;
    ctx.save(); ctx.beginPath(); ctx.rect(box.x0, box.y0, box.w, box.h); ctx.clip();
    let emax = 0; for (let i = 0; i < N; i++) emax = Math.max(emax, view.E[i]);
    if (emax > 0) {
      ctx.fillStyle = col.c3; ctx.beginPath(); ctx.moveTo(X(0), Y(yr[0]));
      for (let i = 0; i < N; i++) ctx.lineTo(X(x[i]), Y(yr[0]) - (view.E[i] / emax) * box.h * 0.45);
      ctx.lineTo(X(1), Y(yr[0])); ctx.closePath(); ctx.fill();
    }
    const tr = [1.2, 2.9], YT = (t) => box.y0 + box.h - (t - tr[0]) / (tr[1] - tr[0]) * box.h;
    line(ctx, Array.from(x, (xi, i) => [X(xi), YT(view.T[i])]), col.c4, 1.5, [6, 4]);
    [[view.C, col.c1], [view.Y.k39, col.c5], [view.Y.k40, col.c2]].forEach(([arr, c]) => {
      line(ctx, Array.from(arr, (v, i) => v > 1e-12 ? [X(x[i]), Y(Math.log10(v))] : null), c, 2.5);
    });
    ctx.restore();
    font(ctx, 12); ctx.fillStyle = col.soft; ctx.strokeStyle = col.faint; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    [1.5, 2.0, 2.5].forEach((t) => { const py = Math.round(YT(t)) + 0.5; ctx.beginPath(); ctx.moveTo(box.x0 + box.w - 5, py); ctx.lineTo(box.x0 + box.w, py); ctx.stroke(); ctx.fillText(t.toFixed(1), box.x0 + box.w + 6, py); });
    font(ctx, 13); ctx.fillStyle = col.ink; ctx.save(); ctx.translate(box.x0 + box.w + 34, box.y0 + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("Temperature (GK)", 0, 0); ctx.restore();
  }

  // ---------- reaction fluxes across the shell ----------
  function drawFlux() {
    const cv = $("fluxPlot"); const { ctx, w, h } = fit(cv);
    ctx.clearRect(0, 0, w, h);
    const box = { x0: 62, y0: 10, w: w - 62 - 52, h: h - 10 - 50 };
    let fmax = 0; // the range covers the whole computed run, so the axes stay still while it plays
    const top = isFinite(fluxTop) ? fluxTop : -6, yr = [top - 7, top];
    const { X, Y } = axes(ctx, box, [0, 1], yr, {
      xticks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, l: v === 0 || v === 1 ? String(v) : v.toFixed(2) })),
      yticks: decadeTicks(yr[0], yr[1], 1), xlabel: "Position in the shell", ylabel: "Reaction flux (s^{−1})", ylabelOffset: 54, rightAxis: true });
    ctx.save(); ctx.beginPath(); ctx.rect(box.x0, box.y0, box.w, box.h); ctx.clip();
    view.flux.forEach((f, j) => {
      // producing reactions solid, destroying reactions dashed
      line(ctx, Array.from(f, (v, i) => v > 0 ? [X(view.x[i]), Y(Math.log10(v))] : null), col.rx[j], j < 2 ? 2.5 : 2, j < 2 ? [] : [6, 3]);
    });
    // local Damkoehler number for 40K: shell mixing time over the time 40K takes to be destroyed here
    const dr = [-2, 2], YD = (v) => box.y0 + box.h - (v - dr[0]) / (dr[1] - dr[0]) * box.h;
    const tauMix = CRN.TAU_MIX_1X / settings().mix;
    ctx.strokeStyle = col.faint; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(box.x0, Math.round(YD(0)) + 0.5); ctx.lineTo(box.x0 + box.w, Math.round(YD(0)) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    const da = Array.from(view.x, (x, i) => {
      const k = view.Y.k40[i]; if (!(k > 0)) return null;
      const lam = (view.flux[2][i] + view.flux[3][i] + view.flux[4][i] + view.flux[5][i]) / k;
      return lam > 0 ? [X(x), YD(Math.log10(tauMix * lam))] : null;
    });
    line(ctx, da, col.ink, 2.2, [1.5, 3]);
    ctx.restore();
    // right axis for the Damkoehler number
    font(ctx, 12); ctx.fillStyle = col.soft; ctx.strokeStyle = col.faint; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (let e = dr[0]; e <= dr[1]; e += 1) {
      const py = Math.round(YD(e)) + 0.5;
      ctx.beginPath(); ctx.moveTo(box.x0 + box.w - 5, py); ctx.lineTo(box.x0 + box.w, py); ctx.stroke();
      drawRich(ctx, e === 0 ? "1" : "10^{" + minus(e) + "}", box.x0 + box.w + 6, py + (e === 0 ? 0 : 2), 12);
    }
    font(ctx, 13); ctx.fillStyle = col.ink; ctx.save(); ctx.translate(box.x0 + box.w + 40, box.y0 + box.h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "top"; drawRich(ctx, "^{40}K Damköhler number", 0, 0, 13); ctx.restore();
  }

  // static numbers from the end of the run
  function readouts() {
    $("rK40").innerHTML = finalVals ? fmtSci(finalVals.k40mass, 2) + " M<sub>☉</sub>" : "–";
    $("rRatio").innerHTML = finalVals ? fmtNum(finalVals.ratio) : "–";
    // over the whole run: the one reaction that makes 40K, and the share of the 40K destroyed by each reaction
    if (finalVals) {
      const d = R.filter((r) => r.from === "k40").map((r) => [r, finalVals.shares[r.id] || 0]).sort((a, b) => b[1] - a[1]);
      $("domReac").innerHTML = supHtml(d[0][0].label);   // the explanation names the top destroyer of this run
      $("rReac").innerHTML = "Made by " + supHtml(R[1].label) + ". Destroyed by " +
        d.filter(([, s]) => s >= 0.01).map(([r, s]) => supHtml(r.label) + " (" + Math.round(100 * s) + "%)").join(", ") + ".";
    } else $("rReac").textContent = "–";
  }

  function draw() { if (view) { drawProfile(); drawFlux(); } readouts(); }

  // ---------- animation ----------
  function frame(ts) {
    const dtReal = lastTs == null ? 1 / 60 : Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    computeSlice(6);
    if (playing) {
      playT = Math.min(playT + dtReal * MODEL_SECONDS_PER_SECOND, snaps[snaps.length - 1].t);
      if (playT >= T_END - 1e-9) setPlaying(false);
    }
    showAt(playT); drawProfile(); drawFlux();
    requestAnimationFrame(frame);
  }

  // ---------- wiring ----------
  ui.mix.addEventListener("input", restart);
  ui.mdot.addEventListener("input", restart);
  ui.downturn.addEventListener("change", restart);
  ui.play.addEventListener("click", () => {
    if (!playing && playT >= T_END - 1e-9) playT = 0;
    setPlaying(!playing);
  });
  ui.scrub.addEventListener("input", () => { setPlaying(false); playT = +ui.scrub.value; });
  let rT = null;
  window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(draw, 80); });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColours(); draw(); });

  readColours();
  setLegend("fluxLegend", R.map((r, j) => ({ c: col.rx[j], l: r.label, cls: j < 2 ? "" : "dash" })));
  $("fluxLegend").innerHTML += '<span><svg class="lg-dash" width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" stroke-width="2.2" stroke-dasharray="1.5 3"/></svg><sup>40</sup>K Damköhler number</span>';
  restart();
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  requestAnimationFrame(frame);
})();
