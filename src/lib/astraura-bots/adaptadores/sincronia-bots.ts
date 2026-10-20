"use client";

import type { Bot } from "../tipos";
import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";

export function fusionarBots(
  local: Readonly<{ bots: Bot[]; actualizado: Record<string, number> }>,
  remoto: Readonly<{ bots: Bot[]; actualizado: Record<string, number> }>
): { bots: Bot[]; actualizado: Record<string, number> } {
  const botsPorId = new Map<string, Bot>();
  const actualizadoPorId: Record<string, number> = {};

  for (const bot of local.bots) {
    botsPorId.set(bot.id, bot);
    actualizadoPorId[bot.id] = local.actualizado[bot.id] ?? 0;
  }

  for (const bot of remoto.bots) {
    const timestampRemoto = remoto.actualizado[bot.id] ?? 0;
    const timestampLocal = actualizadoPorId[bot.id];
    if (!botsPorId.has(bot.id) || timestampRemoto > timestampLocal) {
      botsPorId.set(bot.id, bot);
      actualizadoPorId[bot.id] = timestampRemoto;
    }
  }

  return { bots: Array.from(botsPorId.values()), actualizado: actualizadoPorId };
}

const CLAVE_ABIERTOS = "starseed.astraura.bots.abiertos.v1";

export function abiertosEnEstaNeurona(): string[] {
  if (typeof window === "undefined") return [];
  try {
    migrarAbiertosDesdeAntigua();
    const bruto = window.localStorage.getItem(CLAVE_ABIERTOS);
    return bruto === null ? [] : Array.isArray(JSON.parse(bruto))
      ? JSON.parse(bruto) : [];
  } catch { return []; }
}

export function marcarAbierto(botId: string, abierto: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const abiertos = abiertosEnEstaNeurona();
    if (abierto) {
      if (!abiertos.includes(botId)) {
        window.localStorage.setItem(
          CLAVE_ABIERTOS,
          JSON.stringify([...abiertos, botId])
        );
      }
    } else {
      window.localStorage.setItem(
        CLAVE_ABIERTOS,
        JSON.stringify(abiertos.filter(id => id !== botId))
      );
    }
  } catch { /* best effort */ }
}

/* Migra datos desde la clave antigua `starseed.astraura.bots.abiertos.v1`. */
export function migrarAbiertosDesdeAntigua(): void {
  if (typeof window === "undefined") return;
  try {
    const antigua = window.localStorage.getItem("starseed.astraura.bots.abiertos.v1");
    if (antigua === null) return;
    const datos = JSON.parse(antigua);
    if (Array.isArray(datos) && datos.length > 0) {
      const actualBruto = window.localStorage.getItem(CLAVE_ABIERTOS);
      const actuales = actualBruto === null ? [] : (JSON.parse(actualBruto) || []);
      const combinados = Array.from(new Set([...actuales, ...datos])) as string[];
      window.localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(combinados));
    }
  } catch {
    // Si la clave antigua no existe o es ilegible, nada que migrar.
  }
}