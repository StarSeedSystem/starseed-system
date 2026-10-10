/*
 * _comun.js — piezas compartidas por las escenas 3D del Estudio MetaGeminis.
 *  - Destellos: miles de «luces» (billboards con núcleo y halo) en una sola llamada de dibujo (instancias).
 *  - Cintas: líneas gruesas con brillo, crecimiento a lo largo del arco y pulsos de señal viajando por ellas.
 *  - Utilidades de easing y ritmo (los pulsos del audio sintetizado llegan en ctx.audio.pulsos).
 * Todo es función pura del tiempo: nada usa reloj ni aleatoriedad fuera del rng con semilla.
 */

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

/** Envolvente de ritmo: suma de decaimientos exponenciales en cada pulso del audio. */
export function latido(pulsos, t, tau = 0.32) {
  let v = 0;
  for (let i = 0; i < pulsos.length; i++) {
    const d = t - pulsos[i];
    if (d >= 0 && d < tau * 6) v += Math.exp(-d / tau);
  }
  return Math.min(v, 1.6);
}

/** Color hexadecimal sRGB → [r, g, b] lineal, multiplicado por `k`. */
export function lin(THREE, hex, k = 1) {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
}

// ───────────────────────── destellos (billboards) ─────────────────────────

const VERT_DEST = `
attribute vec3 iPos; attribute float iTam; attribute vec3 iColor; attribute float iFase; attribute float iInicio;
uniform float uT; uniform float uBrillo; uniform float uTw; uniform float uFogNear; uniform float uFogK; uniform float uLatido; uniform float uLatidoK;
varying vec2 vUv; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float vive = smoothstep(iInicio, iInicio + 0.55, uT);
  float tw = 1.0 + uTw * sin(uT * (0.8 + iFase * 1.7) + iFase * 40.0);
  mv.xy += position.xy * iTam * (0.35 + 0.65 * vive) * (0.9 + 0.1 * tw) * (1.0 + uLatido * uLatidoK);
  gl_Position = projectionMatrix * mv;
  float fog = exp(-max(0.0, -mv.z - uFogNear) * uFogK);
  vUv = position.xy;
  vC = iColor * tw * vive * fog * uBrillo;
}`;

const FRAG_DEST = `
precision highp float; varying vec2 vUv; varying vec3 vC; uniform float uHalo; uniform float uNucleo; uniform float uNucleoK;
void main(){
  float r2 = dot(vUv, vUv) * 4.0;
  if (r2 > 1.0) discard;
  float g = exp(-r2 * uHalo) + uNucleoK * exp(-r2 * uNucleo);
  g *= smoothstep(1.0, 0.7, r2);
  gl_FragColor = vec4(vC * g, 1.0);
}`;

/**
 * @param {object} o { n, pos(Float32Array 3n), tam(Float32Array n), color(Float32Array 3n, lineal), fase?, inicio?, halo?, nucleo?, nucleoK?, brillo? }
 */
