'use client';

import { useState, useCallback } from "react";
import Link from "next/link";
import {
    ShieldCheck, ChevronRight, KeyRound, Type, Mic, Fingerprint, MapPin,
    ArrowUpRight, ArrowDownRight, ShieldAlert,
} from "lucide-react";
import { WidgetShell, MiniList, StatTile, ProgressRing } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { ShieldState, DataFlow } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// CryptoShieldWidget — Escudo Ontológico (Membrana Criptográfica).
// Límites de datos como esferas de luz. Nivel de fricción criptográfica
// editable, rastreadores bloqueados, saltos cebolla, flujos de datos
// con toggle Permitir/Bloquear y "Amnistía de datos" (revoca todo).
// Datos "privacy.shield". Invariante: soberanía y privacidad por diseño.
// ════════════════════════════════════════════════════════════════
const LEVEL_META = {
    abierta: { label: "Abierta", color: "#34d399", desc: "Comunicación local abierta" },
    equilibrada: { label: "Equilibrada", color: "#38bdf8", desc: "Balance privacidad/uso" },
    cierre: { label: "Cierre cuántico", color: "#a855f7", desc: "Máxima fricción criptográfica" },
} as const;

const LEVEL_ORDER = ["abierta", "equilibrada", "cierre"] as const;

const FLOW_ICONS: Record<DataFlow["kind"], typeof Type> = {
    texto: Type,
    audio: Mic,
    biometria: Fingerprint,
    ubicacion: MapPin,
};

export function CryptoShieldWidget() {
    const { data, loading } = useWidgetData("privacy.shield", { refreshMs: 12000 });
    const [localLevel, setLocalLevel] = useState<ShieldState["level"] | null>(null);
    const [localAllowed, setLocalAllowed] = useState<Record<string, boolean>>({});
    const [amnesty, setAmnesty] = useState(false);

    const toggleFlow = useCallback((id: string, current: boolean) => {
        setAmnesty(false);
        setLocalAllowed((prev) => ({ ...prev, [id]: !current }));
    }, []);

    const applyAmnesty = useCallback(() => {
        setAmnesty(true);
        setLocalAllowed({});
    }, []);

    const computeAllowed = useCallback((flow: DataFlow): boolean => {
        if (amnesty) return false;
        if (localAllowed[flow.id] !== undefined) return localAllowed[flow.id];
        return flow.allowed;
    }, [amnesty, localAllowed]);

    return (
        <WidgetShell
            title="Escudo Ontológico"
            subtitle="Membrana criptográfica"
            icon={ShieldCheck}
            accent="#8b5cf6"
            live
            actions={
                <Link href="/settings?tab=privacy" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Privacidad <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const level = localLevel ?? d.level;
                const meta = LEVEL_META[level];
                const micro = size.tier === "micro" || size.vTier === "micro";

                const flows = d.flows.map((f) => ({ ...f, resolvedAllowed: computeAllowed(f) }));

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center gap-1">
                            <ProgressRing
                                value={level === "cierre" ? 1 : level === "equilibrada" ? 0.6 : 0.25}
                                size={68}
                                color={meta.color}
                                label={String(d.trackersBlocked)}
                                sublabel="bloqueados"
                            />
                            <span
                                className="text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 border"
                                style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)` }}
                            >
                                {meta.label}
                            </span>
                        </div>
                    );
                }

                const maxFlows = size.vTier === "expanded" ? 4 : size.vTier === "compact" ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Segmented control — nivel de fricción criptográfica */}
                        <div className="shrink-0 flex rounded-xl border border-border/40 bg-white/[0.02] p-0.5 gap-0.5">
                            {LEVEL_ORDER.map((lv) => {
                                const m = LEVEL_META[lv];
                                const active = level === lv;
                                return (
                                    <button
                                        key={lv}
                                        onClick={() => setLocalLevel(lv)}
                                        className={cn(
                                            "flex-1 rounded-lg py-1.5 text-[9px] @sm:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                            active ? "" : "text-muted-foreground/60 hover:text-muted-foreground"
                                        )}
                                        style={active ? { background: `color-mix(in srgb, ${m.color} 22%, transparent)`, color: m.color } : undefined}
                                    >
                                        {m.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Stats row */}
                        <div className="shrink-0 grid grid-cols-2 gap-2">
                            <StatTile label="Rastreadores" value={d.trackersBlocked} accent="#8b5cf6" compact />
                            <StatTile label="Saltos cebolla" value={d.onionHops} accent="#38bdf8" compact />
                        </div>

                        {/* Claves y descripción */}
                        <div className="shrink-0 flex items-center gap-2">
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold", d.keysHealthy ? "text-emerald-300" : "text-rose-300")}>
                                <KeyRound className="size-3" />
                                Claves {d.keysHealthy ? "sanas" : "¡revisar!"}
                            </span>
                            <span className="text-[9px] text-muted-foreground/50 truncate flex-1">{meta.desc}</span>
                        </div>

                        {/* Flujos de datos */}
                        <div className="flex-1 min-h-0 flex flex-col gap-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0">Flujos de datos</span>
                            <div className="flex-1 min-h-0">
                                <MiniList
                                    items={flows}
                                    max={maxFlows}
                                    empty="Sin flujos registrados"
                                    render={(f) => {
                                        const KindIcon = FLOW_ICONS[f.kind];
                                        const allowed = f.resolvedAllowed;
                                        return (
                                            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2 py-1.5">
                                                <KindIcon className="size-3 shrink-0 text-muted-foreground/60" />
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[10px] font-bold truncate block">{f.label}</span>
                                                    <span className="text-[8px] text-muted-foreground/50">
                                                        {f.outbound
                                                            ? <span className="inline-flex items-center gap-0.5"><ArrowUpRight className="size-2.5" />Saliente</span>
                                                            : <span className="inline-flex items-center gap-0.5"><ArrowDownRight className="size-2.5" />Local</span>}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => toggleFlow(f.id, allowed)}
                                                    className={cn(
                                                        "shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer",
                                                        allowed
                                                            ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15"
                                                            : "border-rose-500/30 text-rose-300 hover:bg-rose-500/15"
                                                    )}
                                                >
                                                    {allowed ? "Permitir" : "Bloq."}
                                                </button>
                                            </div>
                                        );
                                    }}
                                />
                            </div>
                        </div>

                        {/* Amnistía de datos */}
                        <button
                            onClick={applyAmnesty}
                            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] py-2 text-[10px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer"
                        >
                            <ShieldAlert className="size-3.5" /> Amnistía de datos
                        </button>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
