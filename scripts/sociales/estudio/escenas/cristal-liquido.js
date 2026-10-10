/*
 * Escena «Cristal líquido» — una gota de cristal líquido que se enriquece al sumar cuatro caminos.
 *
 * Un orbe de vidrio vivo (malla desplazada por ruido, refracción con dispersión cromática y película iridiscente)
 * flota en la oscuridad, pálido y frío. Cuatro gotas Trinity (Zenith, Horizonte, Lógica, Anchor) giran hacia él y se
 * funden, una por cada camino que nombra el guion (params.pilares_t): con cada fusión el orbe gana ese color y late.
 *   0–4 s    el orbe se forma y respira.   4–10 s  las gotas se acercan y se funden una a una.   10 s→  orbe completo.
 * params: pilares_t [4], radio, ty, escala_orbe.
 * Todo es función pura del tiempo; el ruido es de valor 3D con hash determinista (sin texturas ni aleatoriedad externa).
 */
import { crearDestellos, crearCintas, crearFondoEstelar, crearNebulosas, lin, latido, smooth, mix, easeInOut, easeOutCubic, clamp, distancia, TAU } from "./_comun.js";

const RUIDO = `
float h31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

const VERT = `
uniform float uT; uniform float uAmp; uniform float uFreq; uniform float uSemilla; uniform float uPulso;
varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vD;
${RUIDO}
vec3 desplaza(vec3 p){
  float n = vn(p * uFreq + vec3(0.0, uT * 0.33, uSemilla)) - 0.5;
  float m = vn(p * uFreq * 2.3 - vec3(uT * 0.45, 0.0, uSemilla)) - 0.5;
  return p * (1.0 + uAmp * (n + 0.4 * m) + uPulso * 0.05);
}
void main(){
  vec3 p = position;
  vec3 q = desplaza(p);
  vec3 a = normalize(cross(p, vec3(0.31, 1.0, 0.17)));
  vec3 b = normalize(cross(p, a));
  float e = 0.025;
  vec3 qa = desplaza(normalize(p + a * e) * length(p));
  vec3 qb = desplaza(normalize(p + b * e) * length(p));
  vec3 n = normalize(cross(qa - q, qb - q));
  if (dot(n, q) < 0.0) n = -n;
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); vP = q; vD = length(q) / length(p);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
precision highp float;
uniform float uT; uniform vec3 uZ; uniform vec3 uH; uniform vec3 uL; uniform vec3 uA; uniform vec4 uPeso; uniform float uBrillo; uniform float uBase;
varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vD;
${RUIDO}
vec3 ambiente(vec3 d){
  vec3 c = vec3(0.012, 0.02, 0.05);
  c += mix(vec3(0.05, 0.16, 0.5), uZ, uPeso.x) * pow(smoothstep(0.0, 1.0, d.y), 1.6) * 1.9;
  c += mix(vec3(0.03, 0.14, 0.16), uH, uPeso.y) * pow(max(0.0, -d.x * 0.85 + d.z * 0.15), 2.2) * 1.9;
  c += mix(vec3(0.16, 0.12, 0.06), uL, uPeso.z) * pow(max(0.0, d.x * 0.85 + d.z * 0.15), 2.2) * 1.9;
  c += mix(vec3(0.10, 0.04, 0.12), uA, uPeso.w) * pow(max(0.0, -d.y), 1.6) * 1.6;
  c += vec3(1.0, 0.97, 0.9) * pow(max(0.0, dot(d, normalize(vec3(-0.35, 0.8, 0.5)))), 48.0) * 3.0;
  c += vec3(0.9, 0.95, 1.0) * pow(max(0.0, dot(d, normalize(vec3(0.6, 0.2, 0.75)))), 64.0) * 1.8;
  return c;
}
void main(){
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 r = reflect(-v, n);
  vec3 refr = vec3(ambiente(refract(-v, n, 0.70)).r, ambiente(refract(-v, n, 0.73)).g, ambiente(refract(-v, n, 0.76)).b);
  float ruido = vn(vP * 3.0 + uT * 0.2);
  float banda = 0.5 + 0.5 * sin(vP.y * 8.0 + ruido * 6.0 + uT * 0.55);
  float fuerza = max(max(uPeso.x, uPeso.y), max(uPeso.z, uPeso.w));
  vec3 pelicula = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ndv * 1.7 + ruido * 0.8 + uT * 0.03));
  float K = 1.0 / (1.0 + 1.35 * fuerza);
  vec3 col = refr * (0.06 + 0.13 * banda) * K + ambiente(r) * (0.07 + 1.6 * fres) * K + pelicula * fres * (0.42 - 0.1 * fuerza);
  col += (uZ * uPeso.x + uH * uPeso.y + uL * uPeso.z + uA * uPeso.w) * 0.05 * (1.0 - fres) * (0.5 + 0.9 * banda);
  // Venas de cristal líquido: filamentos finos y nítidos (el interior no es niebla, es estructura)
  float rid = 1.0 - abs(2.0 * vn(vP * 2.4 + vec3(0.0, uT * 0.10, 1.7)) - 1.0);
  float rid2 = 1.0 - abs(2.0 * vn(vP * 5.3 - vec3(uT * 0.07, 0.0, 3.1)) - 1.0);
  float vena = pow(rid, 16.0) + 0.55 * pow(rid2, 22.0);
  vec3 tinte = mix(vec3(0.62, 0.86, 1.0), pelicula, 0.55);
  vec3 mezcla = uZ * uPeso.x + uH * uPeso.y + uL * uPeso.z + uA * uPeso.w;
  tinte = mix(tinte, mezcla / max(0.35, uPeso.x + uPeso.y + uPeso.z + uPeso.w), clamp(fuerza * 1.2, 0.0, 0.8));
  col += tinte * vena * (0.9 + 0.7 * fuerza) * (0.35 + 0.65 * ndv);
  col += pelicula * smoothstep(0.80, 1.0, 1.0 - ndv) * 0.55;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.5 + 1.1 * fuerza);
  col = max(col, 0.0) * uBrillo * uBase;
  gl_FragColor = vec4(col, 1.0);
}`;

export function crear(ctx) {
  const { THREE, paleta, params } = ctx;
  const rng = ctx.rng;
  const escena = new THREE.Scene();
  const FOV = 34;
  const camara = new THREE.PerspectiveCamera(FOV, ctx.aspecto, 0.1, 100);
  const escalaT = (ctx.duracion || 15) / 15;
  const pilaresT = params.pilares_t || [5.6, 7.0, 8.4, 9.8];
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const colP = [paleta.zenith, paleta.horizonte, paleta.logica, paleta.anchor];
  const colL = colP.map((h) => lin(THREE, h, 1.0));
  const RO = (params.radio || 1.25) * (params.escala_orbe || 1);
  const CENTRO_ORBE = params.centro_orbe || 0;
  const TY = params.ty === undefined ? 0 : params.ty;
  const detalle = ctx.calidad === "borrador" ? 28 : 44;

  function material(base) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 }, uAmp: { value: base.amp }, uFreq: { value: base.freq }, uSemilla: { value: base.semilla }, uPulso: { value: 0 },
        uZ: { value: new THREE.Vector3(...colL[0].map((v) => v * 1.2)) }, uH: { value: new THREE.Vector3(...colL[1].map((v) => v * 1.2)) },
        uL: { value: new THREE.Vector3(...colL[2].map((v) => v * 1.25)) }, uA: { value: new THREE.Vector3(...colL[3].map((v) => v * 1.3)) },
        uPeso: { value: new THREE.Vector4(...base.peso) }, uBrillo: { value: 1 }, uBase: { value: 1 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }
  const geo = new THREE.IcosahedronGeometry(1, detalle);
  const orbeMat = material({ amp: 0.22, freq: 1.1, semilla: 3.1, peso: [0, 0, 0, 0] });
  const orbe = new THREE.Mesh(geo, orbeMat);
  orbe.frustumCulled = false;
  escena.add(orbe);

  // Cuatro gotas Trinity: cada una orbita, se acerca en espiral y se funde en el orbe
  const gotas = colL.map((c, i) => {
    const peso = [0, 0, 0, 0]; peso[i] = 1;
    const m = material({ amp: 0.12, freq: 1.6, semilla: 11 + i * 5, peso });
    m.uniforms.uBrillo.value = 1.15;
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    escena.add(mesh);
    return { mesh, m, ang0: (i / 4) * TAU + 0.6, giro: 0.9 + i * 0.12, incl: 0.25 + 0.2 * i };
  });

  // Núcleo: la «semilla» de luz que se ve a través del cristal
  const nucleo = crearDestellos(THREE, { n: 1, pos: new Float32Array([0, TY, 0]), tam: new Float32Array([RO * 1.25]), color: new Float32Array(lin(THREE, "#FFE2A0", 0.2)), halo: 2.6, nucleo: 34, nucleoK: 1.3, tw: 0.1, fogNear: 1e3, fogK: 0 });
  escena.add(nucleo.mesh);
  // Halo: un anillo fino de luz dorada que orbita el orbe + esporas + fondo
  const aro = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; aro.push(vec(Math.cos(a) * 2.5, Math.sin(a * 2) * 0.12, Math.sin(a) * 2.5)); }
  const aros = crearCintas(THREE, [{ pts: aro, ancho: 0.016, color: lin(THREE, "#FFE2A0", 0.7), inicio: 1.0, dur: 4, fase: 0, pilar: -1 }], { seg: 120, brillo: 0.7, pulso: 0.9, pulsoK: 8, pulsoV: 1.2, fogNear: 1e3, fogK: 0 });
  aros.mesh.rotation.set(1.15, 0.2, 0.35);
  escena.add(aros.mesh);
  const estrellas = crearFondoEstelar(THREE, ctx, { n: ctx.calidad === "borrador" ? 110 : 240, radio: 28, brillo: 0.8 });
  escena.add(estrellas.mesh);
  const neb = crearNebulosas(THREE, ctx, [
    { pos: [-4, 2, -13], tam: 19, color: paleta.zenith, k: 0.1 }, { pos: [5, -2.5, -14], tam: 17, color: paleta.horizonte, k: 0.04 }, { pos: [1, 5.5, -16], tam: 15, color: paleta.logica, k: 0.03 },
  ]);
  escena.add(neb.mesh);
  const NP = ctx.calidad === "borrador" ? 110 : 280;
  const pp = new Float32Array(NP * 3), pt = new Float32Array(NP), pc = new Float32Array(NP * 3), pi = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const r = 2.2 + rng() * 5.5, th = rng() * TAU;
    pp.set([Math.cos(th) * r, -4 + rng() * 8, Math.sin(th) * r - 1.5], i * 3);
    pt[i] = 0.03 + rng() * 0.06;
    pc.set(colL[Math.floor(rng() * 4)].map((v) => v * (0.2 + rng() * 0.35)), i * 3);
    pi[i] = 0.5 + rng() * 5;
  }
  const esporas = crearDestellos(THREE, { n: NP, pos: pp, tam: pt, color: pc, inicio: pi, halo: 2.6, nucleo: 18, nucleoK: 1.3, tw: 0.5, fogNear: 6, fogK: 0.04 });
  escena.add(esporas.mesh);

  const pulsos = ctx.audio.pulsos || [];
  const rCam = params.r_cam || distancia(RO * 2.6, ctx.aspecto, FOV, 1.0);
  const objetivo = vec(0, TY, 0);
  const T_APARECE = 0.2;

  return {
    escena, camara,
    post: { umbral: 0.5, pesos: [0.5, 0.42, 0.34], exposicion: 0.95, aberracion: 0.011, vineta: 0.5, grano: 0.014 },
    fundido(t) { return smooth(0, 0.55, t) * (ctx.modoEstatico ? 1 : 1 - smooth(ctx.duracion - 0.35, ctx.duracion, t)); },
    actualizar(t) {
      const lat = latido(pulsos, t, 0.3);
      esporas.uniforms.uT.value = t; estrellas.uniforms.uT.value = t; neb.uniforms.uT.value = t; aros.uniforms.uT.value = t; aros.uniforms.uLatido.value = lat * 0.4;
      // Fusiones: cada gota llega al orbe en pilaresT[i]
      const peso = [0, 0, 0, 0];
      let golpe = 0;
      gotas.forEach((g, i) => {
        const tf = pilaresT[i];
        const ti = tf - 2.6 * escalaT;
        const u = clamp((t - ti) / (tf - ti));
        const e = easeInOut(u);
        const radio = mix(3.4, RO * 0.55, e);
        const ang = g.ang0 + t * g.giro * (1.0 + 1.6 * e);
        g.mesh.position.set(Math.cos(ang) * radio, Math.sin(ang * 0.7 + i) * radio * 0.35 + TY, Math.sin(ang) * radio);
        const vive = t < tf + 0.15 ? 1 : 0;
        const aparece = smooth(ti - 1.2, ti, t);
        g.mesh.scale.setScalar(vive ? RO * mix(0.3, 0.2, e) * aparece : 0.0001);
        g.m.uniforms.uT.value = t;
        peso[i] = smooth(tf - 0.2, tf + 1.1, t);
        golpe += Math.exp(-Math.max(0, t - tf) * 3.2) * (t >= tf ? 1 : 0);
      });
      const ap = smooth(T_APARECE, T_APARECE + 1.4, t);
      const respira = 1 + 0.025 * Math.sin(t * 1.9) + 0.03 * lat + 0.06 * golpe;
      orbe.scale.setScalar(RO * mix(0.3, 1, easeOutCubic(ap)) * respira);
      orbe.position.set(0, TY, 0);
      orbe.rotation.y = t * 0.12;
      const mu = orbeMat.uniforms;
      mu.uT.value = t; mu.uPeso.value.set(peso[0], peso[1], peso[2], peso[3]); mu.uPulso.value = lat * 0.4 + golpe * 0.6;
      mu.uBase.value = 0.55 + 0.45 * ap;
      mu.uBrillo.value = 1 + 0.18 * golpe;
      nucleo.uniforms.uT.value = t; nucleo.uniforms.uBrillo.value = (0.5 + 0.5 * ap) * (1 + 0.5 * lat + 1.2 * golpe);
      aros.mesh.position.set(0, TY, 0);
      aros.mesh.rotation.y = 0.2 + t * 0.07;
      // Cámara: lenta órbita y acercamiento suave
      const u = easeInOut(smooth(0, ctx.duracion || 15, t));
      const r = rCam * mix(1.08, 0.94, u);
      const yaw = 0.35 * Math.sin(t * 0.21) - 0.1 + t * 0.02;
      camara.position.set(Math.sin(yaw) * r, TY + 0.55 + 0.1 * Math.sin(t * 0.33), Math.cos(yaw) * r);
      camara.lookAt(objetivo);
    },
  };
}
