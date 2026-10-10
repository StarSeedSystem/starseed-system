/*
 * Escena «Espiral Omnifrecuencias» — una galaxia de luz que vibra a 432 Hz y se expande en anillos.
 *
 * Miles de puntos siguen la espiral de Vogel (ángulo áureo 137,5°), el patrón con que crecen girasoles y galaxias, y
 * giran con rotación diferencial (el centro más rápido que el borde). Cada pulso del audio sintetizado lanza un anillo
 * de onda que se expande por el disco, como una frecuencia que se propaga. Los colores recorren Trinity con el ángulo.
 *   0–3 s    el centro se enciende y la espiral se despliega hacia fuera.   3–15 s  rotación y ondas al ritmo.
 * params: radio, inclinacion, ty, puntos, r_cam, pilares_t (los 4 colores «respiran» en esos instantes).
 */
import { crearDestellos, crearCintas, crearFondoEstelar, crearNebulosas, lin, latido, smooth, mix, easeInOut, easeOutCubic, clamp, distancia, TAU } from "./_comun.js";

export function crear(ctx) {
  const { THREE, paleta, params } = ctx;
  const rng = ctx.rng;
  const escena = new THREE.Scene();
  const FOV = 34;
  const camara = new THREE.PerspectiveCamera(FOV, ctx.aspecto, 0.1, 100);
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const colP = [paleta.zenith, paleta.horizonte, paleta.logica, paleta.anchor];
  const colL = colP.map((h) => lin(THREE, h, 1.0));
  const RAD = params.radio || 4.4;
  const TY = params.ty === undefined ? 0 : params.ty;
  const INC = params.inclinacion === undefined ? 1.0 : params.inclinacion;
  const NP = params.puntos || (ctx.calidad === "borrador" ? 1400 : 3200);
  const ORO = 2.399963229728653; // ángulo áureo en radianes
  const pulsosAudio = ctx.audio.pulsos || [];

  // Tres capas con distinta velocidad angular → cizalla galáctica
  const capas = [];
  const reparto = [0.2, 0.35, 0.45];
  let i0 = 0;
  reparto.forEach((frac, k) => {
    const n = Math.floor(NP * frac);
    const pos = new Float32Array(n * 3), tam = new Float32Array(n), col = new Float32Array(n * 3), ini = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const i = i0 + j;
      const f = Math.sqrt((i + 0.5) / NP); // 0..1 radial
      const r = f * RAD;
      const th = i * ORO;
      const ond = Math.sin(r * 2.2 - 1.0) * 0.18 * f + (rng() - 0.5) * 0.18 * (0.3 + f);
      pos.set([Math.cos(th) * r, ond, Math.sin(th) * r], j * 3);
      const brazo = i % 21 === 0 ? 1 : i % 34 === 0 ? 0.6 : 0;
      tam[j] = (0.045 + 0.09 * rng() * rng() + (1 - f) * 0.03) * (0.85 + 0.5 * (1 - k * 0.2)) * (1 + brazo * 0.9);
      const h = ((th / TAU) * 1.0 + f * 0.35) % 1; // tono por ángulo
      const q = h * 4, a = Math.floor(q) % 4, b = (a + 1) % 4, w = q - Math.floor(q);
      const c = colL[a].map((v, m) => mix(v, colL[b][m], w * w * (3 - 2 * w)));
      const blanco = 0.18 + 0.3 * (1 - f);
      const r1 = rng();
      col.set(c.map((v) => mix(v, 1.0, blanco * (1 - brazo * 0.5)) * (0.34 + 0.8 * r1 * r1) * (1 + brazo * 1.1)), j * 3);
      ini[j] = f * 2.8 + rng() * 0.4;
    }
    i0 += n;
    const g = crearDestellos(THREE, { n, pos, tam, color: col, inicio: ini, halo: 2.8, nucleo: 18, nucleoK: 1.6, tw: 0.35, fogNear: 6, fogK: 0.035, latidoK: 0.28 });
    capas.push({ g, vel: [0.16, 0.1, 0.06][k] });
  });
  const disco = new THREE.Group();
  disco.rotation.x = INC;
  capas.forEach((c) => disco.add(c.g.mesh));
  escena.add(disco);

  // Núcleo luminoso (fuente de la frecuencia)
  const nuc = crearDestellos(THREE, { n: 2, pos: new Float32Array([0, 0, 0, 0, 0, 0]), tam: new Float32Array([0.9, 0.34]), color: new Float32Array([...lin(THREE, "#FFC857", 0.5), ...lin(THREE, "#FFF4D6", 0.55)]), halo: 3.4, nucleo: 26, nucleoK: 1.5, tw: 0.1, fogNear: 1e3, fogK: 0 });
  disco.add(nuc.mesh);

  // Anillos de onda: se reutilizan en ciclo, uno por pulso
  const NA = 8;
  const anillos = [];
  for (let k = 0; k < NA; k++) {
    const pts = [];
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * TAU; pts.push(vec(Math.cos(a), 0, Math.sin(a))); }
    const c = colL[k % 4].map((v) => mix(v, 1, 0.25));
    const m = crearCintas(THREE, [{ pts, ancho: 0.03, color: c, inicio: -10, dur: 0.01, fase: k, pilar: -1 }], { seg: 128, brillo: 0, pulso: 0.4, pulsoK: 20, pulsoV: 2, fogNear: 1e3, fogK: 0 });
    disco.add(m.mesh); anillos.push(m);
  }
  const lanzamientos = pulsosAudio.length ? pulsosAudio.slice() : Array.from({ length: 8 }, (_, i) => 3 + i * 1.5);

  const estrellas = crearFondoEstelar(THREE, ctx, { n: ctx.calidad === "borrador" ? 110 : 240, radio: 30, brillo: 0.85 });
  escena.add(estrellas.mesh);
  const neb = crearNebulosas(THREE, ctx, [
    { pos: [0, 0, -13], tam: 22, color: paleta.zenith, k: 0.1 }, { pos: [-5, -3, -14], tam: 16, color: paleta.horizonte, k: 0.04 }, { pos: [5, 3, -15], tam: 15, color: paleta.logica, k: 0.035 },
  ]);
  escena.add(neb.mesh);

  const rCam = params.r_cam || distancia(RAD * 1.02, ctx.aspecto, FOV, 1.0);
  const objetivo = vec(0, TY, 0);

  return {
    escena, camara,
    post: { umbral: 0.48, pesos: [0.52, 0.42, 0.34], exposicion: 0.97, aberracion: 0.011, vineta: 0.52, grano: 0.014 },
    fundido(t) { return smooth(0, 0.55, t) * (ctx.modoEstatico ? 1 : 1 - smooth(ctx.duracion - 0.35, ctx.duracion, t)); },
    actualizar(t) {
      const lat = latido(pulsosAudio, t, 0.3);
      capas.forEach((c, k) => { c.g.uniforms.uT.value = t; c.g.mesh.rotation.y = t * c.vel + k * 0.9; c.g.uniforms.uLatido.value = lat; });
      nuc.uniforms.uT.value = t; nuc.uniforms.uBrillo.value = (0.55 + 0.45 * smooth(0, 1.2, t)) * (1 + 0.6 * lat);
      estrellas.uniforms.uT.value = t; neb.uniforms.uT.value = t;
      // Anillos: el anillo k vive 3,2 s desde su lanzamiento
      anillos.forEach((a) => { a.mesh.visible = false; });
      lanzamientos.forEach((tl, n) => {
        const dt = t - tl;
        if (dt < 0 || dt > 3.2) return;
        const a = anillos[n % NA];
        const u = easeOutCubic(dt / 3.2);
        a.mesh.visible = true;
        a.mesh.scale.set(0.25 + u * RAD * 1.15, 1, 0.25 + u * RAD * 1.15);
        a.uniforms.uT.value = t;
        a.uniforms.uBrillo.value = 1.4 * Math.pow(1 - dt / 3.2, 1.6) * smooth(0, 0.12, dt);
        a.mesh.material.uniforms.uPilarT.value.set(1e3, 1e3, 1e3, 1e3);
      });
      // Cámara: órbita lenta, con inclinación que se abre
      const u = easeInOut(smooth(0, ctx.duracion || 15, t));
      const r = rCam * mix(1.06, 0.96, u);
      const yaw = 0.25 * Math.sin(t * 0.17) + t * 0.015;
      const alt = mix(0.18, 0.34, u);
      camara.position.set(Math.sin(yaw) * r * Math.cos(alt), TY + Math.sin(alt) * r * 0.5, Math.cos(yaw) * r * Math.cos(alt));
      camara.lookAt(objetivo);
    },
  };
}
