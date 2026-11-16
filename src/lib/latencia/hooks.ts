"use client";

import { useEffect, useState } from "react";
import { medirLatenciaCanal } from "./mediador";
import { registrarMetrica } from "@/lib/mejoras/metrics";

export function useMedidorLatencia(intervalMs = 30000) {
    const [wsLatencia, setWsLatencia] = useState<number | null>(null);
    const [sseLatencia, setSseLatencia] = useState<number | null>(null);

    useEffect(() => {
        let activo = true;
        const medir = async () => {
            const [ws, sse] = await Promise.all([
                medirLatenciaCanal("websocket"),
                medirLatenciaCanal("sse")
            ]);
            if (activo) {
                setWsLatencia(ws);
                setSseLatencia(sse);
                if (ws > 0) registrarMetrica("latency", "websocket", "medidor-cliente", ws);
                if (sse > 0) registrarMetrica("latency", "sse", "medidor-cliente", sse);
            }
        };
        medir();
        const t = setInterval(medir, intervalMs);
        return () => { activo = false; clearInterval(t); };
    }, [intervalMs]);

    return { wsLatencia, sseLatencia };
}
