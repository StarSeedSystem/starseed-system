/**
 * validadores — validación y normalización de señales (MRA2/MAP1116).
 * Puro: sin React, sin red, sin `node:*`.
 */
import type { Medio, OrigenDato, CapaRed, TipoVinculo, Vinculo, Compatibilidad, SenalEspectro } from "./tipos";

const MEDIOS_VALIDOS: readonly Medio[] = ["wifi", "bluetooth", "lora", "celular", "malla", "internet", "estacion", "sdr"] as const;
const ORIGENES_VALIDOS: readonly OrigenDato[] = ["medida", "declarada", "estimada"] as const;
const CAPAS_VALIDAS: readonly CapaRed[] = ["propia", "publica", "comunidad", "privada", "externa"] as const;
const TIPOS_VINCULO: readonly TipoVinculo[] = ["antena", "cerebro", "nodo", "neurona", "servidor", "estacion", "router"] as const;

export function esSenalValida(x: unknown): x is SenalEspectro {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.medio === "string" && typeof s.banda === "string" &&
    (s.frecuenciaKhz === null || typeof s.frecuenciaKhz === "number") &&
    (s.anchoKhz === null || typeof s.anchoKhz === "number") &&
    (s.fuerzaDbm === null || typeof s.fuerzaDbm === "number") &&
    (s.calidad === null || typeof s.calidad === "number") &&
    typeof s.origen === "string" && typeof s.capa === "string" && typeof s.fuente === "string" &&
    (s.medidoEn === null || typeof s.medidoEn === "number") &&
    (s.zona === null || typeof s.zona === "string") &&
    (s.vinculo === undefined || (typeof s.vinculo === "object" && s.vinculo !== null)) &&
    Array.isArray(s.compatibles);
}

export function normalizarSenal(raw: unknown): SenalEspectro | null {
  if (!esSenalValida(raw)) return null;
  const s = raw;
  if (typeof s.frecuenciaKhz === "number" && s.frecuenciaKhz <= 0) return null;
  if (typeof s.anchoKhz === "number" && s.anchoKhz <= 0) return null;
  if (typeof s.zona === "string") {
    const z = s.zona.trim();
    if (z.length > 5) return null;
    if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(z)) return null;
  }
  const banda = typeof s.banda === "string" ? s.banda.slice(0, 32) : "";
  const fuente = typeof s.fuente === "string" ? s.fuente.slice(0, 128) : "";
  const zona = typeof s.zona === "string" ? s.zona.trim().slice(0, 5) : null;
  if (!ORIGENES_VALIDOS.includes(s.origen as OrigenDato)) return null;
  if (!CAPAS_VALIDAS.includes(s.capa as CapaRed)) return null;
  if (!MEDIOS_VALIDOS.includes(s.medio as Medio)) return null;
  let vinculo: Vinculo | undefined;
  if (s.vinculo && typeof s.vinculo === "object") {
    const v = s.vinculo as unknown as Record<string, unknown>;
    if (typeof v.tipo === "string" && TIPOS_VINCULO.includes(v.tipo as TipoVinculo) && typeof v.id === "string") {
      vinculo = { tipo: v.tipo as TipoVinculo, id: v.id.slice(0, 64) };
    }
  }
  const compatibles: Compatibilidad[] = [];
  if (Array.isArray(s.compatibles)) {
    for (const c of s.compatibles) if (c && typeof c === "object") {
      const co = c as unknown as Record<string, unknown>;
      if (typeof co.con === "string" && (MEDIOS_VALIDOS.includes(co.con as Medio) || co.con === "neurona" || co.con === "estacion") &&
        typeof co.que === "string" && typeof co.posible === "boolean" && typeof co.motivo === "string") {
        compatibles.push({ con: co.con as Medio | "neurona" | "estacion", que: co.que.slice(0, 64), posible: co.posible, motivo: co.motivo.slice(0, 128) });
      }
    }
  }
  return { id: s.id.slice(0, 64), medio: s.medio as Medio, banda, frecuenciaKhz: s.frecuenciaKhz, anchoKhz: s.anchoKhz,
    fuerzaDbm: s.fuerzaDbm, calidad: s.calidad, origen: s.origen as OrigenDato, capa: s.capa as CapaRed,
    fuente, medidoEn: s.medidoEn, zona, vinculo, compatibles };
}