"use client";

import { trocearTexto } from "@/lib/voces/trocear";
import { anotarMedida, type BaseMedida } from "@/lib/aurora/medidas-voz";

export interface OpcionesConversacionFluida {
  presupuestoMs?: number;
  origenNeurona?: string;
  idioma?: string;
}

export interface ResultadoConversacionFluida {
  motorElegido: string;
  tiempoPrimerSonidoMs: number;
  trozosEmitidos: number;
  interrumpido: boolean;
}

export function elegirMotorPorLatencia(
  motoresDisponibles: readonly string[],
  medidasHistoricas: Array<{ motor: string; tipo: string; valor: number; neurona?: string }>,
  origenNeurona?: string,
): string {
  if (motoresDisponibles.length === 0) return "browser";
  const filtradas = origenNeurona
    ? medidasHistoricas.filter((m) => m.neurona === origenNeurona && m.tipo === "primer-sonido")
    : medidasHistoricas.filter((m) => m.tipo === "primer-sonido");

  const medias = new Map<string, number>();
  for (const m of motoresDisponibles) {
    const vals = filtradas.filter((f) => f.motor === m).map((f) => f.valor);
    if (vals.length > 0) {
      medias.set(m, vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  let mejor = motoresDisponibles[0];
  let menorLatencia = Infinity;
  for (const m of motoresDisponibles) {
    const lat = medias.get(m) ?? 500; // default presupuesto
    if (lat < menorLatencia) {
      menorLatencia = lat;
      mejor = m;
    }
  }
  return mejor;
}

export async function sintetizarConversacionFluida(
  texto: string,
  motores: readonly string[],
  sintetizador: (motor: string, trozo: string) => Promise<boolean>,
  opciones: OpcionesConversacionFluida = {},
): Promise<ResultadoConversacionFluida> {
  const clean = (texto || "").trim();
  if (!clean) {
    return { motorElegido: "browser", tiempoPrimerSonidoMs: 0, trozosEmitidos: 0, interrompido: false };
  }

  const trozos = trocearTexto(clean, 180);
  const motor = motores[0] ?? "browser";
  const baseMedida: BaseMedida = { motor, idioma: opciones.idioma, neurona: opciones.origenNeurona, flujo: true };

  let emitidos = 0;
  const inicio = Date.now();
  let primerSonidoMs = 0;

  for (let i = 0; i < trozos.length; i++) {
    const t = trozos[i];
    const t0 = Date.now();
    const ok = await sintetizador(motor, t);
    const delta = Math.max(1, Date.now() - t0);

    if (i === 0) {
      primerSonidoMs = delta;
      anotarMedida({ ...baseMedida, tipo: "primer-sonido", valor: primerSonidoMs });
    }

    if (ok) {
      emitidos++;
    } else {
      break;
    }
  }

  return {
    motorElegido: motor,
    tiempoPrimerSonidoMs: primerSonidoMs,
    trozosEmitidos: emitidos,
    interrumpido: false,
  };
}
