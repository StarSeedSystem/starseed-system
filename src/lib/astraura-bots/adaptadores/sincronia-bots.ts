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

export interface PayloadCambio {
  new?: Bot | null;
  eventType?: "INSERT" | "UPDATE" | "DELETE" | undefined;
}

export function suscribirBotsEntidad(
  entidades: Readonly<{ tipo: string; id: string; cuentaId: string }[]>,
  cb: (bots: Bot[]) => void
): () => void {
  if (entidades.length === 0) return () => {};

  const entityFilters = entidades.map(e =>
    `(dueno.tipo=eq.${e.tipo},dueno.id=eq.${e.id},dueno.cuentaId=eq.${e.cuentaId})`
  );
  const filter = entityFilters.join(' or ');

  let botsCache: Bot[] = [];
  let actualizadoCache: Record<string, number> = {};

  const handleChange = (payload: PayloadCambio) => {
    try {
      const changeBot = payload?.new ?? null;
      const eventType = payload?.eventType;
      const ahora = Date.now();

      const remoteBots: Bot[] = changeBot ? [changeBot] : [];
      const remoteActualizado: Record<string, number> = changeBot
        ? { [changeBot.id]: ahora } : {};

      const localEnvelope = { bots: botsCache, actualizado: actualizadoCache };
      const remoteEnvelope = { bots: remoteBots, actualizado: remoteActualizado };

      const merged = fusionarBots(localEnvelope, remoteEnvelope);
      botsCache = merged.bots;
      actualizadoCache = merged.actualizado;

      cb([...botsCache]);
    } catch (e) {
      console.warn('Error in suscribirBotsEntidad:', e);
    }
  };

  return onTableChange("astraura_bots", { filter, event: "*" }, handleChange);
}

/* `starseed.astraura.bots.orbes.v1` guarda las POSICIONES de las orbes por bot. */
const CLAVE_ABIERTOS = "starseed.astraura.orbes-abiertos";

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

/** Migra datos desde la clave anterior `starseed.astraura.bots.abiertos.v1`. */
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
