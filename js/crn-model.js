// Toy convective-reactive nucleosynthesis model of an oxygen-burning shell
// that ingests carbon-shell material through its upper boundary, with a small
// potassium network.
//
// One radial dimension, x = 0 at the shell base (hot) to x = 1 at the top (cool).
// Mixing is diffusion, as in 1D stellar codes. Optionally the mixing decreases
// towards the bottom boundary, following Jones et al. (2017, Eq. 4):
// D = (1/3) v_MLT min(l, r - r0), as used in Issa et al. (2026).
//
// 12C + 12C releases protons and neutrons. Their abundances are taken to follow
// the local 12C burning rate (they are captured within a fraction of a second),
// so every capture rate below is (rate factor of T) x (local 12C burning rate).
// The paths follow Issa et al. (2026, ApJ 997, 314):
//   38Ar(p,g)39K   39K(n,g)40K   40K(n,g)41K   40K(p,n)40Ca   40K(p,g)41Ca
// plus the photodisintegration 40K(g,n)39K near the hot base.
// The rate factors are invented to show the behaviour; they are not nuclear data.
(function (root) {
  "use strict";

  const N = 120;                 // zones
  const DX = 1 / N;
  const SHELL_MASS = 0.45;       // Msun, used to turn Msun/s into a fraction of the shell per s
  const TAU_MIX_1X = 200;        // s, shell-crossing mixing time for mixing factor 1
  const XC_INFLOW = 0.1;         // 12C mass fraction of the ingested carbon-shell material
  const T_END = 1000;            // s, length of one run
  const L_MIX = 0.35;            // mixing length as a fraction of the shell, for the downturn
  const X0 = { ar38: 8.84e-3, k39: 1.2e-5, k40: 1.4e-8 };   // initial O-shell mass fractions (39K, 40K as in the paper's no-merger case)

  function T9(x) { return 1.3 + 1.5 * Math.pow(1 - x, 1.6); }   // GK, hot at the base

  // 12C + 12C is second order in 12C: dX/dt = -k(T) X^2
  // Rate parameters, tuned (see README) so that the 40K left after a run follows the
  // 15 merger calculations of Issa et al. (2026) across mixing and ingestion.
  const P = { K0: 6580, a0: 0.129, n0: 14.7, a1: 0.251, a2: 0.439, a3: 2.68, T3: 2.228, n3: 46.8, a4: 0.0277, a5: 2e-3 };
  const kC = (t) => P.K0 * Math.pow(t / 2.0, 22);
  const lamC = (t, xc) => kC(t) * xc;

  // Reactions. kind "c": capture, rate per target = f(T) * (12C burning rate);
  // kind "g": photodisintegration, rate per target = f(T) in 1/s.
  const REACTIONS = [
    { id: "ar38pg", label: "³⁸Ar(p,γ)³⁹K", from: "ar38", to: "k39", kind: "c", f: (t) => P.a0 * Math.pow(t / 2, P.n0) },
    { id: "k39ng",  label: "³⁹K(n,γ)⁴⁰K",  from: "k39",  to: "k40", kind: "c", f: (t) => P.a1 * Math.pow(t / 2, 1) },
    { id: "k40ng",  label: "⁴⁰K(n,γ)⁴¹K",  from: "k40",  to: null,  kind: "c", f: (t) => P.a2 * Math.pow(t / 2, 1) },
    { id: "k40pn",  label: "⁴⁰K(p,n)⁴⁰Ca",       from: "k40",  to: null,  kind: "c", f: (t) => P.a3 * Math.pow(t / P.T3, P.n3) },
    { id: "k40pg",  label: "⁴⁰K(p,γ)⁴¹Ca",  from: "k40",  to: null,  kind: "c", f: (t) => P.a4 * Math.pow(t / 2.2, 8) },
    { id: "k40gn",  label: "⁴⁰K(γ,n)³⁹K",   from: "k40",  to: "k39", kind: "g", f: (t) => P.a5 * Math.pow(t / 2.8, 40) },
  ];
  const SPECIES = ["ar38", "k39", "k40"];

  function makeModel(opts) {
    const o = Object.assign({ mix: 1, mdot: 4e-4, downturn: true }, opts || {});
    const x = new Float64Array(N), T = new Float64Array(N), KC = new Float64Array(N);
    for (let i = 0; i < N; i++) { x[i] = (i + 0.5) * DX; T[i] = T9(x[i]); KC[i] = kC(T[i]); }
    const RF = REACTIONS.map((r) => Float64Array.from(T, r.f));          // rate factor per zone
    const C = new Float64Array(N), E = new Float64Array(N);
    const Y = {}; SPECIES.forEach((s) => { Y[s] = new Float64Array(N).fill(X0[s]); });
    const flux = REACTIONS.map(() => new Float64Array(N));               // current flux, mass fraction / s
    const fluxInt = new Float64Array(REACTIONS.length);                  // integrated over shell and time
    const Dif = new Float64Array(N + 1);
    const a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N);
    const cp = new Float64Array(N), dp = new Float64Array(N);
    const m = { x, T, C, E, Y, flux, fluxInt, REACTIONS, t: 0, ingested: 0, burned: 0, opts: o };

    function setD() {
      const D0 = o.mix / TAU_MIX_1X;              // in units of (shell width)^2 / s
      for (let i = 0; i <= N; i++) {
        const xi = i * DX;
        // downturn at the bottom boundary: grows linearly over one mixing length
        const f = o.downturn ? Math.max(0.02, Math.min(1, xi / L_MIX)) : 1;
        Dif[i] = (i === 0 || i === N) ? 0 : D0 * f;
      }
    }
    setD();
    m.setOpts = function (p) { Object.assign(o, p); setD(); };
    m.D = Dif;

    // Crank-Nicolson (second order in time), zero-flux walls
    const rhs = new Float64Array(N);
    function diffuse(y, dt) {
      const r = 0.5 * dt / (DX * DX);
      for (let i = 0; i < N; i++) {
        const dl = Dif[i], du = Dif[i + 1];
        a[i] = -r * dl; c[i] = -r * du; b[i] = 1 + r * (dl + du);
        rhs[i] = y[i] * (1 - r * (dl + du)) + (i > 0 ? r * dl * y[i - 1] : 0) + (i < N - 1 ? r * du * y[i + 1] : 0);
      }
      cp[0] = c[0] / b[0]; dp[0] = rhs[0] / b[0];
      for (let i = 1; i < N; i++) {
        const den = b[i] - a[i] * cp[i - 1];
        cp[i] = c[i] / den; dp[i] = (rhs[i] - a[i] * dp[i - 1]) / den;
      }
      y[N - 1] = dp[N - 1];
      for (let i = N - 2; i >= 0; i--) y[i] = dp[i] - cp[i] * y[i + 1];
      for (let i = 0; i < N; i++) if (y[i] < 0) y[i] = 0;   // guard against rare undershoot
    }

    // Burning over dt in every zone: 12C exactly, then the potassium chain with
    // the rates fixed at the mean 12C burning rate of the step, solved implicitly
    // (38Ar first, then 39K and 40K together), which keeps every abundance positive.
    function react(dt) {
      let burned = 0;
      const ar = Y.ar38, k39 = Y.k39, k40 = Y.k40, R = RF;
      for (let i = 0; i < N; i++) {
        // sub-cycle zones where 12C burns fast compared with the step
        const nsub = Math.min(40, 1 + Math.floor(KC[i] * C[i] * dt / 0.05));
        const h = dt / nsub;
        for (let j = 0; j < 6; j++) flux[j][i] = 0;
        for (let s = 0; s < nsub; s++) {
          const c0 = C[i], c1 = c0 / (1 + KC[i] * c0 * h), dc = c0 - c1;
          C[i] = c1; burned += dc * DX;
          const e = dc / h;                                  // 12C burning rate in this substep
          const r0 = R[0][i] * e, r1 = R[1][i] * e, r2 = R[2][i] * e, r3 = R[3][i] * e, r4 = R[4][i] * e, r5 = R[5][i];
          const ar1 = ar[i] / (1 + r0 * h);
          // 39K and 40K are coupled through 40K(g,n)39K: a 2x2 backward-Euler system
          const a11 = 1 + r1 * h, a12 = -r5 * h, a21 = -r1 * h, a22 = 1 + (r2 + r3 + r4 + r5) * h;
          const b1 = k39[i] + r0 * ar1 * h, b2 = k40[i];
          const det = a11 * a22 - a12 * a21;
          const k39n = (b1 * a22 - a12 * b2) / det, k40n = (a11 * b2 - a21 * b1) / det;
          ar[i] = ar1; k39[i] = k39n; k40[i] = k40n;
          const fl = [r0 * ar1, r1 * k39n, r2 * k40n, r3 * k40n, r4 * k40n, r5 * k40n];
          for (let j = 0; j < 6; j++) { flux[j][i] += fl[j] / nsub; fluxInt[j] += fl[j] * h * DX; }
        }
      }
      m.burned += burned;
    }

    // Strang splitting: half a step of burning, a full step of mixing (with the
    // ingested 12C entering the top zone), then the other half step of burning.
    m.step = function (dt) {
      react(dt / 2);
      const src = (o.mdot * XC_INFLOW / SHELL_MASS) * dt;   // 12C added, as a fraction of the shell
      C[N - 1] += src / DX; m.ingested += src;
      diffuse(C, dt); SPECIES.forEach((s) => diffuse(Y[s], dt));
      react(dt / 2);
      for (let i = 0; i < N; i++) E[i] = KC[i] * C[i] * C[i];   // local 12C burning rate
      m.t += dt;
    };
    m.dtAuto = function () { return Math.min(0.1, 1 / o.mix); };
    m.run = function (tEnd, dt) { while (m.t < tEnd - 1e-9) m.step(Math.min(dt, tEnd - m.t)); return m; };
    const mean = (y) => { let s = 0; for (let i = 0; i < N; i++) s += y[i] * DX; return s; };
    m.mean = mean;
    m.yieldK40 = () => mean(Y.k40);
    m.totalC = () => mean(C);
    // where 12C burns, weighted by its burning rate, and the temperature there
    m.burnSite = function () {
      let s = 0, w = 0;
      for (let i = 0; i < N; i++) { s += E[i] * x[i]; w += E[i]; }
      if (w <= 0) return null;
      const xb = s / w; return { x: xb, T9: T9(xb) };
    };
    // Damkoehler number: shell mixing time over the burning time of the shell's
    // mean 12C abundance at 2 GK (the middle of the shell)
    m.damkohler = function () {
      const xc = mean(C); if (!(xc > 0)) return null;
      return (TAU_MIX_1X / o.mix) * lamC(2.0, xc);
    };
    // share of all 40K destruction by each destroying reaction, so far
    m.destructionShares = function () {
      const ids = [2, 3, 4, 5]; let s = 0; ids.forEach((j) => { s += fluxInt[j]; });
      const out = {}; ids.forEach((j) => { out[REACTIONS[j].id] = s > 0 ? fluxInt[j] / s : 0; });
      return out;
    };
    return m;
  }

  function sweep(mixValues, base, tEnd, dt) {
    return mixValues.map((f) => {
      const m = makeModel(Object.assign({}, base, { mix: f }));
      m.run(tEnd, dt || m.dtAuto());
      return { mix: f, k40: m.yieldK40(), k39: m.mean(m.Y.k39), ingested: m.ingested,
        da: m.damkohler(), burnT9: (m.burnSite() || {}).T9, shares: m.destructionShares(),
        fluxInt: Array.from(m.fluxInt) };
    });
  }

  const api = { N, T9, lamC, kC, makeModel, sweep, REACTIONS, TAU_MIX_1X, T_END, X0, P, SHELL_MASS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CRN = api;
})(this);
