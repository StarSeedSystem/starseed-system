/*
 * motor.js — el reloj determinista del Estudio MetaGeminis.
 *
 * No hay requestAnimationFrame ni Date.now: el estado de TODO (escena 3D, textos, grano) es función pura de `t`.
 * Python (captura.py) llama a `window.__render(t)` y después hace la captura: t = i / fps.
 *
 * Contrato con Python (window.__CFG, inyectado antes de cargar la página):
 *   formato   { id, ancho, alto, margenes:{arriba,abajo,izquierda,derecha}, evitar:[{izquierda,arriba,ancho,alto,motivo}] }
 *   layout    nombre del diseño de textos (layouts.js)
 *   escena    { id, semilla, params }       (escenas/<id>.js)
 *   duracion, fps, t_estatico, idioma, escala3d, calidad ("borrador"|"final")
 *   textos    [{ id, rol, texto, t, d, color, acento, efecto, ... }]   (guion del idioma elegido)
 *   paleta    { zenith, horizonte, logica, anchor, nieve, fondo, ... }
 *   audio     { pulsos:[segundos...], base_hz, pulso_hz }
 *   marca     { simbolo: "/repo/public/starseed-symbol.png", url: "starseed-os.vercel.app", nombre: "StarSeed" }
 *   qr        { matriz:[[0,1,...]], url } | null
 *   depurar   bool (dibuja la zona segura y las zonas a evitar)
 * API hacia Python:
 *   window.__listo            true cuando fuentes, imágenes y escena están cargadas
 *   window.__render(t, o)     dibuja el instante t. o = { sinTexto: bool }
 *   window.__capas()          rectángulos y colores de los textos visibles (para medir contraste y zona segura)
 */
import * as THREE from "three";
import { crearPost } from "./post.js";
import { montarLayout } from "./layouts.js";

const CFG = window.__CFG;
const { ancho: W, alto: H } = CFG.formato;
const raiz = document.getElementById("raiz");
raiz.style.width = W + "px";
raiz.style.height = H + "px";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function cargarImagen(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

async function iniciar() {
  const canvas = document.getElementById("gl");
  const escala = CFG.escala3d || 0.75;
  const gw = Math.max(64, Math.round(W * escala));
  const gh = Math.max(64, Math.round(H * escala));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(gw, gh, false);
  renderer.setClearColor(0x000000, 1);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";

  await Promise.all([
    document.fonts.load("700 64px Rajdhani"), document.fonts.load("600 64px Rajdhani"), document.fonts.load("500 64px Rajdhani"),
    document.fonts.load("500 32px Inter"), document.fonts.load("700 32px Inter"), document.fonts.load("500 32px 'JetBrains Mono'"), document.fonts.load("700 32px 'JetBrains Mono'"),
  ]);
  await document.fonts.ready;
  const simbolo = await cargarImagen(CFG.marca.simbolo);

  const modulo = await import(`/escenas/${CFG.escena.id}.js`);
  const ctx = {
    THREE, ancho: W, alto: H, aspecto: W / H, gw, gh,
    rng: mulberry32(CFG.escena.semilla || 1), params: CFG.escena.params || {}, paleta: CFG.paleta, audio: CFG.audio || { pulsos: [] },
    duracion: CFG.duracion, calidad: CFG.calidad || "final", formato: CFG.formato, modoEstatico: CFG.modo === "estatico",
  };
  const escena = modulo.crear(ctx);
  const post = crearPost(THREE, renderer, gw, gh, Object.assign({}, escena.post || {}, (CFG.escena.params || {}).post || {}));
  const layout = montarLayout(CFG, document.getElementById("seguro"), simbolo);

  // Desplazamiento del sujeto: el layout dice dónde queda libre el lienzo (por ejemplo, texto a la izquierda).
  const centro = (CFG.escena.params && CFG.escena.params.centro) || [0, 0];
  const camara = escena.camara;
  function encuadrar() {
    const dx = (centro[0] * gw) / 2;
    const dy = (centro[1] * gh) / 2;
    camara.setViewOffset(gw, gh, -dx, dy, gw, gh);
  }
  encuadrar();

  const velo = document.getElementById("velo");
  velo.style.background = layout.velo || "none";

  window.__render = (t, o = {}) => {
    const fotograma = Math.round(t * (CFG.fps || 30));
    escena.actualizar(t);
    post.render(escena.escena, camara, fotograma, escena.fundido ? escena.fundido(t) : 1);
    layout.actualizar(t, { sinTexto: !!o.sinTexto });
    return true;
  };
  window.__capas = () => layout.capas();
  window.__listo = true;
}

iniciar().catch((e) => {
  window.__error = String(e && e.stack ? e.stack : e);
  console.error(window.__error);
});
