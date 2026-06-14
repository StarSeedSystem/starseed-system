'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Library, ChevronRight, FileText, Video, GraduationCap, Box, Music, Database,
    Search, Plus, Check, BookmarkCheck, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LibraryItem } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// UniversalLibraryWidget — Biblioteca Universal.
// Conocimiento como procomún (Lienzo Universal del saber). Catálogo
// filtrable/buscable por tipo, búsqueda local y acción "añadir a mi
// ruta" (estado local). Datos "education.library". Adaptativo.
// ════════════════════════════════════════════════════════════════
const KIND_ICON: Record<LibraryItem["kind"], LucideIcon> = {
    doc: FileText, video: Video, curso: GraduationCap, modelo3d: Box, audio: Music, dataset: Database,
};
const KIND_LABEL: Record<LibraryItem["kind"], string> = {
    doc: "Doc", video: "Vídeo", curso: "Curso", modelo3d: "3D", audio: "Audio", dataset: "Dataset",
};

type KindFilter = "todos" | LibraryItem["kind"];

export function UniversalLibraryWidget() {
    const { data, loading } = useWidgetData("education.library", { refreshMs: 30000 });
    const [q, setQ] = useState("");
    const [kind, setKind] = useState<KindFilter>("todos");
    const [route, setRoute] = useState<Record<string, boolean>>({});

    const allItems = useMemo(() => {
        if (!data) return [];
        const all = [...data.continueLearning, ...data.featured];
        const seen = new Set<string>();
        return all.filter((i) => (seen.has(i.id) ? false : seen.add(i.id)));
    }, [data]);

    const kindsPresent = useMemo(() => {
        const set = new Set<LibraryItem["kind"]>();
        allItems.forEach((i) => set.add(i.kind));
        return Array.from(set);
    }, [allItems]);

    const items = useMemo(() => {
        let arr = allItems;
        if (kind !== "todos") arr = arr.filter((i) => i.kind === kind);
        const t = q.trim().toLowerCase();
        if (t) arr = arr.filter((i) => i.title.toLowerCase().includes(t) || i.discipline.toLowerCase().includes(t) || i.author.toLowerCase().includes(t));
        return arr;
    }, [allItems, kind, q]);

    const routeCount = Object.values(route).filter(Boolean).length;

    function toggleRoute(id: string) {
        setRoute((prev) => ({ ...prev, [id]: !prev[id] }));
    }

    return (
        <WidgetShell
            title="Biblioteca Universal"
            subtitle={data ? `${data.totalEntities.toLocaleString()} entidades · acceso abierto` : "Conocimiento procomún"}
            icon={Library}
            accent="#a855f7"
            connections={[{ label: "Árbol de Habilidades", href: "/network/education", color: "#a78bfa" }, { label: "Educación", href: "/network/education", color: "#7FB8FF" }]}
            actions={
                <Link href="/library" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Abrir <ChevronRight className="size-3" />
                </Link>
            }
            footer={routeCount > 0 ? (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-300">
                    <BookmarkCheck className="size-3.5" /> {routeCount} {routeCount === 1 ? "recurso" : "recursos"} en tu ruta de aprendizaje
                </div>
            ) : undefined}
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
                        {/* Filtro por tipo de recurso */}
                        {!micro && kindsPresent.length > 1 && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                <button onClick={() => setKind("todos")}
                                    className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                        kind === "todos" ? "bg-purple-500/20 border-purple-500/45 text-purple-300" : "border-border/40 text-muted-foreground/60 hover:border-purple-500/30")}>
                                    Todos
                                </button>
                                {kindsPresent.map((k) => (
                                    <button key={k} onClick={() => setKind(kind === k ? "todos" : k)}
                                        className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                            kind === k ? "bg-purple-500/20 border-purple-500/45 text-purple-300" : "border-border/40 text-muted-foreground/60 hover:border-purple-500/30")}>
                                        {KIND_LABEL[k]}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={items}
                                max={max}
                                empty="Sin resultados"
                                render={(it) => {
                                    const Icon = KIND_ICON[it.kind];
                                    const inRoute = !!route[it.id];
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-purple-500/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <Icon className="size-3.5 shrink-0 text-purple-300" />
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate block">{it.title}</span>
                                                    {!micro && <span className="text-[9px] text-muted-foreground/60 truncate block">{it.author} · {it.discipline}</span>}
                                                </div>
                                                {it.progress === undefined && <Chip color="#a855f7">{KIND_LABEL[it.kind]}</Chip>}
                                                {!micro && (
                                                    <button onClick={() => toggleRoute(it.id)} title={inRoute ? "Quitar de mi ruta" : "Añadir a mi ruta"}
                                                        className={cn("shrink-0 grid place-items-center size-6 rounded-full border transition-colors cursor-pointer",
                                                            inRoute ? "bg-purple-500/25 border-purple-500/50 text-purple-200" : "border-border/40 text-muted-foreground/60 hover:border-purple-500/40 hover:text-purple-300")}>
                                                        {inRoute ? <Check className="size-3" /> : <Plus className="size-3" />}
                                                    </button>
                                                )}
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
