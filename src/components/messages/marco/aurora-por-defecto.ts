/**
 * «Aurora activa por defecto en chats nuevos» (Ajustes › Aurora, 2026-09-28). Solo actúa sobre
 * hilos RECIÉN creados y sin configuración de agente: reabrir un DM que ya existía nunca le mete
 * a Aurora por sorpresa.
 */

import { setThreadAgent, type DmThread } from "@/lib/messages/dm";
import type { AjustesMensajeria } from "@/lib/mensajeria/ajustes-tipos";

const RECIENTE_MS = 2 * 60 * 1000;

export function esHiloRecienCreado(hilo: Pick<DmThread, "createdAt" | "agent">, ahora: number = Date.now()): boolean {
    if (hilo.agent) return false;
    const t = new Date(hilo.createdAt).getTime();
    return !Number.isNaN(t) && ahora - t < RECIENTE_MS;
}

/** Devuelve true si activó a Aurora. Nunca lanza. */
export async function aplicarAuroraPorDefecto(
    hilo: Pick<DmThread, "id" | "createdAt" | "agent">,
    aurora: AjustesMensajeria["aurora"],
): Promise<boolean> {
    if (!aurora.activaPorDefecto || !esHiloRecienCreado(hilo)) return false;
    try {
        return await setThreadAgent(hilo.id, { enabled: true, name: "Aurora", autoReplyOnMention: aurora.responderMenciones });
    } catch {
        return false;
    }
}
