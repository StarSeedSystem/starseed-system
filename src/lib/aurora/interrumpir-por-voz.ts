/**
 * Interrupción por voz (Ola 1015V): detector puro por energía con histéresis.
 * Sin DOM, sin micrófono, sin red. Todo inyectable para tests deterministas.
 */

import { esEcoPropio, ventanaEcoMs } from "@/lib/aurora/anti-bucle-voz";

export interface MuestraEnergia {
  db?: number;
  energia?: number;
  rms?: number;
  ahora: number;
}

export interface EstadoInterrupcion {
  hablando: boolean;
  ecoHasta?: number | null;
  ultimoInicioVoz?: number | null;
}

export interface OpcionesInterrupcion {
  umbralDb?: number;
  minimoMs?: number;
  movil?: boolean;
  latenciaSalidaMs?: number;
}

export interface ResultadoInterrupcion {
  interrumpir: boolean;
  motivo?: string;
}

const UMBRAL_DB_POR_DEFECTO = -40;
const MINIMO_MS_POR_DEFECTO = 250;

/** Extrae un valor numérico normalizado para comparar energía. */
function obtenerEnergia(muestra: MuestraEnergia): number {
  if (typeof muestra.db === "number" && !Number.isNaN(muestra.db)) {
    return muestra.db;
  }
  if (typeof muestra.energia === "number" && !Number.isNaN(muestra.energia)) {
    if (muestra.energia >= 0 && muestra.energia <= 1) {
      return muestra.energia > 0 ? 20 * Math.log10(muestra.energia) : -1000;
    }
    return muestra.energia;
  }
  if (typeof muestra.rms === "number" && !Number.isNaN(muestra.rms)) {
    if (muestra.rms >= 0 && muestra.rms <= 1) {
      return muestra.rms > 0 ? 20 * Math.log10(muestra.rms) : -1000;
    }
    return muestra.rms;
  }
  return -1000;
}

/**
 * Decide si interrumpir la voz de Astraura con histéresis.
 * Requiere superar el umbral por al menos `minimoMs: 250`.
 * Respeta la ventana anti-eco: no interrumpe si es eco propio o está en ventanaEcoMs.
 */
export function decidirInterrupcion(
  muestras: MuestraEnergia[],
  estado: EstadoInterrupcion,
  opciones: OpcionesInterrupcion = {},
): ResultadoInterrupcion {
  if (!estado.hablando) {
    return { interrumpir: false };
  }

  const ahora = muestras.length > 0 ? muestras[muestras.length - 1].ahora : Date.now();
  const ecoHasta = estado.ecoHasta ?? null;
  if (ecoHasta !== null && ahora <= ecoHasta) {
    return { interrumpir: false, motivo: "ventana-eco" };
  }

  const umbralDb = opciones.umbralDb ?? UMBRAL_DB_POR_DEFECTO;
  const minimoMs = opciones.minimoMs ?? MINIMO_MS_POR_DEFECTO;

  if (muestras.length === 0) {
    return { interrumpir: false };
  }

  let inicio = -1;
  for (let i = 0; i < muestras.length; i++) {
    const energia = obtenerEnergia(muestras[i]);
    if (energia >= umbralDb) {
      if (inicio === -1) inicio = i;
    } else {
      inicio = -1;
    }
  }

  if (inicio === -1) {
    return { interrumpir: false };
  }

  const tInicio = muestras[inicio].ahora;
  const tUltimo = muestras[muestras.length - 1].ahora;
  const duracion = tUltimo - tInicio;
  if (duracion < minimoMs) {
    return { interrumpir: false };
  }

  // Construir transcripción sintética a partir de muestras con energía suficiente
  // para respetar esEcoPropio si hay contexto
  const tramo = muestras.slice(inicio);
  const fragmentos = tramo
    .map((m) => (typeof (m as any).texto === "string" ? (m as any).texto : ""))
    .filter((t) => t.trim().length > 0);
  const transcripcion = fragmentos.join(" ").trim();

  if (transcripcion) {
    try {
      if (esEcoPropio(transcripcion, ahora)) {
        return { interrumpir: false, motivo: "eco-propio" };
      }
    } catch {
      // seguir adelante
    }
  }

  return { interrumpir: true, motivo: "voz-humana" };
}

export { ventanaEcoMs, esEcoPropio };
