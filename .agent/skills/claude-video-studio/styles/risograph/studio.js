// studio.js: one clock for the whole piece (hack 4).
// Load it after GSAP and before your scene script.
// Your scene calls STUDIO.play(render). render(t) must draw the WHOLE frame from t alone.
// Same t in, same picture out. That makes renders exact, seekable, and loopable.
(function () {
  // works from <head> or <body>: the root is looked up the first time it is needed
  const R = () => document.querySelector('[data-composition-id]');
  const num = (k) => +R().dataset[k];
  const cache = {};
  const S = {
    get root() { return R(); },
    get D() { return num('duration'); },
    get W() { return num('width'); },
    get H() { return num('height'); },
    get V() { return S.H > S.W; },               // true for 9:16
    get u() { return Math.min(S.W, S.H) / 1080; }, // 1 unit = 1 px at a 1080 short side
    ease(name) { return cache[name] || (cache[name] = name === 'none' ? (p) => p : gsap.parseEase(name)); },
    // eased 0..1 progress of a move that starts at `start` and lasts `dur`
    seg(t, start, dur, ease) {
      const p = Math.min(1, Math.max(0, (t - start) / dur));
      return S.ease(ease || 'power3.out')(p);
    },
    mix(a, b, p) { return a + (b - a) * p; },
    // a wave that always loops: use whole-number cycles
    wave(t, cycles, offset) { return Math.sin(2 * Math.PI * ((cycles || 1) * t / S.D + (offset || 0))); },
    // seeded random numbers (never use Math.random in a render)
    rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // one clock drives everything; loop:true wraps t so t = D draws the same frame as t = 0
    play(render, opts) {
      const loop = !opts || opts.loop !== false;
      const D = S.D, root = S.root;
      const clock = { t: 0 };
      const tl = gsap.timeline({ paused: true });
      // loop_check.py sets STUDIO_NO_WRAP so it can prove render(end) really equals render(0)
      const wrap = loop && !window.STUDIO_NO_WRAP;
      const draw = () => render(wrap ? clock.t % D : clock.t);
      tl.to(clock, { t: D, duration: D, ease: 'none', onUpdate: draw }, 0);
      draw();
      // fonts can arrive after the first draw; draw again so text measured from them is right,
      // even on frame 0 (seeking to the time you are already at does not redraw)
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      window.addEventListener('load', draw);
      window.__timelines = window.__timelines || {};
      window.__timelines[root.dataset.compositionId] = tl;
      return tl;
    },
  };
  window.STUDIO = S;
})();
