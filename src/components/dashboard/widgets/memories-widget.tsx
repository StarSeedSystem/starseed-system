"use client";

// ════════════════════════════════════════════════════════════════
// MemoriesWidget — memorias REALES del usuario (tabla memories).
// ----------------------------------------------------------------
// Datos reales con alcance al propietario (owner = uid) EN VIVO vía
// useMyMemories (realtime). Cada tarjeta navega a /memorias. Cabecera con
// acción para abrir el Exocórtex de Memorias. Estados: cargando (skeleton),
// sin sesión (invita a entrar), vacío (CTA para crear la primera memoria).
// NUNCA inyecta datos: si aún no hay tabla/filas, muestra el vacío limpio.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { BookMarked, Plus, ChevronRight, FileText, Boxes, RefreshCw, LogIn, type LucideIcon } from "lucide-react";
import { WidgetShell, Chip, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useMyMemories, tsOf, type MemoryRow } from "@/lib/widget-data/os-live";

const ACCENT = "#007FFF";

function memoryAccent(m: MemoryRow): string {
    const c = (m.config && typeof m.config === "object" ? (m.config as Record<string, unknown>).color : null);
    return typeof c === "string" && c ? c : ACCENT;
}

export function MemoriesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading, authPending, needsAuth } = useMyMemories();

    const sorted = useMemo(
        () => [...rows].sort((a, b) => tsOf(b.updated_at) - tsOf(a.updated_at)),
        [rows],
    );
    const synced = useMemo(() => rows.filter((m) => m.sync).length, [rows]);

    return (
        <WidgetShell
            title="Memorias"
            subtitle="Exocórtex personal"
            icon={BookMarked}
            accent={ACCENT}
            live
            connections={[
                { label: "Cerebro", href: "/cerebro", color: "#a855f7" },
                { label: "Baúles", href: "/baules", color: "#f59e0b" },
            ]}
            actions={
                <>
                    <Link href="/memorias" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Abrir <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/memorias" className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Nueva
                    </Link>
                </>
            }
        >
            {(size) => {
                if (authPending || (loading && rows.length === 0 && !needsAuth)) {
                    return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                }

                if (needsAuth) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-sky-400/30 bg-sky-500/10">
                                <LogIn className="size-6 text-sky-300/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-[11px] text-muted-foreground/70">Entra para ver tus memorias soberanas.</p>
                            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 transition-colors cursor-pointer">
                                <LogIn className="size-3.5" /> Entrar
                            </Link>
                        </div>
                    );
                }

                if (rows.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-sky-400/30 bg-sky-500/10">
                                <BookMarked className="size-6 text-sky-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay memorias</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Crea la primera nota de tu exocórtex.</p>
                            </div>
                            <Link href="/memorias" className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Crear memoria
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                if (micro) {
                    const top = sorted[0];
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <span className="shrink-0 grid place-items-center size-11 rounded-2xl border text-white" style={{ background: `linear-gradient(135deg, ${memoryAccent(top)}, ${memoryAccent(top)}66)`, borderColor: `${memoryAccent(top)}55` }}>
                                <FileText className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: memoryAccent(top) }}>{top?.name ?? "Memoria"}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums">{rows.length} memorias</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-300 tabular-nums">
                                    <BookMarked className="size-3" />{rows.length} memorias
                                </span>
                                {synced > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 tabular-nums">
                                        <RefreshCw className="size-3" />{synced} sincronizadas
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {sorted.slice(0, max).map((m, idx) => {
                                    const accent = memoryAccent(m);
                                    const kinds = Array.isArray(m.kinds) ? m.kinds : [];
                                    return (
                                        <motion.div key={m.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02]">
                                            <Link href="/memorias" className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span className="shrink-0 grid place-items-center size-8 rounded-xl border text-white" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}55)`, borderColor: `${accent}44` }}>
                                                        <FileText className="size-4" />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{m.name || "Memoria"}</span>
                                                            {kinds[0] && <Chip color={accent}>{kinds[0]}</Chip>}
                                                        </div>
                                                        <p className="text-[9px] text-muted-foreground/60 mt-0.5 tabular-nums">{m.updated_at ? `Actualizada ${timeAgo(tsOf(m.updated_at))}` : (m.scope ?? "personal")}</p>
                                                    </div>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
