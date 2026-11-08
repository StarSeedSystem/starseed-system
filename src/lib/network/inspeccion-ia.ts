"use client";

/**
 * inspeccion-ia — «Inspeccionar con IA» en la ventana de un envío (ARC1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Pregunta a Astraura (su router gratis-primero, `astrauraChat`, el mismo que usan los hilos con
 * Aurora) por el riesgo de un envío. Solo manda el RESUMEN de metadatos de `resumenParaIA`
 * (nombres, tipos, tamaños y hallazgos locales); los fragmentos de texto, solo si la persona lo
 * permitió. Turno «de agente» (`soloAgente`: sin contexto personal de la cuenta) y solo fuentes
 * gratis (`soloGratis`). La IA informa: nunca acepta ni rechaza nada. Nunca lanza.
 */

import { INSTRUCCION_IA, leerVeredictoIA, resumenParaIA, type ArchivoParaIA, type VeredictoIA } from "./inspeccion-archivos";

export interface PeticionInspeccionIA {
  origen?: string;
  via?: string;
  verificacion?: string;
  mensaje?: string;
  archivos: ArchivoParaIA[];
}

export type ResultadoInspeccionIA = { ok: true; veredicto: VeredictoIA; modelo?: string } | { ok: false; motivo: string };

export async function inspeccionarEnvioConIA(
  p: PeticionInspeccionIA,
  opciones: { signal?: AbortSignal; onStatus?: (s: string) => void } = {},
): Promise<ResultadoInspeccionIA> {
  if (!p.archivos.length) return { ok: false, motivo: "No hay archivos que inspeccionar." };
  try {
    const { astrauraChat } = await import("@/ai/astraura/router");
    const r = await astrauraChat({
      messages: [
        { role: "system", content: INSTRUCCION_IA },
        { role: "user", content: resumenParaIA(p) },
      ],
      temperature: 0,
      maxTokens: 900,
      soloAgente: true,
      soloGratis: true,
      ...(opciones.signal ? { signal: opciones.signal } : {}),
      ...(opciones.onStatus ? { onStatus: opciones.onStatus } : {}),
    });
    const veredicto = leerVeredictoIA(String(r?.text ?? ""), p.archivos.length);
    if (!veredicto) return { ok: false, motivo: "La IA respondió, pero sin un veredicto que se pueda leer. Las heurísticas locales siguen valiendo." };
    const modelo = r?.route?.modelLabel || r?.route?.model;
    return { ok: true, veredicto, ...(modelo ? { modelo } : {}) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error && e.message ? `No se pudo consultar a la IA: ${e.message}` : "No se pudo consultar a la IA." };
  }
}
