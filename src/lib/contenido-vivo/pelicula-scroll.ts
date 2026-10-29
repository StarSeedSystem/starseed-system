// Película de scroll del contenido vivo (nivel 2): el cabezal sigue el scroll de la
// sección con inercia dentro de requestAnimationFrame y funde el fotograma actual con
// el siguiente. La lógica de qué fotograma toca es pura y se prueba sin DOM.
export interface SeccionScroll { tope: number; alto: number }
export interface CuadroPelicula { actual: number; siguiente: number | null; opacidad: number }
export interface ResumenJank { p95: number; maximo: number }
export interface OpcionesPelicula {
  canvas: HTMLCanvasElement;
  fotogramas: (indice: number) => string;
  total: number;
  seccion: Element;
  fundido?: boolean; inercia?: number; dpr?: number; cubrir?: boolean;
  apagado?: boolean; movimientoReducido?: boolean; margen?: string;
}
export interface PeliculaScroll { parar(): void; jank(): ResumenJank; ponerApagado(apagado: boolean): void }
export function acotar(valor: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}
export function fraccionDeSeccion(desplazamiento: number, seccion: SeccionScroll, altoVista: number): number {
  const recorrido = Math.max(1, seccion.alto - Math.max(0, altoVista));
  return acotar((desplazamiento - seccion.tope) / recorrido, 0, 1);
}
export function avanzarCabezal(actual: number, objetivo: number, inercia: number): number {
  return actual + (objetivo - actual) * acotar(inercia, 0.01, 1);
}
export function cuadroDePelicula(fraccion: number, opciones: { total: number; fundido?: boolean; quieto?: boolean }): CuadroPelicula {
  const total = Math.max(0, Math.floor(opciones.total));
  if (total === 0) return { actual: 0, siguiente: null, opacidad: 0 };
  if (opciones.quieto) return { actual: total - 1, siguiente: null, opacidad: 0 };
  const f = acotar(fraccion, 0, 1);
  if (opciones.fundido === false) return { actual: Math.round(f * (total - 1)), siguiente: null, opacidad: 0 };
  const posicion = f * (total - 1);
  const actual = Math.min(total - 1, Math.floor(posicion));
  const siguiente = actual + 1 < total ? actual + 1 : null;
  return { actual, siguiente, opacidad: siguiente === null ? 0 : acotar(posicion - actual, 0, 1) };
}
export function recorteCubrir(ancho: number, alto: number, anchoFuente: number, altoFuente: number): { x: number; y: number; ancho: number; alto: number } {
  if (!(ancho > 0 && alto > 0 && anchoFuente > 0 && altoFuente > 0)) return { x: 0, y: 0, ancho: 0, alto: 0 };
  const escala = Math.max(ancho / anchoFuente, alto / altoFuente), anchoRecorte = ancho / escala, altoRecorte = alto / escala;
  return { x: (anchoFuente - anchoRecorte) / 2, y: (altoFuente - altoRecorte) / 2, ancho: anchoRecorte, alto: altoRecorte };
}
export function resumenJank(muestras: readonly number[]): ResumenJank {
  const limpias = muestras.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!limpias.length) return { p95: 0, maximo: 0 };
  return { p95: limpias[Math.min(limpias.length - 1, Math.floor(limpias.length * 0.95))], maximo: limpias[limpias.length - 1] };
}
export function crearPeliculaScroll(opciones: OpcionesPelicula): PeliculaScroll {
  const total = Math.max(0, Math.floor(opciones.total));
  const lienzo = opciones.canvas, contexto = lienzo.getContext("2d");
  const imagenes = new Map<number, HTMLImageElement>(), cargadas = new Set<number>(), medidas: number[] = [];
  const ahora = () => (typeof performance === "undefined" ? Date.now() : performance.now());
  const reducido = () => opciones.movimientoReducido ?? Boolean(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  let cabezal = 0, rafId: number | null = null, visible = false, apagado = opciones.apagado === true, observador: IntersectionObserver | null = null;
  const quieto = () => apagado || reducido();
  function redimensionar() {
    const dpr = Math.max(1, opciones.dpr ?? (typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1)));
    lienzo.width = Math.max(1, Math.round((lienzo.clientWidth || lienzo.width || 1) * dpr)); lienzo.height = Math.max(1, Math.round((lienzo.clientHeight || lienzo.height || 1) * dpr));
  }
  function cargar(indice: number) {
    if (indice < 0 || indice >= total || imagenes.has(indice)) return;
    const url = opciones.fotogramas(indice);
    if (!url) return;
    const imagen = new Image(); imagenes.set(indice, imagen); imagen.decoding = "async";
    imagen.onload = () => { cargadas.add(indice); pedir(); };
    imagen.src = url;
  }
  function pintar(imagen: HTMLImageElement) {
    if (!contexto) return;
    const r = recorteCubrir(lienzo.width, lienzo.height, imagen.naturalWidth || imagen.width, imagen.naturalHeight || imagen.height);
    if (opciones.cubrir !== false && r.ancho > 0 && r.alto > 0) contexto.drawImage(imagen, r.x, r.y, r.ancho, r.alto, 0, 0, lienzo.width, lienzo.height);
    else contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  }
  function dibujar() {
    if (!contexto) return;
    const cuadro = cuadroDePelicula(cabezal, { total, fundido: opciones.fundido, quieto: quieto() });
    contexto.clearRect(0, 0, lienzo.width, lienzo.height);
    const actual = cargadas.has(cuadro.actual) ? imagenes.get(cuadro.actual) : null;
    if (actual) { contexto.globalAlpha = 1; pintar(actual); }
    const siguiente = cuadro.siguiente !== null && cargadas.has(cuadro.siguiente) ? imagenes.get(cuadro.siguiente) : null;
    if (siguiente) { contexto.globalAlpha = cuadro.opacidad; pintar(siguiente); }
    contexto.globalAlpha = 1; cargar(cuadro.actual + 1); cargar(cuadro.actual + 2);
  }
  function objetivo() {
    if (typeof window === "undefined") return 0;
    const rect = opciones.seccion.getBoundingClientRect(), desplazamiento = window.scrollY || window.pageYOffset || 0;
    return fraccionDeSeccion(desplazamiento, { tope: rect.top + desplazamiento, alto: rect.height }, window.innerHeight || 0);
  }
  function paso() {
    rafId = null;
    if (!visible) return;
    const inicio = ahora(), parado = quieto();
    redimensionar();
    cabezal = parado ? 1 : avanzarCabezal(cabezal, objetivo(), opciones.inercia ?? 0.09);
    dibujar();
    medidas.push(Math.max(0, ahora() - inicio));
    if (medidas.length > 180) medidas.shift();
    rafId = requestAnimationFrame(paso);
  }
  function pedir() {
    if (rafId === null && visible) rafId = requestAnimationFrame(paso);
  }
  function observar() {
    if (typeof IntersectionObserver === "undefined") { visible = true; cargar(0); cargar(total - 1); pedir(); return; }
    observador = new IntersectionObserver((entradas) => {
      visible = Boolean(entradas[entradas.length - 1]?.isIntersecting);
      if (!visible) { if (rafId !== null) cancelAnimationFrame(rafId); rafId = null; return; }
      redimensionar(); cargar(0); cargar(total - 1); cargar(cuadroDePelicula(cabezal, { total }).actual); pedir();
    }, { rootMargin: opciones.margen ?? "200px 0px" }); observador.observe(opciones.seccion);
  }
  function parar() {
    observador?.disconnect(); observador = null;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (typeof window !== "undefined") { window.removeEventListener("scroll", pedir); window.removeEventListener("resize", pedir); }
    visible = false;
  }
  if (typeof window !== "undefined") { window.addEventListener("scroll", pedir, { passive: true }); window.addEventListener("resize", pedir, { passive: true }); }
  observar(); redimensionar(); dibujar();
  return { parar, jank: () => resumenJank(medidas), ponerApagado: (valor) => { apagado = valor; pedir(); } };
}
