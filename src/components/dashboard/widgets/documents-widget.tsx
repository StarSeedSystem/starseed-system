"use client";

// ════════════════════════════════════════════════════════════════
// DocumentsWidget — archivos/documentos REALES del usuario (tabla documents).
// ----------------------------------------------------------------
// Datos reales con alcance al propietario (account_id = uid) EN VIVO vía
// useMyDocuments (realtime). Cada tarjeta navega a /almacenes. Cabecera
// con acción para abrir Archivos. Estados: cargando, sin sesión, vacío (CTA).
// Sin datos falsos: si aún no hay tabla/filas, estado vacío limpio.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { FolderOpen, Plus, ChevronRight, FileText, FileImage, FileVideo, FileAudio, FileCode2, FileType2, Box, LogIn, HardDrive, type LucideIcon } from "lucide-react";
import { detectFormat, type FileFormat } from "@/components/files/file-preview";
import { WidgetShell, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useMyDocuments, tsOf, type DocumentRow } from "@/lib/widget-data/os-live";

const ACCENT = "#eab308";

// Mapa de formato → icono/color para dar jerarquía visual por tipo de archivo.
const FMT_META: Record<FileFormat, { icon: LucideIcon; color: string; label: string }> = {
    image:    { icon: FileImage, color: "#38bdf8", label: "IMG" },
    video:    { icon: FileVideo, color: "#f472b6", label: "VID" },
    audio:    { icon: FileAudio, color: "#a78bfa", label: "AUD" },
    pdf:      { icon: FileType2, color: "#fb7185", label: "PDF" },
    markdown: { icon: FileText,  color: "#34d399", label: "MD" },
    code:     { icon: FileCode2, color: "#facc15", label: "CODE" },
    link:     { icon: ChevronRight, color: "#22d3ee", label: "URL" },
    model3d:  { icon: Box,       color: "#c084fc", label: "3D" },
    app:      { icon: FolderOpen, color: "#fbbf24", label: "APP" },
    generic:  { icon: FileText,  color: "#eab308", label: "DOC" },
};
function fmtOf(name: string | null | undefined): { icon: LucideIcon; color: string; label: string } {
    const f = detectFormat({ name: name ?? undefined });
    return FMT_META[f] ?? FMT_META.generic;
}

export function DocumentsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading, authPending, needsAuth } = useMyDocuments();

    const sorted = useMemo(() => [...rows].sort((a, b) => tsOf(b.updated_at) - tsOf(a.updated_at)), [rows]);

    return (
        <WidgetShell
            title="Archivos"
            subtitle="Documentos soberanos"
            icon={FolderOpen}
            accent={ACCENT}
            live
            connections={[
                { label: "Almacenes", href: "/almacenes", color: "#eab308" },
                { label: "Baúles", href: "/baules", color: "#f59e0b" },
            ]}
            actions={
                <>
                    <Link href="/almacenes" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Abrir <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/almacenes" className="inline-flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300 hover:bg-yellow-500/20 transition-colors cursor-pointer">
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
                            <span className="grid place-items-center size-12 rounded-2xl border border-yellow-400/30 bg-yellow-500/10">
                                <LogIn className="size-6 text-yellow-300/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-[11px] text-muted-foreground/70">Entra para ver tus archivos.</p>
                            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-yellow-300 hover:bg-yellow-500/25 transition-colors cursor-pointer">
                                <LogIn className="size-3.5" /> Entrar
                            </Link>
                        </div>
                    );
                }

                if (rows.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-yellow-400/30 bg-yellow-500/10">
                                <HardDrive className="size-6 text-yellow-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay archivos</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Crea o sube el primer documento.</p>
                            </div>
                            <Link href="/almacenes" className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-yellow-300 hover:bg-yellow-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Nuevo archivo
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 7 : 5;

                if (micro) {
                    const top = sorted[0];
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <span className="shrink-0 grid place-items-center size-11 rounded-2xl border text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}66)`, borderColor: `${ACCENT}55` }}>
                                <FolderOpen className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: ACCENT }}>{top?.name ?? "Archivo"}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums">{rows.length} archivos</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-300 tabular-nums">
                                    <FolderOpen className="size-3" />{rows.length} archivos
                                </span>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1">
                                {sorted.slice(0, max).map((d, idx) => (
                                    <motion.div key={d.name ?? idx}
                                        initial={animate ? { opacity: 0, x: -8 } : false}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: animate ? 0.25 : 0, delay: animate ? idx * 0.04 : 0 }}
                                        className="rounded-lg border border-border/40 bg-white/[0.02]">
                                        <Link href="/almacenes" className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer">
                                            {(() => { const m = fmtOf(d.name); const I = m.icon; return (
                                                <span className="grid size-6 shrink-0 place-items-center rounded-md border" style={{ color: m.color, borderColor: `${m.color}40`, background: `${m.color}1a` }}>
                                                    <I className="size-3.5" />
                                                </span>
                                            ); })()}
                                            <span className="text-[11px] font-semibold truncate min-w-0 flex-1">{d.name || "Documento"}</span>
                                            <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase tracking-wider" style={{ color: fmtOf(d.name).color, background: `${fmtOf(d.name).color}1a` }}>{fmtOf(d.name).label}</span>
                                            {d.updated_at && <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">{timeAgo(tsOf(d.updated_at))}</span>}
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
