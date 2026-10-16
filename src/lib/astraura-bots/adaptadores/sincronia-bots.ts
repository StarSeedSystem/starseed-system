import type { Bot } from "../tipos";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";

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

export function suscribirBotsEntidad(
  entidades: Readonly<{ tipo: string; id: string; cuentaId: string }[]>,
  cb: (bots: Bot[]) => void
): () => void {
  if (entidades.length === 0) return () => {};

  const entityFilters = entidades.map(e => 
    `(dueno.tipo=eq.${e.tipo},dueno.id=eq.${e.id},dueno.cuentaId=eq.${e.cuentaId})`
  );
  const filter = entityFilters.join(' or ');

  const handleChange = (payload: RealtimePayload) => {
    try {
      const changeBot = payload?.new as Bot | null;
      const eventType = payload?.eventType as 
        | "INSERT" | "UPDATE" | "DELETE" | undefined;
      const ahora = Date.now();

      const remoteBots: Bot[] = changeBot ? [changeBot] : [];
      const remoteActualizado: Record<string, number> = changeBot 
        ? { [changeBot.id]: ahora } : {};

      const localEnvelope = { bots: [], actualizado: {} };
      const remoteEnvelope = { bots: remoteBots, actualizado: remoteActualizado };
      
      const merged = fusionarBots(localEnvelope, remoteEnvelope);
      cb(merged.bots);
    } catch (e) {
      console.warn('Error in suscribirBotsEntidad:', e);
    }
  };

  return onTableChange("astraura_bots", { filter, event: "*" }, handleChange);
}