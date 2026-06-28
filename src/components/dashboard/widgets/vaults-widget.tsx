"use client";

// ════════════════════════════════════════════════════════════════
// VaultsWidget — baúles REALES del usuario (tabla vaults).
// ----------------------------------------------------------------
// Datos reales con alcance al propietario (owner = uid) EN VIVO vía
// useMyVaults (realtime). Cada tarjeta navega a /baules. Cabecera con
// acción para abrir Baúles. Estados: cargando, sin sesión, vacío (CTA).
// Un "baúl" agrupa conexiones de almacenamiento soberano. Sin datos falsos.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Vault, Plus, ChevronRight, Link2, LogIn, Lock } from "lucide-react";
import { WidgetShell, Chip, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useMyVaults, tsOf, type VaultRow } from "@/lib/widget-data/os-live";

const ACCENT = "#f59e0b";

function connCount(v: VaultRow): number {
    return Array.isArray(v.connections) ? v.connections.length : 0;
}

export function VaultsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading, authPending, needsAuth } = useMyVaults();

    const sorted = useMemo(() => [...rows].sort((a, b) => tsOf(b.updated_at) - tsOf(a.updated_at)), [rows]);
    const totalConns = useMemo(() => rows.reduce((s, v) => s + connCount(v), 0), [rows]);

    return (
        <WidgetShell
            title="Baúles"
            subtitle="Almacenamiento soberano"
            icon={Vault}
            accent={ACCENT}
            live
            connections={[
                { label: "Cerebro", href: "/cerebro", color: "#a855f7" },
                { label: "Seguridad", href: "/seguridad", color: "#10b981" },
            ]}
            actions={
                <>
                    <Link href="/baules" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Abrir <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/baules" className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Nuevo
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
                            <span className="grid place-items-center size-12 rounded-2xl border border-amber-400/30 bg-amber-500/10">
                                <LogIn className="size-6 text-amber-300/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-[11px] text-muted-foreground/70">Entra para abrir tus baúles soberanos.</p>
                            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer">
                                <LogIn className="size-3.5" /> Entrar
                            </Link>
                        </div>
                    );
                }

                if (rows.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-amber-400/30 bg-amber-500/10">
                                <Lock className="size-6 text-amber-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay baúles</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Crea el primero y conecta tu almacenamiento.</p>
                            </div>
                            <Link href="/baules" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Crear baúl
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
                            <span className="shrink-0 grid place-items-center size-11 rounded-2xl border text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}66)`, borderColor: `${ACCENT}55` }}>
                                <Vault className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: ACCENT }}>{top?.name ?? "Baúl"}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums">{rows.length} baúles</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 tabular-nums">
                                    <Vault className="size-3" />{rows.length} baúles
                                </span>
                                {totalConns > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
                                        <Link2 className="size-3" />{totalConns} conexiones
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {sorted.slice(0, max).map((v, idx) => (
                                    <motion.div key={v.id}
                                        initial={animate ? { opacity: 0, x: -10 } : false}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0 }}
                                        className="rounded-xl border border-border/40 bg-white/[0.02]">
                                        <Link href="/baules" className="block px-2.5 py-2 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <span className="shrink-0 grid place-items-center size-8 rounded-xl border text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}55)`, borderColor: `${ACCENT}44` }}>
                                                    <Vault className="size-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] @sm:text-xs font-bold truncate">{v.name || "Baúl"}</span>
                                                        {v.scope && <Chip color={ACCENT}>{v.scope}</Chip>}
                                                    </div>
                                                    <p className="text-[9px] text-muted-foreground/60 mt-0.5 tabular-nums">{connCount(v)} conexión(es){v.updated_at ? ` · ${timeAgo(tsOf(v.updated_at))}` : ""}</p>
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
