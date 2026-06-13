'use client';

import { useState, useCallback } from "react";
import Link from "next/link";
import {
    Boxes, Printer, Car, FlaskRound, Server, Tractor, CalendarClock,
    ChevronRight, Check, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { CommonsResource } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// CommonsMatrixWidget — Matriz de Patrimonio Común.
// Disponibilidad en tiempo real de los medios de producción compartidos.
// "Reserva por Propósito" (no se paga; se explica el propósito). Datos "oikos.commons".
// Invariante: medios de producción como procomún, prioridad por urgencia colectiva.
// ════════════════════════════════════════════════════════════════
const KIND_ICON: Record<CommonsResource["kind"], LucideIcon> = {
    impresora3d: Printer, vehiculo: Car, laboratorio: FlaskRound, servidores: Server, maquinaria: Tractor,
};
const STATUS_META: Record<CommonsResource["status"], { label: string; color: string }> = {
    libre: { label: "Libre", color: "#10b981" },
    reservado: { label: "Reservado", color: "#f59e0b" },
    mantenimiento: { label: "Mantenimiento", color: "#94a3b8" },
};
function eta(min: number): string {
    if (min <= 0) return "ahora";
    if (min < 60) return `${min} min`;
    return `${Math.round(min / 60)} h`;
}

export function CommonsMatrixWidget() {
    const { data, loading } = useWidgetData("oikos.commons", { refreshMs: 10000 });
    const [reserved, setReserved] = useState<Record<string, boolean>>({});
    const toggle = useCallback((id: string) => setReserved((p) => ({ ...p, [id]: !p[id] })), []);

    return (
        <WidgetShell
            title="Patrimonio Común"
            subtitle="Medios de producción compartidos"
            icon={Boxes}
            accent="#38bdf8"
            live
            actions={
                <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Reservas <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const maxList = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 2 : 4;

                if (micro) {
                    const free = data.filter((r) => r.status === "libre").length;
                    return (
                        <div className="h-full grid place-items-center text-center">
                            <div>
                                <div className="text-2xl font-black tabular-nums text-sky-400">{free}/{data.length}</div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">recursos libres</div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={data}
                            max={maxList}
                            empty="Sin recursos registrados"
                            render={(r) => {
                                const Icon = KIND_ICON[r.kind];
                                const sm = STATUS_META[r.status];
                                const isReserved = reserved[r.id];
                                const canReserve = r.status !== "mantenimiento";
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-500/30 transition-colors">
                                        <span className="grid place-items-center size-9 rounded-xl border shrink-0"
                                            style={{ color: sm.color, borderColor: `${sm.color}40`, background: `${sm.color}14` }}>
                                            <Icon className="size-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{r.label}</span>
                                                <Chip color={sm.color}>{sm.label}</Chip>
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                                <span className="inline-flex items-center gap-0.5"><CalendarClock className="size-3" /> {eta(r.availableInMin)}</span>
                                                {r.queue > 0 && <span>· {r.queue} en cola</span>}
                                                {r.priorityPurpose && size.vTier === "expanded" && <span className="truncate">· {r.priorityPurpose}</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => toggle(r.id)}
                                            disabled={!canReserve}
                                            title="Reserva por propósito"
                                            className={cn(
                                                "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                                                isReserved ? "bg-sky-500/15 border-sky-500/40 text-sky-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-sky-500/40"
                                            )}
                                        >
                                            {isReserved ? <><Check className="size-2.5" /> Solicitado</> : "Reservar"}
                                        </button>
                                    </div>
                                );
                            }}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
