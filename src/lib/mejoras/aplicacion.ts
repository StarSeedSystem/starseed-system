/**
 * APLICAR una mejora por la capa que toca, con canaria, prueba de calidad y vuelta atrás (§5).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Aquí está el PLAN (los pasos y su orden), no la ejecución: quien ejecuta (el sondeo de la
 * máquina, la app nativa o el aplicador del navegador) recorre estos pasos y anota cada uno en
 * `~/.starseed/mejoras/historial.jsonl`. La regla de oro: la versión nueva se instala JUNTO a la
 * actual y solo se conmuta cuando pasa la prueba; la anterior se guarda para volver atrás.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { COMO_SE_APLICA } from "@/lib/actualizaciones/capas";
import type { SistemaMejorable } from "./tipos";

export type PasoAplicar =
  | "comprobar-espacio"
  | "descargar"
  | "verificar-huella"
  | "instalar-junto"
  | "arrancar-alternativo"
  | "prueba-calidad"
  | "conmutar"
  | "observar"
  | "conservar-anterior"
  | "actualizador-firmado"
  | "relanzar";

export const TEXTO_PASO: Record<PasoAplicar, string> = {
  "comprobar-espacio": "Comprobar el espacio libre (con la versión anterior guardada).",
  descargar: "Descargar a una carpeta nueva, sin tocar la actual.",
  "verificar-huella": "Verificar la huella sha256 de cada archivo.",
  "instalar-junto": "Instalar la versión nueva junto a la actual.",
  "arrancar-alternativo": "Arrancar la nueva en un puerto alternativo.",
  "prueba-calidad": "Prueba de calidad frente a la versión actual en esta neurona.",
  conmutar: "Conmutar a la nueva (puntero o servicio).",
  observar: "Observar 10 minutos: si falla al usarla, volver atrás sola.",
  "conservar-anterior": "Conservar la anterior 7 días para volver atrás.",
  "actualizador-firmado": "Actualizador nativo firmado (lo publica MetaGenesis).",
  relanzar: "Relanzar la app en un momento seguro.",
};

/** Días que se guarda la versión anterior; minutos de observación tras conmutar. */
export const DIAS_CONSERVAR_ANTERIOR = 7;
export const MINUTOS_OBSERVAR = 10;

export interface PlanAplicar {
  sistemaId: string;
  pasos: PasoAplicar[];
  /** Cómo se vuelve atrás si la prueba o la observación fallan. */
  vueltaAtras: string;
  /** ¿La persona nota algo? (de `COMO_SE_APLICA` de actualizaciones). */
  interrumpe: boolean;
}

/** Los pasos para aplicar un sistema según su capa. Un sistema `con-el-os` no tiene plan por neurona. */
export function planAplicar(s: SistemaMejorable): PlanAplicar | null {
  if (s.canal === "con-el-os") return null;
  const interrumpe = COMO_SE_APLICA[s.capa]?.interrumpe ?? true;
  if (s.capa === "modelos")
    return {
      sistemaId: s.id,
      pasos: ["comprobar-espacio", "descargar", "verificar-huella", "prueba-calidad", "conmutar", "observar", "conservar-anterior"],
      vueltaAtras: "Volver a apuntar a los pesos anteriores (siguen en el disco).",
      interrumpe,
    };
  if (s.capa === "servicios")
    return {
      sistemaId: s.id,
      pasos: ["comprobar-espacio", "descargar", "verificar-huella", "instalar-junto", "arrancar-alternativo", "prueba-calidad", "conmutar", "observar", "conservar-anterior"],
      vueltaAtras: "Volver a arrancar el servicio con la versión anterior (su carpeta se conserva).",
      interrumpe,
    };
  if (s.capa === "nativa")
    return {
      sistemaId: s.id,
      pasos: ["actualizador-firmado", "relanzar", "prueba-calidad", "observar"],
      vueltaAtras: "Reinstalar la versión anterior desde su canal (no se hace solo: se avisa).",
      interrumpe,
    };
  return null;
}

/** Un apunte del historial de mejoras de una neurona (`historial.jsonl`). */
export interface ApunteHistorial {
  sistemaId: string;
  neuronaId: string;
  accion: "aplicada" | "pospuesta" | "revertida" | "avisada";
  de: string | null;
  a: string | null;
  /** ISO. */
  cuando: string;
  motivo: string;
  /** Resumen de la prueba de calidad, si la hubo. */
  calidad?: string;
}

const ACCIONES = new Set(["aplicada", "pospuesta", "revertida", "avisada"]);

/** Sanea una línea del historial (llega del disco o de la red). Null si no sirve. */
export function sanearApunte(x: unknown): ApunteHistorial | null {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!o) return null;
  const s = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  const sistemaId = s("sistemaId");
  const neuronaId = s("neuronaId");
  const cuando = s("cuando");
  if (!sistemaId || !neuronaId || !cuando || !ACCIONES.has(String(o.accion))) return null;
  const ap: ApunteHistorial = {
    sistemaId,
    neuronaId,
    accion: o.accion as ApunteHistorial["accion"],
    de: s("de"),
    a: s("a"),
    cuando,
    motivo: s("motivo") ?? "",
  };
  const calidad = s("calidad");
  if (calidad) ap.calidad = calidad;
  return ap;
}
