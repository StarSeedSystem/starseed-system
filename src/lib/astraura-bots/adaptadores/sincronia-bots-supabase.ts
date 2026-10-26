"use client";

import type { Bot } from "../tipos";
import { onTableChange } from "@/lib/realtime/realtime";
import { fusionarBots, type EnvoltorioBots } from "../efectos/sincronia-bots";

export interface PayloadCambio {
  new?: Bot | null;
  eventType?: "INSERT" | "UPDATE" | "DELETE" | undefined;
}

/** Escucha los bots de las entidades indicadas y entrega la fusión con lo que ya tenía. */
export function suscribirBotsEntidad(
  entidades: Readonly<{ tipo: string; id: string; cuentaId: string }[]>,
  cb: (bots: Bot[]) => void
): () => void {
  if (entidades.length === 0) return () => {};

  const entityFilters = entidades.map(e =>
    `(dueno.tipo=eq.${e.tipo},dueno.id=eq.${e.id},dueno.cuentaId=eq.${e.cuentaId})`
  );
  const filter = entityFilters.join(" or ");

  const cache: EnvoltorioBots = { bots: [], actualizado: {} };

  const handleChange = (payload: PayloadCambio) => {
    try {
      const changeBot = payload?.new ?? null;
      const ahora = Date.now();
      const remoto: EnvoltorioBots = changeBot
        ? { bots: [changeBot], actualizado: { [changeBot.id]: ahora } }
        : { bots: [], actualizado: {} };
      const merged = fusionarBots(cache, remoto);
      cache.bots = merged.bots;
      cache.actualizado = merged.actualizado;
      cb([...cache.bots]);
    } catch (e) {
      console.warn("Error in suscribirBotsEntidad:", e);
    }
  };

  return onTableChange("astraura_bots", { filter, event: "*" }, handleChange);
}
