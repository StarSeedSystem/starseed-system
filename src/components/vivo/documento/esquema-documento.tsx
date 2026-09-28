"use client";

/**
 * Esquema del documento: los títulos en orden (sangrados por nivel) para saltar a cada parte.
 * Resalta la sección donde está tu cursor y muestra quién está en cada una.
 */

import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntradaEsquema } from "@/lib/vivo/documento";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";

export interface EsquemaDocumentoProps {
    entradas: EntradaEsquema[];
    activo: string | null;
    onIr: (id: string) => void;
    /** Quién está en cada sección (id de título → personas). */
    presentesPorSeccion?: Map<string, Presente[]>;
    className?: string;
}

export function EsquemaDocumento({ entradas, activo, onIr, presentesPorSeccion, className }: EsquemaDocumentoProps) {
    return (
        <nav aria-label="Esquema del documento" className={cn("flex min-h-0 flex-col", className)}>
            <p className="flex items-center gap-2 px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                <ListTree className="h-3.5 w-3.5" aria-hidden="true" /> Esquema
            </p>
            {entradas.length === 0 ? (
                <p className="px-3 text-[12.5px] leading-relaxed text-white/55">
                    Los títulos que escribas (Título 1, 2 o 3) aparecerán aquí para saltar entre partes.
                </p>
            ) : (
                <ol className="min-h-0 space-y-0.5 overflow-y-auto pr-1" role="list">
                    {entradas.map((e) => {
                        const gente = presentesPorSeccion?.get(e.id) ?? [];
                        const esActivo = e.id === activo;
                        return (
                            <li key={e.id}>
                                <button
                                    type="button"
                                    onClick={() => onIr(e.id)}
                                    aria-current={esActivo ? "location" : undefined}
                                    className={cn(
                                        "flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-[12px] py-1.5 pr-2 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]",
                                        esActivo ? "bg-[#7C5CFF]/[0.16] text-white shadow-[inset_0_0_0_1px_#7C5CFF88]" : "text-white/75",
                                    )}
                                    style={{ paddingLeft: 12 + (e.nivel - 1) * 14 }}
                                >
                                    <span className={cn("min-w-0 flex-1 leading-snug", e.nivel === 1 ? "text-[13.5px] font-semibold" : "text-[13px]")}>{e.texto}</span>
                                    {gente.length > 0 && (
                                        <span className="flex flex-none -space-x-1" aria-label={`Aquí: ${gente.map((g) => g.nombre).join(", ")}`}>
                                            {gente.slice(0, 3).map((g) => (
                                                <span key={g.clave} className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_1.5px_rgba(12,14,34,.95)]" style={{ background: g.color }} />
                                            ))}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </nav>
    );
}
