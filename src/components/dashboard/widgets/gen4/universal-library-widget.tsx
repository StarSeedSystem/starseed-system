'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Library, ChevronRight, FileText, Video, GraduationCap, Box, Music, Database,
    Search, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LibraryItem } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// UniversalLibraryWidget — Biblioteca Universal.
// Conocimiento como procomún (Lienzo Universal del saber). Continúa
// aprendizaje + destacados + colecciones. Búsqueda local. Acceso abierto.
// Datos "education.library". Adaptativo.
// ════════════════════════════════════════════════════════════════
const KIND_ICON: Record<LibraryItem["kind"], LucideIcon> = {
    doc: FileText, video: Video, curso: GraduationCap, modelo3d: Box, audio: Music, dataset: Database,
};

export function UniversalLibraryWidget() {
    const { data, loading } = useWidgetData("education.library", { refreshMs: 30000 });
    const [q, setQ] = useState("");

    const items = useMemo(() => {
        if (!data) return [];
        const all = [...data.continueLearning, ...data.featured];
        const seen = new Set<string>();
        const uniq = all.filter((i) => (seen.has(i.id) ? false : seen.add(i.id)));
        if (!q.trim()) return uniq;
        const t = q.toLowerCase();
        return uniq.filter((i) => i.title.toLowerCase().includes(t) || i.discipline.toLowerCase().includes(t) || i.author.toLowerCase().includes(t));
    }, [data, q]);

    return (
        <WidgetShell
            title="Biblioteca Universal"
            subtitle={data ? `${data.totalEntities.toLocaleString()} entidades · acceso abierto` : "Conocimiento procomún"}
            icon={Library}
            accent="#a855f7"
            actions={
                <Link href="/library" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Abrir <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && (
                            <div className="shrink-0 flex items-center gap-1.5 rounded-lg bg-black/20 border border-border/40 px-2 py-1 focus-within:border-purple-500/40 transition-colors">
                                <Search className="size-3 text-muted-foreground/50 shrink-0" />
                                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar saber…"
                                    className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40" />
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={items}
                                max={max}
                                empty="Sin resultados"
                                render={(it) => {
                                    const Icon = KIND_ICON[it.kind];
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-purple-500/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <Icon className="size-3.5 shrink-0 text-purple-300" />
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate block">{it.title}</span>
                                                    {!micro && <span className="text-[9px] text-muted-foreground/60 truncate block">{it.author} · {it.discipline}</span>}
                                                </div>
                                                {it.progress === undefined && <Chip color="#a855f7">{it.kind}</Chip>}
                                            </div>
                                            {it.progress !== undefined && !micro && (
                                                <div className="mt-1.5"><ProgressBar value={it.progress} color="#a855f7" height={4} showPct label="En curso" /></div>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                        </div>
                        {size.vTier === "expanded" && data?.collections?.length ? (
                            <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-0.5">
                                {data.collections.map((c) => (
                                    <span key={c.id} className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[9px] font-bold" style={{ color: c.accent }}>
                                        {c.label} · {c.count}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
