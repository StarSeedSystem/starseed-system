/**
 * Herramienta de agente «video.componer» (Ola 1018H · HFR1018M)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prepara una composición HyperFrames desde la plantilla StarSeed SIN GSAP.
 * Es un módulo PURO: no toca red, disco, procesos ni reloj; tampoco sintetiza
 * voz. Si el pedido trae narración, devuelve la petición para la puerta única
 * de voz (`hablar()`), que la ejecutará fuera de aquí.
 */

import { plantillaStarSeed } from "./plantilla";

export type FormatoComposicion = "horizontal" | "vertical" | "cuadrado" | "4k" | string;

export interface PeticionVozVideo {
  texto: string;
  contexto: "lectura";
  persona?: string;
}

export interface EntradaComponer {
  pedido: string;
  duracion?: number;
  formato?: FormatoComposicion;
  voz?: string | { texto: string; persona?: string };
  /** Aditivo: quien ya tiene sus colores (la ruta del OS) los conserva. */
  fondo?: string;
  acento?: string;
}

export interface ComposicionVideo {
  html: string;
  avisos: string[];
  siguiente: "lint" | "render";
  peticionVoz?: PeticionVozVideo;
}

export const DURACION_DEFECTO = 3, DURACION_MINIMA = 1, DURACION_MAXIMA = 600;
export const FONDO_STARSEED = "#0A0F1D", ACENTO_STARSEED = "#00F0FF";
type Dimensiones = { ancho: number; alto: number };
const HORIZONTAL: Dimensiones = { ancho: 1280, alto: 720 }, VERTICAL: Dimensiones = { ancho: 720, alto: 1280 };
const CUADRADO: Dimensiones = { ancho: 720, alto: 720 }, CUATRO_K: Dimensiones = { ancho: 3840, alto: 2160 };

const FORMATOS: Record<string, Dimensiones> = {
  horizontal: HORIZONTAL,
  apaisado: HORIZONTAL,
  landscape: HORIZONTAL,
  "16:9": HORIZONTAL,
  "1280x720": HORIZONTAL,
  "1920x1080": { ancho: 1920, alto: 1080 },
  vertical: VERTICAL,
  retrato: VERTICAL,
  portrait: VERTICAL,
  "9:16": VERTICAL,
  "720x1280": VERTICAL,
  "1080x1920": { ancho: 1080, alto: 1920 },
  cuadrado: CUADRADO,
  square: CUADRADO,
  "1:1": CUADRADO,
  "720x720": CUADRADO,
  "4k": CUATRO_K,
  uhd: CUATRO_K,
  "3840x2160": CUATRO_K,
};

/** Normaliza el formato pedido y avisa (sin lanzar) cuando no lo conoce. */
function dimensionesDe(formato: string | undefined): { dimensiones: Dimensiones; aviso?: string } {
  const clave = (formato ?? "").trim().toLowerCase();
  if (!clave) return { dimensiones: HORIZONTAL };
  const encontrado = FORMATOS[clave];
  if (encontrado) return { dimensiones: encontrado };
  const mostrado = clave.slice(0, 40);
  return { dimensiones: HORIZONTAL, aviso: `No conozco el formato «${mostrado}»: uso horizontal 16:9.` };
}

/** Acota la duración al rango que entiende HyperFrames y lo dice si la cambió. */
function normalizarDuracion(valor: number | undefined): { duracion: number; aviso?: string } {
  if (valor === undefined || Number.isNaN(valor)) return { duracion: DURACION_DEFECTO };
  if (!Number.isFinite(valor)) return { duracion: DURACION_DEFECTO, aviso: `Duración no válida: uso ${DURACION_DEFECTO} s.` };
  const acotada = Math.min(DURACION_MAXIMA, Math.max(DURACION_MINIMA, valor));
  if (acotada !== valor) {
    return { duracion: acotada, aviso: `Duración fuera de rango (${DURACION_MINIMA}–${DURACION_MAXIMA} s): uso ${acotada} s.` };
  }
  return { duracion: valor };
}

/** Solo devuelve la petición de voz: la puerta única decide motor y nivel. */
function peticionDeVoz(voz: EntradaComponer["voz"]): PeticionVozVideo | null {
  const texto = typeof voz === "string" ? voz : voz?.texto;
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;
  const persona = typeof voz === "object" ? voz.persona?.trim() : undefined;
  return persona ? { texto: limpio, contexto: "lectura", persona } : { texto: limpio, contexto: "lectura" };
}

export function componerVideo({ pedido, duracion, formato, voz, fondo, acento }: EntradaComponer): ComposicionVideo {
  const avisos: string[] = [];
  const titulo = (pedido ?? "").trim();
  if (!titulo) avisos.push("El pedido venía vacío: compuse la plantilla base de StarSeed.");

  const { dimensiones, aviso: avisoFormato } = dimensionesDe(formato);
  if (avisoFormato) avisos.push(avisoFormato);

  const { duracion: duracionAcotada, aviso: avisoDuracion } = normalizarDuracion(duracion);
  if (avisoDuracion) avisos.push(avisoDuracion);

  const peticionVoz = peticionDeVoz(voz);
  if (peticionVoz) avisos.push("Narración preparada para la puerta única de voz: esta composición no la sintetiza.");

  const html = plantillaStarSeed({
    ancho: dimensiones.ancho,
    alto: dimensiones.alto,
    duracion: duracionAcotada,
    titulo: titulo || "StarSeed OS",
    fondo: (fondo ?? "").trim() || FONDO_STARSEED,
    acento: (acento ?? "").trim() || ACENTO_STARSEED,
  });

  return {
    html,
    avisos,
    siguiente: avisos.length > 0 ? "lint" : "render",
    ...(peticionVoz ? { peticionVoz } : {}),
  };
}
