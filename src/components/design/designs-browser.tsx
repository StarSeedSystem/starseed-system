"use client";

/*
 * DesignsBrowser — explorador de archivos de diseño organizados en CARPETAS
 * (categorías) con sus archivos. Combina el set curado del sistema (Crystal
 * Liquid Glass / Trinity) con los diseños que el usuario ha guardado en su
 * Biblioteca (ítems type:"design", cargados del almacén real vía
 * useEntityLibrary → localStorage + Supabase + realtime).
 *
 * Reutilizado por: la pestaña "Diseños" de la Librería y la subsección "Temas"
 * de los ajustes de personalización del perfil. Cada archivo se abre en el
 * Estudio, se aplica al perfil/página, se descarga, se instala o se guarda en
 * carpetas — todo vía DesignFileCard.
 */

import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Folder, LayoutGrid, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntityLibrary, useMyLibraryDestinations } from "@/lib/library/entity-library";
import { DesignFileCard } from "./design-file-card";
import {
    CURATED_DESIGN_FILES, DESIGN_CATEGORIES, categoryForType, designFromSavedItem, type DesignFile,
} from "@/lib/design/design-files";

export interface DesignsBrowserProps {
    /** Incluir el set curado del sistema (por defecto sí). */
    showCurated?: boolean;
    /** Altura máxima del área desplazable (px). Sin valor: crece libre. */
    maxHeight?: number;
    className?: string;
}

function catOf(d: DesignFile): string {
    const byId = DESIGN_CATEGORIES.find((c) => c.id === d.categoria);
    return byId ? byId.id : categoryForType(d.tipo);
}

export function DesignsBrowser({ showCurated = true, maxHeight, className }: DesignsBrowserProps) {
    const { destinations } = useMyLibraryDestinations();
    const myRef = destinations[0]?.ref ?? null;
    const { doc, reload } = useEntityLibrary(myRef);
    const [cat, setCat] = useState<string>("todos");

    const userDesigns = useMemo<DesignFile[]>(() => {
        return (doc.items ?? [])
            .filter((it) => it.type === "design")
            .map((it) => designFromSavedItem(it))
            .filter((d): d is DesignFile => Boolean(d));
    }, [doc]);

    const all = useMemo<DesignFile[]>(() => {
        const list: DesignFile[] = showCurated ? [...CURATED_DESIGN_FILES] : [];
        const seen = new Set(list.map((d) => d.id));
        for (const d of userDesigns) {
            if (!seen.has(d.id)) { list.push(d); seen.add(d.id); }
        }
        return list;
    }, [userDesigns, showCurated]);

    const counts = useMemo(() => {
        const m: Record<string, number> = { todos: all.length };
        for (const c of DESIGN_CATEGORIES) m[c.id] = 0;
        for (const d of all) { const k = catOf(d); m[k] = (m[k] ?? 0) + 1; }
        return m;
    }, [all]);

    const filtered = useMemo(
        () => (cat === "todos" ? all : all.filter((d) => catOf(d) === cat)),
        [all, cat],
    );

    const chips = [{ id: "todos", label: "Todos" }, ...DESIGN_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))];

    const grid = (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d) => (
                <DesignFileCard key={`${d.id}-${d.tipo}`} file={d} />
            ))}
            {filtered.length === 0 && (
                <p className="col-span-full py-8 text-center text-xs text-white/40">
                    No hay diseños en esta carpeta todavía. Crea uno en el Estudio o importa un archivo .ssdesign.json.
                </p>
            )}
        </div>
    );

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setCat(c.id)}
                        className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all",
                            cat === c.id
                                ? "border-white/25 bg-white/10 text-white"
                                : "border-transparent bg-white/[0.03] text-white/45 hover:bg-white/5 hover:text-white/80",
                        )}
                    >
                        {c.id === "todos" ? <LayoutGrid className="h-3 w-3" /> : <Folder className="h-3 w-3" />}
                        {c.label}
                        <span className="rounded-full bg-black/30 px-1.5 text-[9px] text-white/50">{counts[c.id] ?? 0}</span>
                    </button>
                ))}
                <Button size="icon" variant="ghost" onClick={reload} className="ml-auto h-7 w-7 text-white/40 hover:text-white" title="Recargar diseños">
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
            </div>

            {maxHeight ? (
                <ScrollArea style={{ height: maxHeight }} className="pr-2">{grid}</ScrollArea>
            ) : (
                grid
            )}
        </div>
    );
}

export default DesignsBrowser;
