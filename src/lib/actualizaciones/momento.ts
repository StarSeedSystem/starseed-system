/**
 * Momento seguro para aplicar una capa (contrato §5 «Momento»).
 * ════════════════════════════════════════════════════════════
 * Nunca durante una llamada, un directo o una escritura activa (salvo `datos`, que se aplica en
 * caliente); nunca con la batería por debajo del 20 % sin cargar; las descargas grandes (> 50 MB)
 * solo con Wi-Fi o si la persona permite usar datos. El contexto lo mide quien llama
 * (`momento-navegador.ts` en el navegador): aquí solo se decide.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { COMO_SE_APLICA } from "./capas";
import type { CapaActualizacion } from "./manifiesto";

export interface ContextoMomento {
  enLlamada: boolean;
  enDirecto: boolean;
  escribiendo: boolean;
  /** 0-100, o null si el aparato no lo dice. */
  bateriaPct: number | null;
  cargando: boolean;
  /** Conexión sin límite (Wi-Fi o cable). null = desconocida. */
  wifi: boolean | null;
  datosPermitidos: boolean;
}

export const UMBRAL_BATERIA_PCT = 20;
export const UMBRAL_DESCARGA_GRANDE_BYTES = 50 * 1024 * 1024;

export type MotivoEspera = "llamada" | "directo" | "escribiendo" | "bateria-baja" | "espera-wifi";

export const TEXTO_MOTIVO: Record<MotivoEspera, string> = {
  llamada: "Esperando a que acabe la llamada.",
  directo: "Esperando a que acabe el directo.",
  escribiendo: "Esperando a que termines de escribir.",
  "bateria-baja": "Batería por debajo del 20 %: espera a que se cargue.",
  "espera-wifi": "Descarga grande: espera a tener Wi-Fi (o permite usar datos).",
};

export type ResultadoMomento = { ok: true } | { ok: false; motivo: MotivoEspera; texto: string };

const no = (motivo: MotivoEspera): ResultadoMomento => ({ ok: false, motivo, texto: TEXTO_MOTIVO[motivo] });

/** ¿Se puede aplicar ESTA capa ahora? Devuelve el primer motivo para esperar, por prioridad. */
export function puedeAplicarAhora(ctx: ContextoMomento, tamanoBytes: number, capa: CapaActualizacion): ResultadoMomento {
  const enCaliente = COMO_SE_APLICA[capa].gesto === "en-caliente";
  if (ctx.enLlamada && !enCaliente) return no("llamada");
  if (ctx.enDirecto && !enCaliente) return no("directo");
  if (ctx.escribiendo && !enCaliente) return no("escribiendo");
  if (typeof ctx.bateriaPct === "number" && ctx.bateriaPct < UMBRAL_BATERIA_PCT && !ctx.cargando && !enCaliente) return no("bateria-baja");
  const grande = (Number.isFinite(tamanoBytes) ? tamanoBytes : 0) > UMBRAL_DESCARGA_GRANDE_BYTES;
  if (grande && ctx.wifi !== true && !ctx.datosPermitidos) return no("espera-wifi");
  return { ok: true };
}

/** Contexto neutro (nada lo impide): para servidores y pruebas. */
export const MOMENTO_LIBRE: ContextoMomento = {
  enLlamada: false,
  enDirecto: false,
  escribiendo: false,
  bateriaPct: null,
  cargando: false,
  wifi: true,
  datosPermitidos: false,
};
