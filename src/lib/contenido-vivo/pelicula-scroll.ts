/**
 * Película de scroll en canvas: el cabezal sigue a la sección con inercia en `requestAnimationFrame`,
 * funde cada fotograma con el siguiente, precarga con margen y se pausa fuera de pantalla. Con
 * movimiento reducido o apagado se queda el último fotograma.
 */
import { cuadroApagado, cuadroDeFraccion, encaje, fraccionDeSeccion, resumenJank, type ResumenJank } from "./pelicula-scroll-puro";
export interface OpcionesPeliculaScroll {
  canvas: HTMLCanvasElement;
  fotogramas: (indice: number) => string;
  total: number;
  fundido?: boolean;
  inercia?: number;
  dpr?: number;
  cubrir?: boolean;
  seccion?: HTMLElement | null;
  /** «apagado» muestra el último fotograma y no anima. */
  movimiento?: "encendido" | "apagado";
}
export interface PeliculaScroll { parar(): void; jank(): ResumenJank; }
const MARGEN = "600px 0px";
const TOPE = 240;
export function crearPeliculaScroll(o: OpcionesPeliculaScroll): PeliculaScroll {
  const { canvas, fotogramas, seccion, fundido = true, inercia = 0.09, dpr = 2, cubrir = true, movimiento = "encendido" } = o;
  const total = Math.max(0, Math.floor(o.total));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { parar() {}, jank: () => resumenJank([]) };
  const reducido = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reposo = movimiento === "apagado" || reducido;
  const imagenes: (HTMLImageElement | undefined)[] = new Array(total);
  const muestras: number[] = [];
  let cabezal = reposo ? 1 : 0;
  let raf = 0;
  let ultimo = 0;
  let visible = false;
  let parada = false;
  const asegurar = (): void => {
    if (raf || parada || !visible) return;
    ultimo = 0;
    raf = requestAnimationFrame(paso);
  };
  const cargar = (i: number): void => {
    if (i < 0 || i >= total || imagenes[i]) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => asegurar();
    img.src = fotogramas(i);
    imagenes[i] = img;
  };
  const cargarTodas = (): void => { if (reposo) cargar(total - 1); for (let i = 0; i < total; i += 1) cargar(i); };
  const ajustar = (): void => {
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const pintarImagen = (img: HTMLImageElement, w: number, h: number): boolean => {
    if (!img.complete || img.naturalWidth === 0) return false;
    const c = encaje(img.naturalWidth, img.naturalHeight, w, h, cubrir);
    ctx.drawImage(img, c.x, c.y, c.w, c.h);
    return true;
  };
  const pintar = (fraccion: number): void => {
    const w = canvas.width;
    const h = canvas.height;
    const cuadro = reposo ? cuadroApagado(total) : cuadroDeFraccion(fraccion, total, fundido);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    const actual = imagenes[cuadro.actual];
    if (!actual || !pintarImagen(actual, w, h)) {
      const disponible = imagenes.find((img) => !!img && img.complete && img.naturalWidth > 0);
      if (disponible) pintarImagen(disponible, w, h);
      return;
    }
    const siguiente = imagenes[cuadro.siguiente];
    if (cuadro.mezcla > 0 && siguiente) { ctx.globalAlpha = cuadro.mezcla; pintarImagen(siguiente, w, h); ctx.globalAlpha = 1; }
  };
  const paso = (t: number): void => {
    raf = 0;
    if (parada || !visible) return;
    const rect = (seccion ?? canvas).getBoundingClientRect();
    const objetivo = reposo ? 1 : fraccionDeSeccion(rect, window.innerHeight);
    cabezal += (objetivo - cabezal) * inercia;
    const quieto = Math.abs(objetivo - cabezal) < 0.0005;
    if (quieto) cabezal = objetivo;
    pintar(cabezal);
    if (ultimo > 0 && t > ultimo) muestras.push(t - ultimo);
    if (muestras.length > TOPE) muestras.shift();
    ultimo = quieto ? 0 : t;
    if (!quieto) raf = requestAnimationFrame(paso);
  };
  const alRedimensionar = (): void => { ajustar(); asegurar(); };
  const observadorVisible = new IntersectionObserver((entradas) => {
    visible = entradas.some((e) => e.isIntersecting);
    if (visible) asegurar();
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  });
  const observadorCerca = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) { cargarTodas(); observadorCerca.disconnect(); }
  }, { rootMargin: MARGEN });
  ajustar();
  cargar(reposo ? total - 1 : 0);
  observadorVisible.observe(canvas);
  observadorCerca.observe(canvas);
  window.addEventListener("scroll", asegurar, { passive: true });
  window.addEventListener("resize", alRedimensionar, { passive: true });
  asegurar();
  return {
    parar(): void {
      if (parada) return;
      parada = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("scroll", asegurar);
      window.removeEventListener("resize", alRedimensionar);
      observadorVisible.disconnect();
      observadorCerca.disconnect();
      imagenes.length = 0;
    },
    jank: () => resumenJank(muestras),
  };
}
