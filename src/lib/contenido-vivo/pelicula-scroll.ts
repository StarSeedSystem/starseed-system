"use client";
/** Película de scroll en canvas (CVV1028, tarea E): fotogramas con fundido, inercia en rAF y pausa fuera de pantalla. */

export type ModoPelicula = "animada" | "ultimo-fotograma";
export interface PlanDibujo { actual: number; siguiente: number; opacidadSiguiente: number; }
export interface ResumenJank { muestras: number; p95: number; maximo: number; }
export interface PeliculaScroll { parar(): void; jank(): ResumenJank; }
export interface OpcionesPeliculaScroll { canvas: HTMLCanvasElement; fotogramas: (indice: number) => string; total: number; fundido?: boolean; inercia?: number; dpr?: number; cubrir?: boolean; seccion?: Element | null; movimientoReducido?: boolean; apagado?: boolean; }

export function acotar(valor: number, minimo: number, maximo: number): number { return valor < minimo ? minimo : valor > maximo ? maximo : valor; }
export function fraccionDeScroll(entrada: { scrollY: number; inicio: number; recorrido: number }): number { return entrada.recorrido > 0 ? acotar((entrada.scrollY - entrada.inicio) / entrada.recorrido, 0, 1) : 0; }
export function rangoDeScroll(entrada: { top: number; altura: number; viewport: number }): { inicio: number; recorrido: number } { return entrada.altura > entrada.viewport ? { inicio: entrada.top, recorrido: Math.max(1, entrada.altura - entrada.viewport) } : { inicio: entrada.top - entrada.viewport, recorrido: Math.max(1, entrada.altura + entrada.viewport) }; }
export function resolverModo(entrada: { movimientoReducido?: boolean; apagado?: boolean; total: number }): ModoPelicula { return entrada.apagado || entrada.movimientoReducido || entrada.total <= 0 ? "ultimo-fotograma" : "animada"; }
export function planDeDibujo(entrada: { modo: ModoPelicula; fraccion: number; total: number; fundido: boolean }): PlanDibujo {
  const total = Math.max(0, Math.floor(entrada.total));
  if (total === 0) return { actual: 0, siguiente: 0, opacidadSiguiente: 0 };
  const ultimo = total - 1;
  if (entrada.modo === "ultimo-fotograma") return { actual: ultimo, siguiente: ultimo, opacidadSiguiente: 0 };
  const posicion = acotar(entrada.fraccion, 0, 1) * ultimo, actual = Math.min(Math.floor(posicion), ultimo);
  return entrada.fundido ? { actual, siguiente: Math.min(actual + 1, ultimo), opacidadSiguiente: posicion - actual } : { actual, siguiente: actual, opacidadSiguiente: 0 };
}
export function resumenJank(muestras: readonly number[]): ResumenJank {
  const validas = muestras.filter((m) => Number.isFinite(m) && m >= 0);
  if (!validas.length) return { muestras: 0, p95: 0, maximo: 0 };
  const ordenadas = [...validas].sort((a, b) => a - b);
  const indice = Math.max(0, Math.min(ordenadas.length - 1, Math.ceil(ordenadas.length * 0.95) - 1));
  return { muestras: ordenadas.length, p95: ordenadas[indice], maximo: ordenadas[ordenadas.length - 1] };
}

