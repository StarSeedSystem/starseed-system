"use client";

/*
 * HistorialGenesis — lo aplicado, deshecho, propuesto o fallido en este ámbito, con «Deshacer»
 * en lo que se puede deshacer. Dice dónde vive el registro: en la cuenta o solo en este aparato
 * (si la tabla de la base aún no existe). (2026-10-10)
 */

import { CheckCircle2, CircleSlash, History, Loader2, RotateCcw, Vote, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { puedeDeshacer, type EntradaGenesis } from "@/lib/genesis/operaciones";
import type { DondeSeGuarda } from "@/lib/genesis/historial";

const ESTADO = {
    aplicada: { texto: "aplicada", Icono: CheckCircle2, clase: "text-emerald-300" },
    deshecha: { texto: "deshecha", Icono: RotateCcw, clase: "text-white/45" },
    propuesta: { texto: "en votación", Icono: Vote, clase: "text-cyan-300" },
    fallida: { texto: "no se aplicó", Icono: XCircle, clase: "text-rose-300" },
} as const;

function hace(at: number, ahora: number): string {
    const s = Math.max(0, Math.round((ahora - at) / 1000));
    if (s < 60) return "hace un momento";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return new Date(at).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function HistorialGenesis({
    entradas,
    donde,
    deshaciendo,
    puedeGestionar,
    onDeshacer,
}: {
    entradas: EntradaGenesis[];
    donde: DondeSeGuarda;
    deshaciendo: string | null;
    /** En PoliGenesis, solo quien gestiona deshace. */
    puedeGestionar: boolean;
    onDeshacer: (e: EntradaGenesis) => void;
}) {
    const ahora = Date.now();
    return (
        <section className="space-y-2" aria-label="Historial de Genesis" data-testid="genesis-historial">
            <div className="flex flex-wrap items-center gap-2">
                <History className="h-4 w-4 text-white/60" aria-hidden />
                <h3 className="text-sm font-semibold text-white/85">Historial</h3>
                <span className="text-[11px] text-white/45">
                    {donde === "cuenta" ? "guardado en tu cuenta" : "guardado solo en este aparato (la base aún no tiene el registro de Genesis)"}
                </span>
            </div>
            {entradas.length === 0 ? (
                <p className="flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs text-white/50">
                    <CircleSlash className="h-3.5 w-3.5" aria-hidden /> Todavía no hay cambios hechos con Genesis aquí.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {entradas.map((e) => {
                        const est = ESTADO[e.estado] ?? ESTADO.fallida;
                        return (
                            <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <est.Icono className={`h-4 w-4 shrink-0 ${est.clase}`} aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-white/90">{e.titulo}</span>
                                    <span className="block truncate text-[11px] text-white/45">
                                        {est.texto} · {hace(e.at, ahora)}
                                        {e.resultado ? ` · ${e.resultado}` : ""}
                                    </span>
                                </span>
                                {puedeDeshacer(e) && puedeGestionar ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 cursor-pointer gap-1 text-xs"
                                        disabled={deshaciendo !== null}
                                        onClick={() => onDeshacer(e)}
                                        data-testid="genesis-deshacer"
                                    >
                                        {deshaciendo === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                                        Deshacer
                                    </Button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