export function crearDestellos(THREE, o) {
  const n = o.n;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.getAttribute("position"));
  g.setAttribute("iPos", new THREE.InstancedBufferAttribute(o.pos, 3));
  g.setAttribute("iTam", new THREE.InstancedBufferAttribute(o.tam, 1));
  g.setAttribute("iColor", new THREE.InstancedBufferAttribute(o.color, 3));
  g.setAttribute("iFase", new THREE.InstancedBufferAttribute(o.fase || new Float32Array(n).map((_, i) => ((i * 0.6180339) % 1)), 1));
  g.setAttribute("iInicio", new THREE.InstancedBufferAttribute(o.inicio || new Float32Array(n), 1));
  g.instanceCount = n;
  const uniforms = {
    uT: { value: 0 }, uBrillo: { value: o.brillo === undefined ? 1 : o.brillo }, uTw: { value: o.tw === undefined ? 0.25 : o.tw },
    uFogNear: { value: o.fogNear === undefined ? 8 : o.fogNear }, uFogK: { value: o.fogK === undefined ? 0.05 : o.fogK },
    uHalo: { value: o.halo || 3.2 }, uNucleo: { value: o.nucleo || 16 }, uNucleoK: { value: o.nucleoK === undefined ? 1.6 : o.nucleoK },
    uLatido: { value: 0 }, uLatidoK: { value: o.latidoK || 0 },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: VERT_DEST, fragmentShader: FRAG_DEST, uniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ───────────────────────── cintas (ramas, enlaces, anillos) ─────────────────────────

const VERT_CINTA = `
attribute vec3 aDir; attribute float aSide; attribute float aArc; attribute float aAncho; attribute vec3 aColor;
attribute float aInicio; attribute float aVel; attribute float aFase; attribute float aPilar;
uniform float uT; uniform float uFogNear; uniform float uFogK; uniform vec4 uPilarT; uniform float uLatido;
varying float vAcross; varying float vArc; varying vec3 vC; varying float vHead; varying float vFase; varying float vFog; varying float vBoost;
void main(){
  float g = clamp((uT - aInicio) * aVel, 0.0, 1.0);
  float visible = step(aArc, g) * step(0.0001, g);
  float cabeza = smoothstep(g - 0.12, g, aArc) * step(g, 0.9999);
  float ancho = aAncho * mix(1.0, 0.25, smoothstep(0.80, 1.0, aArc)) * (1.0 + 0.8 * cabeza);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 td = normalize(mat3(modelViewMatrix) * aDir);
  vec2 perp = normalize(vec2(-td.y, td.x) + vec2(1e-5, 0.0));
  mv.xy += perp * aSide * ancho * visible * 0.5 * (1.0 + 0.25 * uLatido);
  gl_Position = projectionMatrix * mv;
  vAcross = aSide; vArc = aArc; vC = aColor; vHead = cabeza * visible; vFase = aFase;
  vFog = exp(-max(0.0, -mv.z - uFogNear) * uFogK) * visible;
  float boost = 1.0;
  if (aPilar > -0.5) { float dt = uT - uPilarT[int(aPilar + 0.5)]; boost += 1.7 * exp(-dt * dt * 0.9) * step(-0.4, dt); }
  vBoost = boost;
}`;

const FRAG_CINTA = `
precision highp float; varying float vAcross; varying float vArc; varying vec3 vC; varying float vHead; varying float vFase; varying float vFog; varying float vBoost;
uniform float uT; uniform float uBrillo; uniform float uPulso; uniform float uPulsoK; uniform float uPulsoV;
void main(){
  float a = abs(vAcross);
  float core = exp(-a * a * 7.0);
  float halo = exp(-a * a * 1.7) * 0.32;
  float onda = sin(vArc * uPulsoK - uT * uPulsoV + vFase * 6.2831) * 0.5 + 0.5;
  float pulso = pow(onda, 9.0);
  vec3 col = vC * (core + halo) * (0.62 + uPulso * pulso * 1.5 + vHead * 1.8) * vBoost;
  col += vec3(1.0, 0.96, 0.85) * core * core * (0.07 * vBoost + vHead * 0.55);
  gl_FragColor = vec4(col * vFog * uBrillo, 1.0);
}`;

/** Catmull-Rom centrípeta simple para suavizar una polilínea. */
export function suavizar(THREE, pts, n) {
  const curva = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  return curva.getPoints(n);
}

/**
 * @param {object[]} ramas  [{ pts: Vector3[], ancho, color:[r,g,b], inicio, dur, fase, pilar }]
 * @param {object} o        { seg: segmentos por rama, brillo, fogNear, fogK, pulso, pulsoK, pulsoV }
 */
export function crearCintas(THREE, ramas, o = {}) {
  const seg = o.seg || 20;
  const nv = ramas.length * (seg + 1) * 2;
  const pos = new Float32Array(nv * 3), dir = new Float32Array(nv * 3), side = new Float32Array(nv), arc = new Float32Array(nv), anc = new Float32Array(nv);
  const col = new Float32Array(nv * 3), ini = new Float32Array(nv), vel = new Float32Array(nv), fase = new Float32Array(nv), pil = new Float32Array(nv);
  const idx = new Uint32Array(ramas.length * seg * 6);
  let v = 0, k = 0;
  ramas.forEach((r) => {
    const puntos = suavizar(THREE, r.pts, seg);
    const base = v;
    for (let i = 0; i <= seg; i++) {
      const p = puntos[i];
      const q = puntos[Math.min(i + 1, seg)], pr = puntos[Math.max(i - 1, 0)];
      const d = q.clone().sub(pr).normalize();
      for (let s = -1; s <= 1; s += 2) {
        pos.set([p.x, p.y, p.z], v * 3); dir.set([d.x, d.y, d.z], v * 3);
        side[v] = s; arc[v] = i / seg; anc[v] = r.ancho; col.set(r.color, v * 3);
        ini[v] = r.inicio; vel[v] = 1 / r.dur; fase[v] = r.fase === undefined ? 0 : r.fase; pil[v] = r.pilar === undefined ? -1 : r.pilar;
        v++;
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k); k += 6;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  g.setAttribute("aArc", new THREE.BufferAttribute(arc, 1));
  g.setAttribute("aAncho", new THREE.BufferAttribute(anc, 1));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aInicio", new THREE.BufferAttribute(ini, 1));
  g.setAttribute("aVel", new THREE.BufferAttribute(vel, 1));
  g.setAttribute("aFase", new THREE.BufferAttribute(fase, 1));
  g.setAttribute("aPilar", new THREE.BufferAttribute(pil, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const uniforms = {
    uT: { value: 0 }, uBrillo: { value: o.brillo === undefined ? 1 : o.brillo }, uFogNear: { value: o.fogNear === undefined ? 8 : o.fogNear }, uFogK: { value: o.fogK === undefined ? 0.05 : o.fogK },
    uPilarT: { value: new THREE.Vector4(1e3, 1e3, 1e3, 1e3) }, uPulso: { value: o.pulso === undefined ? 1 : o.pulso }, uPulsoK: { value: o.pulsoK || 14 }, uPulsoV: { value: o.pulsoV || 2.4 }, uLatido: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: VERT_CINTA, fragmentShader: FRAG_CINTA, uniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ───────────────────────── fondo: estrellas y nebulosas ─────────────────────────

/** Campo de estrellas lejanas con tres colores Trinity tenues; devuelve un grupo de destellos. */
export function crearFondoEstelar(THREE, ctx, o = {}) {
  const n = o.n || 260;
  const pos = new Float32Array(n * 3), tam = new Float32Array(n), col = new Float32Array(n * 3);
  const pal = [lin(THREE, ctx.paleta.nieve, 1), lin(THREE, ctx.paleta.zenith, 1), lin(THREE, ctx.paleta.horizonte, 0.9), lin(THREE, ctx.paleta.logica, 0.9)];
  for (let i = 0; i < n; i++) {
    const r = (o.radio || 26) * (0.55 + ctx.rng() * 0.45);
    const th = ctx.rng() * TAU, ph = Math.acos(2 * ctx.rng() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.9, -Math.abs(r * Math.sin(ph) * Math.sin(th)) - 4], i * 3);
    tam[i] = (0.05 + ctx.rng() * ctx.rng() * 0.2) * (o.escala || 1);
    const c = pal[Math.floor(ctx.rng() * ctx.rng() * pal.length)];
    const k = 0.25 + ctx.rng() * 0.55;
    col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
  }
  return crearDestellos(THREE, { n, pos, tam, color: col, halo: 2.4, nucleo: 22, nucleoK: 2.2, tw: 0.45, fogNear: 1e3, fogK: 0, brillo: o.brillo || 1 });
}

/** Nubes grandes y suaves de color (nebulosas) detrás de la escena. */
export function crearNebulosas(THREE, ctx, lista) {
  const n = lista.length;
  const pos = new Float32Array(n * 3), tam = new Float32Array(n), col = new Float32Array(n * 3);
  lista.forEach((l, i) => {
    pos.set(l.pos, i * 3); tam[i] = l.tam; col.set(lin(THREE, l.color, l.k), i * 3);
  });
  return crearDestellos(THREE, { n, pos, tam, color: col, halo: 1.6, nucleo: 4, nucleoK: 0.0, tw: 0.0, fogNear: 1e3, fogK: 0, brillo: 1 });
}

/** Distancia de cámara para que una esfera de `radio` quepa entera en el encuadre (vertical u horizontal). */
export function distancia(radio, aspecto, fovGrados, margen = 1.1) {
  const f = Math.tan((fovGrados * Math.PI) / 360);
  return Math.max(radio / f, radio / (f * aspecto)) * margen;
}
