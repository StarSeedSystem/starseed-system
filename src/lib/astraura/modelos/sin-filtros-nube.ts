// Proveedor sin filtros de la nube: solo en conversaciones privadas propias (MOD1116).
// Mismo contrato que aplicarEleccionManual pero para proveedores de la nube. Módulo PURO.

import { CASOS_SIN_FILTROS, type ContextoUso } from "./recomendar";
import type { CasoUso } from "./tipos";

export const PROVEEDORES_SIN_FILTROS_NUBE = ["abliteration"] as const;

export function proveedorEsSinFiltros(id: string): boolean {
  return PROVEEDORES_SIN_FILTROS_NUBE.includes(id as (typeof PROVEEDORES_SIN_FILTROS_NUBE)[number]);
}

export interface ProveedorSinFiltrosEntrada {
  /** La persona activó (y confirmó) «Mostrar variantes sin filtros». */
  activado: boolean;
  /** false = este perfil no puede usarlas (p. ej. menor de edad). */
  disponible: boolean;
  /** Dónde se usaría la respuesta. Por defecto `compartido`. */
  contexto?: ContextoUso;
  /** Caso de uso. */
  caso: CasoUso;
  /** La cuenta tiene su propia clave (nunca la de otra persona ni la de la fundación). */
  claveDeLaCuenta: boolean;
}

export interface ProveedorSinFiltrosSalida {
  permitido: boolean;
  /** Una línea en español que dice por qué NO se permite (null si se permite). */
  aviso: string | null;
}

const ETIQUETA_CONTEXTO: Record<ContextoUso, string> = {
  "privado-propio": "tus conversaciones privadas en tu neurona",
  compartido: "bots, dots o asistentes de grupo, comunidad o página (hablan con otras personas)",
  publico: "capas públicas",
  "segundo-plano": "segundo plano y aprendizaje colectivo",
  "malla-ajena": "servir a otra cuenta por la malla",
};

const ETIQUETA_CASO: Record<CasoUso, string> = {
  conversacion: "conversación",
  "archivos-privados": "archivos privados",
  "codigo-agentes": "código y agentes",
  vision: "visión",
  voz: "voz",
  "bots-dots": "bots y dots",
  "capas-conciencia": "capas de conciencia",
  "segundo-plano": "segundo plano",
};

function rechazo(porque: string): ProveedorSinFiltrosSalida {
  return { permitido: false, aviso: porque };
}

/**
 * Determina si un proveedor sin filtros de la nube puede usarse.
 * Reglas (iguales que aplicarEleccionManual para variantes locales):
 * 1. Permitido en el perfil (disponible).
 * 2. Interruptor «Mostrar variantes sin filtros» encendido (activado).
 * 3. Contexto `privado-propio` (el valor por defecto es `compartido`).
 *    - Caso especial `malla-ajena`: mensaje explícito "nunca se sirve a otra cuenta por la malla."
 * 4. Caso dentro de `CASOS_SIN_FILTROS`.
 * 5. La cuenta tiene su propia clave (nunca la de otra persona ni la de la fundación).
 * 6. NUNCA se sirve a otra cuenta ni por la malla.
 */
export function proveedorSinFiltrosPermitido(entrada: ProveedorSinFiltrosEntrada): ProveedorSinFiltrosSalida {
  const { activado, disponible, contexto, caso, claveDeLaCuenta } = entrada;
  const ctx = contexto ?? "compartido";

  if (!disponible) return rechazo("las variantes sin filtros no están disponibles en este perfil.");
  if (!activado) return rechazo("«Mostrar variantes sin filtros» está apagado.");
  if (ctx === "malla-ajena") return rechazo("nunca se sirve a otra cuenta por la malla.");
  if (ctx !== "privado-propio") return rechazo(`solo se usan en ${ETIQUETA_CONTEXTO["privado-propio"]}, no en ${ETIQUETA_CONTEXTO[ctx]}.`);
  if (!CASOS_SIN_FILTROS.has(caso)) return rechazo("ese uso habla con otras personas o corre sin ti delante.");
  if (!claveDeLaCuenta) return rechazo("la cuenta debe usar su propia clave (nunca la de otra persona ni la de la fundación).");

  return { permitido: true, aviso: null };
}