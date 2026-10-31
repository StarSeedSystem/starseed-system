"use client";

import { useState } from "react";
import { Sparkles, ShieldAlert, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Panel de Decisiones de Laya (Ola 1018L)
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra las decisiones en tiempo real de Laya sobre las capas de Astraura.
 */
export function LayaDecisionesPanel({ compacto = false }: { compacto?: boolean }) {
    // Mock inicial, luego conectará con el store de Laya
    const [decisiones] = useState<Array<{ id: string; punto: string; respuesta: string; confianza: number; donde: string; ms: number }>>([
        { id: "1", punto: "¿Publicar?", respuesta: "publicar", confianza: 0.95, donde: "CPU", ms: 42 },
    ]);

    const [habilidades] = useState({
        toSpec: true,
        toTickets: true,
        triage: true,
    });

    return (
        <div className={cn("space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4", compacto && "p-2")}>
            <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Decisiones de Laya</h3>
            </div>

            <div className="space-y-2">
                {decisiones.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                        <div>
                            <p className="font-medium text-white">{d.punto}</p>
                            <p className="text-white/60">{d.respuesta} (confianza: {d.confianza.toFixed(2)})</p>
                        </div>
                        <div className="text-right text-[10px] text-white/40">
                            <p>{d.donde}</p>
                            <p>{d.ms} ms</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-white/10 pt-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
                    <ShieldAlert className="h-3 w-3 text-emerald-400" /> Interruptores de habilidades
                </h4>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(habilidades).map(([key, enabled]) => (
                        <button
                            key={key}
                            className={cn(
                                "flex items-center gap-1 rounded-full px-2 py-1 text-[10px]",
                                enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/40"
                            )}
                        >
                            <Cpu className="h-3 w-3" /> {key}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
