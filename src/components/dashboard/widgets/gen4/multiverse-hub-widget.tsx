'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Orbit, ChevronRight, ChevronLeft, Users, Glasses, Box, Monitor, Boxes, Bookmark, LogIn, Flame, Filter, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MultiverseWorld } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// MultiverseHubWidget — Multiverso (mundos inmersivos).
// Galería filtrable por modo (VR/AR/2D/Espacial) con interacción local
// (guardar portal / entrar) y vista ampliada del mundo. Presencia viva,
// intensidad sensorial. Datos "culture.multiverse".
// ════════════════════════════════════════════════════════════════
const MODE_META: Record<MultiverseWorld["mode"], { icon: LucideIcon; label: string }> = {
    vr: { icon: Glasses, label: "VR" },
    ar: { icon: Box, label: "AR" },
    "2d": { icon: Monitor, label: "2D" },
    espacial: { icon: Boxes, label: "Espacial" },
};

type ModeFilter = "todos" | MultiverseWorld["mode"];

export function MultiverseHubWidget() {
    const { data, loading } = useWidgetData("culture.multiverse", { refreshMs: 9000 });
    const [mode, setMode] = useState<ModeFilter>("todos");
    const [saved, setSaved] = useState<Record<string, boolean>>({});
    const [openId, setOpenId] = useState<string | null>(null);

    const worlds = data?.worlds ?? [];
    const modesPresent = useMemo(() => Array.from(new Set(worlds.map((w) => w.mode))), [worlds]);
    const filtered = useMemo(() => (mode === "todos" ? worlds : worlds.filter((w) => w.mode === mode)), [worlds, mode]);
    const openWorld = openId ? worlds.find((w) => w.id === openId) ?? null : null;
    const savedCount = Object.values(saved).filter(Boolean).length;

    return (
        <WidgetShell
            title="Multiverso"
            subtitle={data ? `${data.totalPresence.toLocaleString()} presencias activas` : "Mundos inmersivos"}
            icon={Orbit}
            accent="#22d3ee"
            live
            connections={[{ label: "Cultura", href: "/network/culture", color: "#C9A8FF" }, { label: "Estudio", href: "/publish", color: "#FFBF00" }]}
            actions={
                <Link href="/network/culture" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Explorar <ChevronRight className="size-3" />
                </Link>
            }
            footer={savedCount > 0 ? (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-300">
                    <Bookmark className="size-3.5" /> {savedCount} {savedCount === 1 ? "portal guardado" : "portales guardados"}
                </div>
            ) : undefined}
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                // ── Vista ampliada de un mundo ──
                if (openWorld && !micro) {
                    const meta = MODE_META[openWorld.mode];
                    const MIcon = meta.icon;
                    const isSaved = !!saved[openWorld.id];
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 h-full">
                            <button onClick={() => setOpenId(null)}
                                className="self-start inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer">
                                <ChevronLeft className="size-3" /> Volver
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="shrink-0 grid place-items-center size-14 rounded-2xl" style={{ background: `color-mix(in srgb, ${openWorld.accent} 22%, transparent)` }}>
                                    <MIcon className="size-7" style={{ color: openWorld.accent }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <h4 className="text-sm @sm:text-base font-black leading-tight truncate">{openWorld.name}</h4>
                                        {openWorld.live && <span className="shrink-0 size-2 rounded-full bg-rose-400 animate-pulse" />}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground/70">{openWorld.theme}</p>
                                    <Chip color={openWorld.accent}>{meta.label}</Chip>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2 py-2 text-center">
                                    <div className="inline-flex items-center gap-1 text-base font-black tabular-nums text-cyan-300"><Users className="size-3.5" />{openWorld.activeUsers}</div>
                                    <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60">presencias</div>
                                </div>
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2 py-2 text-center">
                                    <div className="inline-flex items-center gap-1 text-base font-black tabular-nums text-orange-300"><Flame className="size-3.5" />{Math.round(openWorld.intensity * 100)}%</div>
                                    <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60">intensidad</div>
                                </div>
                            </div>
                            <div className="rounded-xl border border-border/40 bg-white/[0.02] p-2.5">
                                <ProgressBar value={openWorld.intensity} color={openWorld.accent} showPct label="Carga sensorial" height={6} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-auto">
                                <button className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider border bg-cyan-500/20 border-cyan-500/45 text-cyan-200 hover:bg-cyan-500/30 transition-colors cursor-pointer">
                                    <LogIn className="size-4" /> Entrar
                                </button>
                                <button onClick={() => setSaved((p) => ({ ...p, [openWorld.id]: !p[openWorld.id] }))}
                                    className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider border transition-colors cursor-pointer",
                                        isSaved ? "bg-amber-500/25 border-amber-500/50 text-amber-300" : "bg-white/5 border-border/40 hover:border-amber-500/40 text-muted-foreground")}>
                                    <Bookmark className={cn("size-4", isSaved && "fill-current")} /> {isSaved ? "Guardado" : "Guardar"}
                                </button>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 h-full pt-1">
                        {!micro && modesPresent.length > 1 && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                <Filter className="size-3 shrink-0 text-muted-foreground/50" />
                                <button onClick={() => setMode("todos")}
                                    className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                        mode === "todos" ? "bg-cyan-500/20 border-cyan-500/45 text-cyan-300" : "border-border/40 text-muted-foreground/60 hover:border-cyan-500/30")}>
                                    Todos
                                </button>
                                {modesPresent.map((m) => (
                                    <button key={m} onClick={() => setMode(mode === m ? "todos" : m)}
                                        className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                            mode === m ? "bg-cyan-500/20 border-cyan-500/45 text-cyan-300" : "border-border/40 text-muted-foreground/60 hover:border-cyan-500/30")}>
                                        {MODE_META[m].label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={filtered}
                                max={max}
                                empty="Sin mundos en este modo"
                                render={(w) => {
                                    const meta = MODE_META[w.mode];
                                    const MIcon = meta.icon;
                                    const isSaved = !!saved[w.id];
                                    return (
                                        <motion.div whileHover={!micro ? { scale: 1.005 } : undefined}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-cyan-500/30 transition-colors">
                                            <button onClick={() => !micro && setOpenId(w.id)} className={cn("w-full text-left", !micro && "cursor-pointer")}>
                                                <div className="flex items-center gap-2">
                                                    <div className="shrink-0 grid place-items-center size-7 rounded-lg" style={{ background: `color-mix(in srgb, ${w.accent} 22%, transparent)` }}>
                                                        <MIcon className="size-3.5" style={{ color: w.accent }} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{w.name}</span>
                                                            {w.live && <span className="shrink-0 size-1.5 rounded-full bg-rose-400 animate-pulse" />}
                                                        </div>
                                                        {!micro && <span className="text-[9px] text-muted-foreground/60 truncate block">{w.theme}</span>}
                                                    </div>
                                                    <div className="shrink-0 flex flex-col items-end gap-0.5">
                                                        <Chip color={w.accent}>{meta.label}</Chip>
                                                        <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60"><Users className="size-2.5" /> {w.activeUsers}</span>
                                                    </div>
                                                </div>
                                            </button>
                                            {!micro && (
                                                <div className="mt-1.5 flex items-center gap-1.5">
                                                    <button onClick={() => setOpenId(w.id)}
                                                        className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 px-2 py-0.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/15 transition-colors cursor-pointer">
                                                        <LogIn className="size-2.5" /> Entrar
                                                    </button>
                                                    <button onClick={() => setSaved((p) => ({ ...p, [w.id]: !p[w.id] }))} title="Guardar portal"
                                                        className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-colors cursor-pointer",
                                                            isSaved ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "border-border/40 text-muted-foreground/60 hover:border-amber-500/30")}>
                                                        <Bookmark className={cn("size-2.5", isSaved && "fill-current")} /> {isSaved ? "Guardado" : "Guardar"}
                                                    </button>
                                                </div>
                                            )}
                                            {size.vTier === "expanded" && (
                                                <div className="mt-1.5"><ProgressBar value={w.intensity} color={w.accent} height={3} /></div>
                                            )}
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
