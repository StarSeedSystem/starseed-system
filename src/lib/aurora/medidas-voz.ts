"use client";

import { safeGet, safeSet } from "@/lib/safe-storage";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

export interface MedidaVoz {
  neurona: string;
  motor: string;
  tipo:
    | "primer-sonido"
    | "tiempo-real-oido"
    | "tiempo-real-voz"
    | "correccion";
  valor: number;
  timestamp: number;
  /** Idioma del tramo medido («es», «en»…), cuando quien midió lo conoce. */
  idioma?: string;
  /** true solo si la medida se tomó en flujo (con parciales; oído Phonon/Web Speech). */
  flujo?: boolean;
}

const CLAVE = "starseed.voz.medidas.v2";

/** Máximo por (motor, tipo): coincide con VOZ_MEDIDAS_POR_MOTOR del anuncio en la malla. */
export const MAX_POR_MOTOR_Y_TIPO = 20;

/** Recorta la lista dejando ÚNTIMAmente las `maxPorGrupo` más recientes de cada (motor, tipo). */
export function recortarMedidas(
  medidas: readonly MedidaVoz[],
  maxPorGrupo: number = MAX_POR_MOTOR_Y_TIPO,
): MedidaVoz[] {
  const ultimos = new Map<string, number>();
  const salida: MedidaVoz[] = [];
  for (let i = medidas.length - 1; i >= 0; i--) {
    const m = medidas[i];
    const clave = `${m.motor}::${m.tipo}`;
    const n = (ultimos.get(clave) ?? 0) + 1;
    ultimos.set(clave, n);
    if (n <= maxPorGrupo) salida.unshift(m);
  }
  return salida;
}

/** Añade una medida a la lista y la recorta (pura, sin almacenamiento). */
export function integrarMedida(previas: readonly MedidaVoz[], medida: MedidaVoz): MedidaVoz[] {
  return recortarMedidas([...previas, medida]);
}

/** Media móvil, p90 y nº recientes de una lista de medidas (la de `medidasDe`, en pura). */
export function resumenDe(
  medidas: readonly MedidaVoz[],
): { mediaMovil: number; p90: number; recientes: number } | null {
  const ultimos50 = medidas.slice(-50);
  const valores = ultimos50.map((m) => m.valor).filter((v) => typeof v === "number" && isFinite(v));
  if (!valores.length) return null;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.ceil(ordenados.length * 0.9) - 1;
  const p90 = ordenados[Math.max(0, idx)];
  return { mediaMovil: media, p90, recientes: valores.length };
}

/** Una entrada que la migración sí puede llevarse: con valor y timestamp numéricos. */
const esEntradaV1Valida = (d: unknown): boolean =>
  typeof d === "object" &&
  d !== null &&
  typeof (d as Record<string, unknown>).valor === "number" &&
  typeof (d as Record<string, unknown>).timestamp === "number";

/**
 * Convierte las medidas v1 (que `safeGet` entrega como TEXTO JSON, y por eso la
 * vieja lectura estaba vacía) en `MedidaVoz[]`. Acepta texto, texto doblemente
 * serializado o lista ya parseada; lo que no encaja se descarta. Pura, nunca lanza.
 */
export function migrarDeV1Parse(viejoRaw: unknown): MedidaVoz[] {
  try {
    let datos: unknown = viejoRaw;
    if (typeof datos === "string") {
      try { datos = JSON.parse(datos) as unknown; } catch { return []; }
    }
    if (typeof datos === "string") {
      try { datos = JSON.parse(datos) as unknown; } catch { return []; }
    }
    if (!Array.isArray(datos)) return [];
    return (datos as unknown[]).filter(esEntradaV1Valida).map((d) => {
      const r = d as Record<string, unknown>;
      const tipo = typeof r.tipo === "string"
        && (r.tipo === "primer-sonido" || r.tipo === "tiempo-real-oido" || r.tipo === "tiempo-real-voz" || r.tipo === "correccion")
        ? r.tipo
        : "correccion";
      return {
        neurona: typeof r.neurona === "string" ? r.neurona : "",
        motor: typeof r.motor === "string" ? r.motor : "",
        tipo,
        valor: r.valor as number,
        timestamp: r.timestamp as number,
        ...(typeof r.idioma === "string" && r.idioma !== "" ? { idioma: r.idioma } : {}),
        ...(r.flujo === true ? { flujo: true } : {}),
      } as MedidaVoz;
    });
  } catch {
    return [];
  }
}

export function leerMedidas(neurona?: string): MedidaVoz[] {
  try {
    const raw = safeGet(CLAVE);
    const todas = migrarDeV1Parse(raw);
    if (!todas.length) return [];
    return neurona ? todas.filter((m) => m.neurona === neurona) : todas;
  } catch {
    return [];
  }
}

export function anotarMedida(p: {
  neurona?: string;
  motor: string;
  tipo: MedidaVoz["tipo"];
  valor: number;
  idioma?: string;
  flujo?: boolean;
}): void {
  try {
    const destino = p.neurona ?? neuronDeviceIdActual();
    const medida: MedidaVoz = {
      neurona: destino,
      motor: p.motor,
      tipo: p.tipo,
      valor: p.valor,
      timestamp: Date.now(),
      ...(p.idioma ? { idioma: p.idioma } : {}),
      ...(p.flujo === true ? { flujo: true } : {}),
    };
    safeSet(CLAVE, JSON.stringify(integrarMedida(leerMedidas(), medida)));
  } catch {
    // sin almacenamiento
  }
}

export function medidasDe(neurona: string): {
  mediaMovil: number;
  p90: number;
  recientes: number;
} | null {
  return resumenDe(leerMedidas(neurona));
}

export function migrarDeV1(): void {
  try {
    const convertidas = migrarDeV1Parse(safeGet("starseed.voz.medidas.v1"));
    if (convertidas.length) {
      safeSet("starseed.voz.medidas.v1", "");
      const ya = migrarDeV1Parse(safeGet(CLAVE));
      safeSet(CLAVE, JSON.stringify(recortarMedidas([...ya, ...convertidas])));
    }
  } catch {
    // migrar sin almacenamiento
  }
}

migrarDeV1();
