"use client";

import type { Bot } from "../tipos";
import { fusionarBots as fusionarEnNucleo, type BotSync } from "../sincronia-bots";
import { onTableChange } from "@/lib/realtime/realtime";

/**
 * Fusiona dos sobres { bots, actualizado } delegando en el núcleo puro
 * (`sincronia-bots.ts`): aquí solo se traduce la marca de tiempo, la regla
 * de «quién gana» y la validez del remoto viven en el núcleo, no se duplican.
 */
export function fusionarBots(
  local: Readonly<{ bots: Bot[]; actualizado: Record<string, number> }>,
  remoto: Readonly<{ bots: Bot[]; actualizado: Record<string, number> }>
): { bots: Bot[]; actualizado: Record<string, number> } {
  const aSync = (e: Readonly<{ bots: Bot[]; actualizado: Record<string, number> }>): BotSync[] =>
    e.bots.map((b) => ({ ...b, actualizado: e.actualizado[b.id] ?? 0 }));
  const unidos = fusionarEnNucleo(aSync(local), aSync(remoto));
  const bots: Bot[] = [];
  const actualizado: Record<string, number> = {};
  for (const b of unidos) {
    const { actualizado: ts, ...bot } = b;
    bots.push(bot);
    actualizado[bot.id] = ts;
  }
  return { bots, actualizado };
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
