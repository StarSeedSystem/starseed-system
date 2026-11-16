"use client";

import { emitChange, onChange } from "@/lib/sync/live-signal";
import { subscribe, publish } from "@/lib/notifications/ntfy";
import { registrarMetrica } from "@/lib/mejoras/metrics";

export async function medirLatenciaCanal(canal: "websocket" | "sse"): Promise<number> {
    const pingId = `ping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const t0 = Date.now();

    if (canal === "websocket") {
        return new Promise((resolve) => {
            const unsub = onChange("latencia:ping", (payload: any) => {
                if (payload?.pingId === pingId) {
                    unsub();
                    resolve(Date.now() - t0);
                }
            });
            emitChange("latencia:ping", { pingId });
            setTimeout(() => { unsub(); resolve(-1); }, 5000);
        });
    }

    return new Promise((resolve) => {
        const unsub = subscribe(["ss-latency-test"], (msg) => {
            if (msg.message === pingId) {
                unsub();
                resolve(Date.now() - t0);
            }
        });
        publish({ topic: "ss-latency-test", title: pingId, message: pingId });
        setTimeout(() => { unsub(); resolve(-1); }, 5000);
    });
}
