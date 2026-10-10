/*
 * Escena «Semilla estelar» — una semilla de luz que germina en una red de neuronas.
 *
 * Guion visual (15 s en el Reel; los estáticos usan t≥12, con todo crecido):
 *   0–2,7 s   una semilla dorada late en la oscuridad; la cámara se acerca a ella.
 *   2,7 s     germinación: onda de choque, destello y el tallo empieza a subir.
 *   4–10 s    cuatro ramas Trinity (Zenith, Horizonte, Lógica, Anchor) se abren y se ramifican en una red de
 *             neuronas con raíces simétricas; los nodos se encienden al llegar el crecimiento.
 *   6,4–9,7 s cada rama «se ilumina» cuando el guion nombra su camino (params.pilares_t, uno por rama).
 *   10–15 s   la cámara se aleja y gira despacio; pulsos de señal recorren la red al ritmo del audio.
 *
 * ADN: Trinity sobre negro azulado, cristal líquido (halo suave), biomimético (ramificación con ángulos
 * de ~40° y razón de longitudes 0,58). Todo con rng de semilla: mismo número → mismo árbol.
 */
import { crearDestellos, crearCintas, crearFondoEstelar, crearNebulosas, lin, latido, smooth, mix, easeInOut, easeOutCubic, clamp, TAU } from "./_comun.js";

