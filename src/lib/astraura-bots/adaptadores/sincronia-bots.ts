"use client";

import type { Bot } from "../tipos";
import { onTableChange } from "@/lib/realtime/realtime";
import { abiertosEnEstaNeurona, marcarAbierto } from "../sincronia-bots";

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

  const handleChange = (payload: any) => {
    try {
      const changeBot = payload?.new as Bot | null;
      const eventType = payload?.eventType as 
        | "INSERT" | "UPDATE" | "DELETE" | undefined;
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

const CLAVE_ABIERTOS = "starseed.astraura.bots.orbes.v1";

export function abiertosEnEstaNeurona(): string[] {
  return abiertosEnEstaNeurona(window.localStorage);
}

export function marcarAbierto(botId: string, abierto: boolean): void {
  marcarAbierto(botId, abierto, window.localStorage);
}