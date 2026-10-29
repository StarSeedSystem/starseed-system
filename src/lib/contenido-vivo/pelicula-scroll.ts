"use client";

export interface OpcionesPeliculaScroll {
  canvas: HTMLCanvasElement;
  fotogramas: (indice: number) => string;
  total: number;
  fundido?: boolean;
  inercia?: number;
  dpr?: number;
  cubrir?: boolean;
  seccion?: Element | null;
  apagado?: boolean;
  movimientoReducido?: boolean;
}
export interface ResumenJank { p95: number; maximo: number; muestras: number }
export interface PeliculaScroll { parar: () => void; jank: () => ResumenJank }
export interface CuadroPelicula { actual: number; siguiente: number; opacidadActual: number; opacidadSiguiente: number }

function limitar(valor: number, minimo: number, maximo: number): number {
  return Number.isFinite(valor) ? Math.min(maximo, Math.max(minimo, valor)) : minimo;
}
/** `top` es la distancia de la sección al borde superior de la ventana. */
export function fraccionDePelicula(top: number, alto: number, altoVentana: number): number {
  return limitar(-top / Math.max(1, alto - altoVentana), 0, 1);
}
export function cuadroDePelicula(fraccion: number, total: number, opciones: { fundido?: boolean; apagado?: boolean } = {}): CuadroPelicula {
  const ultimo = Math.max(0, Math.floor(total) - 1);
  if (opciones.apagado) return { actual: ultimo, siguiente: ultimo, opacidadActual: 1, opacidadSiguiente: 0 };
  const posicion = limitar(fraccion, 0, 1) * ultimo;
  const actual = Math.floor(posicion);
  const mezcla = posicion - actual;
  return { actual, siguiente: Math.min(actual + 1, ultimo), opacidadActual: 1, opacidadSiguiente: (opciones.fundido ?? true) ? mezcla : 0 };
}
export function resumirJank(muestras: readonly number[]): ResumenJank {
  const validas = muestras.filter((m) => Number.isFinite(m) && m >= 0).sort((a, b) => a - b);
  if (!validas.length) return { p95: 0, maximo: 0, muestras: 0 };
  const indice = Math.min(validas.length - 1, Math.max(0, Math.ceil(validas.length * 0.95) - 1));
  return { p95: Math.round(validas[indice] * 100) / 100, maximo: Math.round(validas[validas.length - 1] * 100) / 100, muestras: validas.length };
}
function pintar(ctx: CanvasRenderingContext2D, imagen: HTMLImageElement | null, ancho: number, alto: number, opacidad: number, cubrir: boolean): void {
  if (!imagen || !imagen.naturalWidth || !imagen.naturalHeight || opacidad <= 0) return;
  const escala = (cubrir ? Math.max : Math.min)(ancho / imagen.naturalWidth, alto / imagen.naturalHeight);
  const w = imagen.naturalWidth * escala, h = imagen.naturalHeight * escala;
  ctx.globalAlpha = limitar(opacidad, 0, 1);
  ctx.drawImage(imagen, (ancho - w) / 2, (alto - h) / 2, w, h);
  ctx.globalAlpha = 1;
}
export function crearPeliculaScroll(opciones: OpcionesPeliculaScroll): PeliculaScroll {
  const { canvas, fotogramas } = opciones;
  const total = Math.max(1, Math.floor(opciones.total));
  const fundido = opciones.fundido ?? true, cubrir = opciones.cubrir ?? true, inercia = opciones.inercia ?? 0.09;
  const dpr = Math.max(1, opciones.dpr ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const seccion = opciones.seccion ?? canvas.parentElement ?? canvas;
  const reducido = opciones.movimientoReducido ?? (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  const apagado = (): boolean => Boolean(opciones.apagado) || reducido;
  const imagenes: (HTMLImageElement | null)[] = new Array(total).fill(null), muestras: number[] = [];
  let cabezal = 0, objetivo = 0, raf = 0, ultimo = 0, visible = false, parada = false, precargado = false;
  const dibujar = (): void => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ancho = Math.max(1, Math.round((canvas.clientWidth || canvas.width / dpr || 1) * dpr));
    const alto = Math.max(1, Math.round((canvas.clientHeight || canvas.height / dpr || 1) * dpr));
    if (canvas.width !== ancho) canvas.width = ancho; if (canvas.height !== alto) canvas.height = alto;
    const cuadro = cuadroDePelicula(cabezal, total, { fundido, apagado: apagado() });
    ctx.clearRect(0, 0, ancho, alto);
    pintar(ctx, imagenes[cuadro.actual], ancho, alto, cuadro.opacidadActual, cubrir);
    if (cuadro.siguiente !== cuadro.actual) pintar(ctx, imagenes[cuadro.siguiente], ancho, alto, cuadro.opacidadSiguiente, cubrir);
  };
  const cargar = (): void => {
    if (precargado) return;
    precargado = true;
    const indices = apagado() ? [total - 1] : Array.from({ length: total }, (_, i) => i);
    for (const i of indices) {
      const imagen = new Image();
      imagen.decoding = "async";
      imagen.onload = () => { if (i === 0 || apagado()) dibujar(); };
      imagen.src = fotogramas(i);
      imagenes[i] = imagen;
    }
    dibujar();
  };
  const tick = (tiempo: number): void => {
    raf = 0;
    if (parada) return;
    if (ultimo) muestras.push(Math.max(0, tiempo - ultimo));
    if (muestras.length > 600) muestras.splice(0, muestras.length - 600);
    ultimo = tiempo;
    cabezal = cabezal + (objetivo - cabezal) * limitar(inercia, 0.01, 1);
    dibujar();
    if (Math.abs(objetivo - cabezal) > 0.0005) raf = requestAnimationFrame(tick);
    else { cabezal = objetivo; ultimo = 0; }
  };
  const despertar = (): void => {
    if (parada || !visible) return;
    const caja = seccion.getBoundingClientRect();
    objetivo = apagado() ? 1 : fraccionDePelicula(caja.top, caja.height, window.innerHeight || 1);
    if (apagado()) { cabezal = objetivo; dibujar(); return; }
    if (!raf) { ultimo = 0; raf = requestAnimationFrame(tick); }
  };
  const hayIO = typeof IntersectionObserver === "function";
  const pausa = hayIO ? new IntersectionObserver((entradas) => {
    visible = entradas.some((e) => e.isIntersecting);
    if (visible) { cargar(); despertar(); return; }
    if (raf) cancelAnimationFrame(raf); raf = 0; ultimo = 0;
  }) : null;
  const carga = hayIO ? new IntersectionObserver((entradas, observador) => {
    if (entradas.some((e) => e.isIntersecting)) { cargar(); observador.disconnect(); }
  }, { rootMargin: "300px" }) : null;
  pausa?.observe(seccion); carga?.observe(seccion);
  window.addEventListener("scroll", despertar, { passive: true });
  if (!pausa) { visible = true; cargar(); despertar(); }
  return {
    parar: () => {
      parada = true; if (raf) cancelAnimationFrame(raf); raf = 0;
      pausa?.disconnect(); carga?.disconnect();
      window.removeEventListener("scroll", despertar);
    },
    jank: () => resumirJank(muestras),
  };
}
