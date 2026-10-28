/**
 * HFR1018M · `video.componer`: herramienta de agente que PREPARA una composición
 * HyperFrames desde la plantilla StarSeed, sin GSAP.
 *
 * Módulo PURO: no lee disco, no llama a la red, no lanza procesos y no habla.
 * Si el pedido trae texto para narrar, devuelve la PETICIÓN para la puerta única
 * de voz (`hablarStarSeed`); quien la ejecute decide timbre y nivel.
 */
import type { ContextoVoz } from "@/lib/aurora/voz-starseed/motor";
import { detectarAdaptadores } from "./adaptadores";
import { plantillaStarSeed } from "./plantilla";

export type FormatoVideo = "horizontal" | "vertical" | "cuadrado";
export type SiguientePaso = "lint" | "render";

/** Lo que se pide: texto libre, título visible y, si toca, lo que se narra. */
export interface PedidoComposicion {
  texto?: string;
  titulo?: string;
  narrar?: string;
}

export interface VozComposicion {
  texto?: string;
  contexto?: ContextoVoz;
}

export interface OpcionesComponer {
  pedido: string | PedidoComposicion;
  duracion?: number;
  formato?: string;
  voz?: string | VozComposicion;
}

/** Petición lista para la puerta única; este módulo NO la ejecuta. */
export interface PeticionVozVideo {
  texto: string;
  contexto: ContextoVoz;
  puerta: "hablarStarSeed";
}

export interface ComposicionVideo {
  html: string;
  avisos: string[];
  siguiente: SiguientePaso;
  peticionVoz: PeticionVozVideo | null;
}

export const DURACION_MIN = 1;
export const DURACION_MAX = 600;
export const DURACION_DEFECTO = 3;
export const TITULO_DEFECTO = "StarSeed OS";
const TITULO_MAX = 200;

const DIMENSIONES: Record<FormatoVideo, { ancho: number; alto: number }> = {
  horizontal: { ancho: 1280, alto: 720 },
  vertical: { ancho: 720, alto: 1280 },
  cuadrado: { ancho: 720, alto: 720 },
};

/** Sinónimos habituales de formato; lo que no esté aquí cae a horizontal con aviso. */
const FORMATOS: Record<string, FormatoVideo> = {
  horizontal: "horizontal", "16:9": "horizontal", landscape: "horizontal", apaisado: "horizontal",
  vertical: "vertical", "9:16": "vertical", portrait: "vertical", retrato: "vertical",
  cuadrado: "cuadrado", "1:1": "cuadrado", square: "cuadrado",
};

function normalizarFormato(formato?: string): { formato: FormatoVideo; aviso?: string } {
  const clave = (formato ?? "").trim().toLowerCase();
  if (!clave) return { formato: "horizontal" };
  const encontrado = FORMATOS[clave];
  if (encontrado) return { formato: encontrado };
  return { formato: "horizontal", aviso: `El formato «${formato}» no se reconoce; se compone en horizontal 16:9.` };
}

function normalizarDuracion(duracion?: number): { duracion: number; aviso?: string } {
  if (duracion === undefined) return { duracion: DURACION_DEFECTO };
  if (!Number.isFinite(duracion)) return { duracion: DURACION_DEFECTO, aviso: `La duración no es un número; se usan ${DURACION_DEFECTO} s.` };
  const ajustada = Math.min(DURACION_MAX, Math.max(DURACION_MIN, Math.round(duracion)));
  if (ajustada !== duracion) return { duracion: ajustada, aviso: `La duración se ajustó a ${ajustada} s (entre ${DURACION_MIN} y ${DURACION_MAX}).` };
  return { duracion: ajustada };
}

function normalizarPedido(pedido: string | PedidoComposicion): PedidoComposicion {
  return typeof pedido === "string" ? { texto: pedido } : (pedido ?? {});
}

function peticionDeVoz(p: PedidoComposicion, voz?: string | VozComposicion): PeticionVozVideo | null {
  const textoVoz = typeof voz === "string" ? voz : voz?.texto;
  const texto = (p.narrar ?? textoVoz ?? "").trim();
  if (!texto) return null;
  const contexto = typeof voz === "object" && voz?.contexto ? voz.contexto : "lectura";
  return { texto, contexto, puerta: "hablarStarSeed" };
}

/** Compone el HTML determinista y dice el siguiente paso; no sintetiza voz ni renderiza. */
export function componerVideo({ pedido, duracion, formato, voz }: OpcionesComponer): ComposicionVideo {
  const p = normalizarPedido(pedido), f = normalizarFormato(formato), d = normalizarDuracion(duracion);
  const avisos: string[] = [];
  if (f.aviso) avisos.push(f.aviso);
  if (d.aviso) avisos.push(d.aviso);

  const titulo = (p.titulo ?? p.texto ?? "").trim().slice(0, TITULO_MAX) || TITULO_DEFECTO;
  if (!p.titulo && !p.texto) avisos.push(`El pedido no trae título; se usa «${TITULO_DEFECTO}».`);
  if (/gsap|tweenmax|timelinemax/i.test(`${p.texto ?? ""} ${p.titulo ?? ""}`)) {
    avisos.push("La composición no usa GSAP: se anima con CSS (licencia GSAP Standard, §2).");
  }

  const { ancho, alto } = DIMENSIONES[f.formato];
  const html = plantillaStarSeed({ ancho, alto, duracion: d.duracion, titulo, fondo: "#05070d", acento: "#8ef0ff" });
  const deteccion = detectarAdaptadores(html);
  if (!deteccion.editableVisualmente) avisos.push(`La composición no es editable visualmente: ${deteccion.motivo}`);

  const peticionVoz = peticionDeVoz(p, voz);
  if (peticionVoz) avisos.push("La narración queda pedida a la voz única; este módulo no la sintetiza.");
  return { html, avisos, siguiente: avisos.length ? "lint" : "render", peticionVoz };
}