export function crearPeliculaScroll(opciones: OpcionesPeliculaScroll): PeliculaScroll {
  const { canvas } = opciones;
  const total = Math.max(0, Math.floor(opciones.total));
  const fundido = opciones.fundido ?? true;
  const inercia = acotar(opciones.inercia ?? 0.09, 0.01, 1);
  const cubrir = opciones.cubrir ?? true;
  const seccion = opciones.seccion ?? canvas;
  const navegador = typeof window !== "undefined";
  const dpr = Math.max(1, opciones.dpr ?? (navegador ? window.devicePixelRatio || 1 : 1));
  const reducido = Boolean(opciones.movimientoReducido) || Boolean(navegador && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const modo = resolverModo({ movimientoReducido: reducido, apagado: opciones.apagado, total });
  const ctx = canvas.getContext("2d");
  const imagenes: Array<HTMLImageElement | undefined> = [];
  const duraciones: number[] = [];
  let objetivo = 0, cabezal = 0, raf = 0, ultimo = 0, visible = false, parado = false;
  let observador: IntersectionObserver | null = null;
  const ajustar = () => {
    canvas.width = Math.round((canvas.clientWidth || 1) * dpr);
    canvas.height = Math.round((canvas.clientHeight || 1) * dpr);
  };
  const dibujar = (imagen: HTMLImageElement) => {
    if (!ctx) return;
    const escala = cubrir ? Math.max(canvas.width / imagen.naturalWidth, canvas.height / imagen.naturalHeight) : Math.min(canvas.width / imagen.naturalWidth, canvas.height / imagen.naturalHeight);
    const ancho = imagen.naturalWidth * escala, alto = imagen.naturalHeight * escala;
    ctx.drawImage(imagen, (canvas.width - ancho) / 2, (canvas.height - alto) / 2, ancho, alto);
  };
  const pintar = (plan: PlanDibujo) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const actual = imagenes[plan.actual], siguiente = imagenes[plan.siguiente];
    if (actual?.complete && actual.naturalWidth > 0) { ctx.globalAlpha = 1; dibujar(actual); }
    if (plan.siguiente !== plan.actual && siguiente?.complete && siguiente.naturalWidth > 0) { ctx.globalAlpha = plan.opacidadSiguiente; dibujar(siguiente); }
    ctx.globalAlpha = 1;
  };
  const programar = () => { if (!raf && !parado && visible) raf = window.requestAnimationFrame(paso); };
  const paso = (ahora: number) => {
    raf = 0;
    if (parado) return;
    if (ultimo > 0) duraciones.push(ahora - ultimo);
    ultimo = ahora;
    cabezal += (objetivo - cabezal) * inercia;
    if (Math.abs(objetivo - cabezal) < 0.0005) cabezal = objetivo;
    pintar(planDeDibujo({ modo, fraccion: cabezal, total, fundido }));
    if (modo === "animada" && cabezal !== objetivo) programar(); else ultimo = 0;
  };
  const precargar = () => {
    for (let indice = 0; indice < total; indice += 1) {
      if (imagenes[indice]) continue;
      const imagen = new Image();
      imagen.decoding = "async";
      imagen.onload = () => { ultimo = 0; programar(); };
      imagen.src = opciones.fotogramas(indice);
      imagenes[indice] = imagen;
    }
  };
  const alScroll = () => {
    if (!navegador) return;
    const caja = seccion.getBoundingClientRect();
    const rango = rangoDeScroll({ top: caja.top + window.scrollY, altura: caja.height, viewport: window.innerHeight });
    objetivo = fraccionDeScroll({ scrollY: window.scrollY, inicio: rango.inicio, recorrido: rango.recorrido });
    programar();
  };
  const alRedimensionar = () => { ajustar(); alScroll(); };
  if (navegador && typeof IntersectionObserver !== "undefined") {
    observador = new IntersectionObserver((entradas) => {
      visible = entradas.some((entrada) => entrada.isIntersecting);
      if (visible) { precargar(); alScroll(); programar(); } else if (raf) { window.cancelAnimationFrame(raf); raf = 0; ultimo = 0; }
    }, { rootMargin: "300px 0px" });
    observador.observe(seccion);
  } else if (navegador) { visible = true; precargar(); alScroll(); }
  ajustar();
  if (navegador) {
    window.addEventListener("scroll", alScroll, { passive: true });
    window.addEventListener("resize", alRedimensionar, { passive: true });
  }
  return {
    parar() {
      parado = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      observador?.disconnect();
      if (navegador) { window.removeEventListener("scroll", alScroll); window.removeEventListener("resize", alRedimensionar); }
    },
    jank: () => resumenJank(duraciones),
  };
}
