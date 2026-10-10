/*
 * Escena «Malla viva» — una red P2P que nace sin centro.
 *
 * Cuatro comunidades (Zenith, Horizonte, Lógica, Anchor) brotan en puntos distintos; cada nodo se enciende y
 * extiende enlaces hacia sus vecinos; después los puentes entre comunidades unen toda la malla. No hay un nodo
 * central: la red se sostiene por sus conexiones (por eso el aspecto de constelación, no de árbol).
 *   0–3 s    brotan las cuatro comunidades.   3–8 s  se tejen los enlaces dentro de cada una.
 *   8–13 s   los puentes unen la malla; la cámara se abre y gira.   Siempre: pulsos de señal por los enlaces.
 * params: pilares_t [4] (cada comunidad se ilumina cuando el guion la nombra), r_final, ty_final, nodos, escala_malla.
 */
import { crearDestellos, crearCintas, crearFondoEstelar, crearNebulosas, lin, latido, smooth, mix, easeInOut, clamp, distancia, TAU } from "./_comun.js";

export function crear(ctx) {
  const { THREE, paleta, params } = ctx;
  const rng = ctx.rng;
  const escena = new THREE.Scene();
  const FOV = 36;
  const camara = new THREE.PerspectiveCamera(FOV, ctx.aspecto, 0.1, 100);
  const escalaT = (ctx.duracion || 15) / 15;
  const pilaresT = params.pilares_t || [5.2, 6.6, 8.0, 9.4];
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const cols = [paleta.zenith, paleta.horizonte, paleta.logica, paleta.anchor].map((h) => lin(THREE, h, 1.0));
  const blanco = lin(THREE, "#FFF1D0", 1.0);
  const ES = params.escala_malla || 1;
  // Forma de la malla según el encuadre: vertical → apilada; cuadrada → compacta; horizontal → extendida
  const SXm = params.malla_x || (ctx.aspecto < 0.8 ? 0.62 : ctx.aspecto < 1.3 ? 0.9 : 1.3);
  const SYm = params.malla_y || (ctx.aspecto < 0.8 ? 1.55 : ctx.aspecto < 1.3 ? 1.0 : 0.9);

  // ── Nodos: cuatro comunidades alrededor de un hueco central ──
  const centros = [vec(-2.5, 1.2, 0.5), vec(2.6, 1.5, -0.8), vec(-1.0, -1.9, 1.7), vec(1.7, -1.3, -2.1)];
  const N = params.nodos || (ctx.calidad === "borrador" ? 80 : 128);
  const nodos = [];
  for (let i = 0; i < N; i++) {
    const c = i % 4;
    const g = () => (rng() + rng() + rng() - 1.5) * 1.5;
    const p = centros[c].clone().add(vec(g() * 1.05, g() * 0.85, g() * 1.05));
    const d = p.distanceTo(centros[c]);
    nodos.push({ p, c, inicio: 0.15 + c * 0.45 * escalaT + d * 0.8 * escalaT + rng() * 0.3, grado: 0, tam: 0.075 + rng() * 0.06 });
  }
  const ramas = [];
  const unido = new Set();
  function enlace(a, b, puente) {
    const k = a < b ? a * 1000 + b : b * 1000 + a;
    if (unido.has(k) || a === b) return;
    unido.add(k);
    const A = nodos[a], B = nodos[b];
    nodos[a].grado++; nodos[b].grado++;
    const dir = B.p.clone().sub(A.p);
    const L = dir.length();
    const perp = vec(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(dir).normalize().multiplyScalar(L * (0.03 + rng() * 0.07));
    const pts = [A.p.clone(), A.p.clone().add(dir.clone().multiplyScalar(0.34)).add(perp), A.p.clone().add(dir.clone().multiplyScalar(0.68)).sub(perp.clone().multiplyScalar(0.6)), B.p.clone()];
    const cA = cols[A.c], cB = cols[B.c];
    const color = puente ? blanco.map((v, j) => mix(mix(cA[j], cB[j], 0.5), v, 0.45)) : cA.map((v, j) => mix(v, cB[j], 0.5));
    const inicio = puente ? (6.4 + rng() * 2.2) * escalaT : Math.max(A.inicio, B.inicio) + 0.15 + rng() * 0.4;
    ramas.push({ pts, ancho: puente ? 0.05 : 0.034, color, inicio, dur: (puente ? 1.5 : 0.9) + L * 0.35, fase: rng() * 6, pilar: puente ? -1 : A.c });
  }
  // Vecinos más próximos dentro de la misma comunidad
  for (let a = 0; a < N; a++) {
    const cerca = nodos.map((n, i) => ({ i, d: n.c === nodos[a].c && i !== a ? n.p.distanceTo(nodos[a].p) : 1e9 })).sort((x, y) => x.d - y.d);
    const k = 3 + (rng() < 0.4 ? 1 : 0);
    for (let j = 0; j < k; j++) if (cerca[j].d < 1e8) enlace(a, cerca[j].i, false);
  }
  // Puentes entre comunidades: los pares más cercanos de cada pareja
  for (let c1 = 0; c1 < 4; c1++) for (let c2 = c1 + 1; c2 < 4; c2++) {
    const pares = [];
    nodos.forEach((n, i) => { if (n.c === c1) nodos.forEach((m, j) => { if (m.c === c2) pares.push({ i, j, d: n.p.distanceTo(m.p) }); }); });
    pares.sort((x, y) => x.d - y.d);
    const tomados = new Set();
    let hechos = 0;
    for (const q of pares) { if (hechos >= 3) break; if (tomados.has(q.i) || tomados.has(q.j)) continue; tomados.add(q.i); tomados.add(q.j); enlace(q.i, q.j, true); hechos++; }
  }
  const cintas = crearCintas(THREE, ramas, { seg: 16, brillo: 1.35, fogNear: 6, fogK: 0.035, pulso: 1.0, pulsoK: 9, pulsoV: 2.0 });
  cintas.uniforms.uPilarT.value.set(pilaresT[0], pilaresT[1], pilaresT[2], pilaresT[3]);
  const grupo = new THREE.Group();
  grupo.scale.set(ES * SXm, ES * SYm, ES * SXm);
  grupo.add(cintas.mesh);

  // ── Nodos (destellos); los nodos con más enlaces son más grandes ──
  const pos = new Float32Array(N * 3), tam = new Float32Array(N), col = new Float32Array(N * 3), ini = new Float32Array(N);
  nodos.forEach((n, i) => {
    pos.set([n.p.x, n.p.y, n.p.z], i * 3);
    tam[i] = n.tam + Math.min(n.grado, 7) * 0.02;
    col.set(cols[n.c].map((v, j) => mix(v, blanco[j], 0.18) * 1.1), i * 3);
    ini[i] = n.inicio;
  });
  const nodosGl = crearDestellos(THREE, { n: N, pos, tam, color: col, inicio: ini, halo: 3.0, nucleo: 14, nucleoK: 1.9, tw: 0.3, fogNear: 6, fogK: 0.035, latidoK: 0.3 });
  grupo.add(nodosGl.mesh);
  escena.add(grupo);

  // ── Anillos tenues de profundidad (órbitas de la malla) ──
  const anillos = [];
  [[6.3, 0.35, 0.2], [8.2, -0.5, 0.9]].forEach(([r, inc, rot], k) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; pts.push(vec(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const m = crearCintas(THREE, [{ pts, ancho: 0.012, color: lin(THREE, k ? paleta.horizonte : paleta.zenith, 0.5), inicio: 0.3 + k * 0.4, dur: 5, fase: k, pilar: -1 }], { seg: 96, brillo: 0.5, pulso: 0.5, pulsoK: 6, pulsoV: 0.8, fogNear: 1e3, fogK: 0 });
    m.mesh.rotation.set(inc, rot, 0.1);
    escena.add(m.mesh); anillos.push(m);
  });

  // ── Fondo y esporas ──
  const estrellas = crearFondoEstelar(THREE, ctx, { n: ctx.calidad === "borrador" ? 120 : 260, radio: 30, brillo: 0.9 });
  escena.add(estrellas.mesh);
  const neb = crearNebulosas(THREE, ctx, [
    { pos: [-5, 2, -14], tam: 20, color: paleta.zenith, k: 0.1 }, { pos: [6, -3, -15], tam: 18, color: paleta.horizonte, k: 0.045 }, { pos: [0, 5, -17], tam: 16, color: paleta.logica, k: 0.025 },
  ]);
  escena.add(neb.mesh);
  const NP = ctx.calidad === "borrador" ? 120 : 300;
  const pp = new Float32Array(NP * 3), pt = new Float32Array(NP), pc = new Float32Array(NP * 3), pi = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const r = 2 + rng() * 6.5, th = rng() * TAU;
    pp.set([Math.cos(th) * r, -3.5 + rng() * 7, Math.sin(th) * r - 1], i * 3);
    pt[i] = 0.03 + rng() * 0.06;
    pc.set(cols[Math.floor(rng() * 4)].map((v) => v * (0.2 + rng() * 0.35)), i * 3);
    pi[i] = 1 + rng() * 6;
  }
  const esporas = crearDestellos(THREE, { n: NP, pos: pp, tam: pt, color: pc, inicio: pi, halo: 2.6, nucleo: 18, nucleoK: 1.3, tw: 0.5, fogNear: 6, fogK: 0.04 });
  escena.add(esporas.mesh);

  const pulsos = ctx.audio.pulsos || [];
  const rFinal = params.r_final || distancia(5.0 * ES * Math.max(SXm, SYm * 0.62), ctx.aspecto, FOV, 1.0);
  const tyFinal = params.ty_final === undefined ? 0 : params.ty_final;
  const objetivo = vec(0, 0, 0);
  const inicioMira = centros[0].clone().multiply(vec(ES * SXm, ES * SYm, ES * SXm)).multiplyScalar(0.8);

  return {
    escena, camara,
    post: { umbral: 0.5, pesos: [0.52, 0.42, 0.34], exposicion: 0.98, aberracion: 0.009, vineta: 0.5, grano: 0.014 },
    fundido(t) { return smooth(0, 0.5, t) * (ctx.modoEstatico ? 1 : 1 - smooth(ctx.duracion - 0.35, ctx.duracion, t)); },
    actualizar(t) {
      const lat = latido(pulsos, t, 0.3);
      cintas.uniforms.uT.value = t; cintas.uniforms.uLatido.value = lat * 0.5;
      nodosGl.uniforms.uT.value = t; nodosGl.uniforms.uLatido.value = lat;
      esporas.uniforms.uT.value = t; estrellas.uniforms.uT.value = t; neb.uniforms.uT.value = t;
      anillos.forEach((a) => { a.uniforms.uT.value = t; });
      const u = easeInOut(smooth(0.6, (ctx.duracion || 15) - 1.5, t));
      const r = mix(rFinal * 0.42, rFinal, u);
      const yaw = -0.5 + u * 1.05 + 0.1 * Math.sin(t * 0.3);
      const elev = mix(0.16, 0.34, u) + 0.04 * Math.sin(t * 0.37);
      camara.position.set(Math.sin(yaw) * r * Math.cos(elev), Math.sin(elev) * r + tyFinal, Math.cos(yaw) * r * Math.cos(elev));
      objetivo.set(mix(inicioMira.x, 0, u), mix(inicioMira.y, tyFinal, u), mix(inicioMira.z, 0, u));
      camara.lookAt(objetivo);
      grupo.rotation.y = t * 0.03;
    },
  };
}