export function crear(ctx) {
  const { THREE, paleta, params } = ctx;
  const rng = ctx.rng;
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(36, ctx.aspecto, 0.1, 80);
  const T_G = params.germinacion === undefined ? 2.7 : params.germinacion;
  const escalaT = (ctx.duracion || 15) / 15; // los guiones más largos estiran el crecimiento
  const pilaresT = params.pilares_t || [6.4, 7.5, 8.6, 9.7];
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Árbol de neuronas ──
  const colLimbos = [paleta.zenith, paleta.horizonte, paleta.logica, paleta.anchor].map((h) => lin(THREE, h, 1.0));
  const dorado = lin(THREE, "#FFE2A0", 1.0);
  const ramas = [];
  const nodos = [];
  const SEMILLA = vec(0, -2.25, 0);
  const DIV = vec(0, -0.25, 0);

  function rotar(d, eje, ang) { return d.clone().applyAxisAngle(eje.clone().normalize(), ang); }
  function perpAleatorio(d) {
    const a = vec(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d);
    return a.lengthSq() < 1e-4 ? vec(1, 0, 0) : a.normalize();
  }
  function rama(origen, dir, largo, nivel, inicio, dur, color, pilar, fase) {
    const n = 5;
    const pts = [origen.clone()];
    let p = origen.clone();
    let d = dir.clone();
    for (let i = 1; i <= n; i++) {
      d = rotar(d, perpAleatorio(d), (rng() - 0.5) * 0.28);
      d.y += 0.045; // ligero fototropismo
      d.normalize();
      p = p.clone().add(d.clone().multiplyScalar(largo / n));
      pts.push(p.clone());
    }
    const ancho = [0.052, 0.078, 0.056, 0.04, 0.028, 0.02][nivel] * (params.grosor || 1);
    const r = { pts, ancho, color, inicio, dur, fase, pilar, nivel };
    ramas.push(r);
    if (nivel >= 3) nodos.push({ pos: pts[n], inicio: inicio + dur * 0.96, color, nivel });
    return r;
  }
  function hijos(padre, nivel, cuantos, razon, fracs, desde) {
    const largoPadre = padre.pts[0].distanceTo(padre.pts[padre.pts.length - 1]);
    for (let i = 0; i < cuantos; i++) {
      const fr = fracs[i % fracs.length];
      const k = Math.min(padre.pts.length - 1, Math.max(1, Math.round(fr * (padre.pts.length - 1))));
      const origen = padre.pts[k];
      const dirPadre = padre.pts[Math.min(k + 1, padre.pts.length - 1)].clone().sub(padre.pts[k - 1]).normalize();
      const ang = (0.55 + rng() * 0.45) * (i % 2 ? 1 : -1);
      const dir = rotar(dirPadre, perpAleatorio(dirPadre), ang).normalize();
      const color = padre.color.map((c, j) => mix(c, dorado[j] * 0.9, 0.12 + rng() * 0.14));
      const inicio = padre.inicio + padre.dur * fr * 0.92 + 0.06;
      const hijo = rama(origen, dir, largoPadre * razon * (0.85 + rng() * 0.3), nivel, inicio, padre.dur * 0.72, color, padre.pilar, rng() * 6);
      if (nivel < desde) hijos(hijo, nivel + 1, nivel === 2 ? 2 : 2, razon, [0.55, 1.0], desde);
    }
  }
  const tallo = rama(SEMILLA, vec(0, 1, 0), 2.0, 0, T_G + 0.15, 1.9 * escalaT, dorado.map((c) => c * 0.75), -1, 0.3);
  tallo.pts.length = 0;
  tallo.pts.push(SEMILLA.clone(), vec(0.04, -1.7, 0), vec(-0.05, -1.2, 0.03), vec(0.04, -0.75, -0.02), DIV.clone());
  for (let i = 0; i < 4; i++) {
    const az = i * (TAU / 4) + 0.5;
    const alfa = 0.9 + rng() * 0.15;
    const dir = vec(Math.sin(alfa) * Math.cos(az), Math.cos(alfa), Math.sin(alfa) * Math.sin(az)).normalize();
    const limbo = rama(DIV, dir, 2.45, 1, T_G + 1.75 * escalaT + i * 0.22, 2.6 * escalaT, colLimbos[i], i, i * 1.3);
    hijos(limbo, 2, 3, 0.62, [0.42, 0.7, 1.0], 5);
  }
  // Raíces: la red también crece hacia abajo (simetría del soma)
  for (let i = 0; i < 6; i++) {
    const az = i * (TAU / 6) + 0.2;
    const dir = vec(Math.sin(2.35) * Math.cos(az), Math.cos(2.35), Math.sin(2.35) * Math.sin(az)).normalize();
    const raiz = rama(SEMILLA, dir, 1.35, 3, T_G + 0.9 + i * 0.12, 2.4 * escalaT, colLimbos[i % 4].map((c) => c * 0.55), -1, i);
    hijos(raiz, 4, 2, 0.6, [0.6, 1.0], 5);
  }
  const cintas = crearCintas(THREE, ramas, { seg: 18, brillo: 1.0, fogNear: 7, fogK: 0.045, pulso: 1.0, pulsoK: 11, pulsoV: 2.2 });
  const SX = params.ancho_arbol || (ctx.aspecto < 0.8 ? 0.52 : ctx.aspecto < 1.3 ? 0.8 : 1.0);
  const SY = params.alto_arbol || (ctx.aspecto < 0.8 ? 0.84 : 1.0);
  cintas.mesh.scale.set(SX, SY, SX);
  escena.add(cintas.mesh);
  cintas.uniforms.uPilarT.value.set(pilaresT[0], pilaresT[1], pilaresT[2], pilaresT[3]);

  // ── Nodos (sinapsis) ──
  const nn = nodos.length + 2;
  const pos = new Float32Array(nn * 3), tam = new Float32Array(nn), col = new Float32Array(nn * 3), ini = new Float32Array(nn);
  nodos.forEach((n, i) => {
    pos.set([n.pos.x, n.pos.y, n.pos.z], i * 3);
    tam[i] = 0.05 + (n.nivel - 3) * 0.018 + rng() * 0.025;
    col.set(n.color.map((c) => c * 1.15), i * 3);
    ini[i] = n.inicio;
  });
  pos.set([DIV.x, DIV.y, DIV.z], (nn - 2) * 3); tam[nn - 2] = 0.22; col.set(dorado.map((c) => c * 0.55), (nn - 2) * 3); ini[nn - 2] = T_G + 1.9 * escalaT;
  pos.set([SEMILLA.x, SEMILLA.y, SEMILLA.z], (nn - 1) * 3); tam[nn - 1] = 0.3; col.set(dorado.map((c) => c * 0.5), (nn - 1) * 3); ini[nn - 1] = -1;
  const nodosGl = crearDestellos(THREE, { n: nn, pos, tam, color: col, inicio: ini, halo: 3.0, nucleo: 14, nucleoK: 1.8, tw: 0.3, fogNear: 7, fogK: 0.045, latidoK: 0.25 });
  nodosGl.mesh.scale.set(SX, SY, SX);
  escena.add(nodosGl.mesh);

  // ── Partículas flotantes (esporas de luz) ──
  const NP = ctx.calidad === "borrador" ? 140 : 340;
  const pp = new Float32Array(NP * 3), pt = new Float32Array(NP), pc = new Float32Array(NP * 3), pi = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const r = 1.2 + rng() * 5.2, th = rng() * TAU;
    pp.set([Math.cos(th) * r, -2.8 + rng() * 6.8, Math.sin(th) * r - 1], i * 3);
    pt[i] = 0.035 + rng() * 0.07;
    const c = [colLimbos[Math.floor(rng() * 4)], dorado][rng() < 0.65 ? 0 : 1];
    pc.set(c.map((v) => v * (0.25 + rng() * 0.4)), i * 3);
    pi[i] = T_G + 2 + rng() * 6;
  }
  const esporas = crearDestellos(THREE, { n: NP, pos: pp, tam: pt, color: pc, inicio: pi, halo: 2.6, nucleo: 18, nucleoK: 1.4, tw: 0.5, fogNear: 6, fogK: 0.05 });
  escena.add(esporas.mesh);

  // ── Fondo ──
  const estrellas = crearFondoEstelar(THREE, ctx, { n: ctx.calidad === "borrador" ? 120 : 280, radio: 30, escala: 1.0, brillo: 0.9 });
  escena.add(estrellas.mesh);
  const neb = crearNebulosas(THREE, ctx, [
    { pos: [-4.5, 2.0, -14], tam: 20, color: paleta.zenith, k: 0.11 },
    { pos: [5.5, -3.0, -15], tam: 18, color: paleta.horizonte, k: 0.04 },
    { pos: [0.0, 6.0, -17], tam: 16, color: paleta.zenith, k: 0.06 },
  ]);
  escena.add(neb.mesh);

  // ── La semilla (cuerpo) y la onda de germinación ──
  const semillaMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uEncendido: { value: 1 }, uOro: { value: new THREE.Vector3(...dorado) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `precision highp float; varying vec3 vN; varying vec3 vV; uniform float uT; uniform float uEncendido; uniform vec3 uOro;
      void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.2); float lat = 0.75 + 0.25 * sin(uT * 3.1); vec3 c = uOro * (0.10 + 1.15 * f) * lat * uEncendido; gl_FragColor = vec4(c, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const semilla = new THREE.Mesh(new THREE.SphereGeometry(0.15, 40, 28), semillaMat);
  semilla.scale.set(0.82, 1.32, 0.82);
  semilla.position.set(0, SEMILLA.y * SY, 0);
  escena.add(semilla);

  const ondaMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uA: { value: 0 }, uC: { value: new THREE.Vector3(...dorado) }, uW: { value: 0.05 }, uS: { value: 3.4 } },
    vertexShader: `varying vec2 vUv; uniform float uS; void main(){ vUv = position.xy; gl_Position = projectionMatrix * (modelViewMatrix * vec4(0.,0.,0.,1.) + vec4(position.xy * uS, 0., 0.)); }`,
    fragmentShader: `precision highp float; varying vec2 vUv; uniform float uR; uniform float uA; uniform vec3 uC; uniform float uW;
      void main(){ float r = length(vUv) * 2.0; float x = (r - uR) / uW; float g = exp(-x * x) * uA * (1.0 - 0.7 * uR); g += exp(-r * r * 16.0) * uA * 0.4 * smoothstep(0.7, 0.0, uR); gl_FragColor = vec4(uC * g * 1.15, 1.0); }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const onda = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ondaMat);
  onda.position.set(0, SEMILLA.y * SY, 0);
  onda.frustumCulled = false;
  escena.add(onda);

  const pulsos = ctx.audio.pulsos || [];
  const Z = params.zoom || 1;
  // Encuadre: el árbol mide ~6,5 unidades de alto; más horizontal = más lejos para que la copa no se corte
  const rFinal = params.r_final || (ctx.aspecto > 1.3 ? 16.5 : ctx.aspecto > 0.8 ? 14.5 : 12.2);
  const objetivo = vec(0, 0, 0);

  return {
    escena, camara,
    post: { umbral: 0.55, pesos: [0.5, 0.42, 0.34], exposicion: 0.95, aberracion: 0.010, vineta: 0.5, grano: 0.014 },
    fundido(t) { return smooth(0, 0.55, t) * (ctx.modoEstatico ? 1 : 1 - smooth(ctx.duracion - 0.35, ctx.duracion, t)); },
    actualizar(t) {
      const lat = latido(pulsos, t, 0.3);
      const c = cintas.uniforms, n = nodosGl.uniforms;
      c.uT.value = t; c.uLatido.value = lat * 0.5; n.uT.value = t; n.uLatido.value = lat; esporas.uniforms.uT.value = t; estrellas.uniforms.uT.value = t; neb.uniforms.uT.value = t;
      // Cámara: del primer plano de la semilla a la vista completa de la red
      const u = easeInOut(smooth(2.4, 13.5, t));
      const r = mix(3.8, rFinal, u) * Z;
      const ty = mix(-1.15, params.ty_final === undefined ? -0.55 : params.ty_final, u);
      const yaw = 0.18 * Math.sin(t * 0.26) + t * 0.032 - 0.1;
      camara.position.set(Math.sin(yaw) * r, mix(-1.85, ty + 0.5, u) + Math.sin(t * 0.4) * 0.05, Math.cos(yaw) * r);
      objetivo.set(0, ty, 0);
      camara.lookAt(objetivo);
      // Semilla
      const g = smooth(T_G - 0.2, T_G + 0.9, t);
      semillaMat.uniforms.uT.value = t;
      semillaMat.uniforms.uEncendido.value = mix(1.0, 0.0, g) + lat * 0.25 * (1 - g);
      semilla.scale.set(0.82 * (1 + 0.05 * Math.sin(t * 3.1)), 1.32 * (1 + 0.04 * Math.sin(t * 3.1)), 0.82);
      semilla.rotation.y = t * 0.4;
      // Onda de choque en la germinación
      const dtG = t - T_G;
      const w = clamp(dtG / 1.25);
      ondaMat.uniforms.uR.value = easeOutCubic(w) * 0.9;
      ondaMat.uniforms.uA.value = dtG >= 0 ? (1 - w) * (1 - w) : 0;
      ondaMat.uniforms.uW.value = 0.05 + w * 0.06;
      onda.quaternion.copy(camara.quaternion);
      // Destello de germinación: el nodo semilla (último) late más fuerte
      n.uBrillo.value = 1 + 1.4 * Math.exp(-Math.max(0, dtG) * 2.2) * (dtG >= 0 ? 1 : 0);
    },
  };
}
