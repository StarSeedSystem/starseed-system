'use client';

// ════════════════════════════════════════════════════════════════
// ProfileFreeLayout — modo "Libre" del perfil (página abierta)
// ----------------------------------------------------------------
// Renderiza las MISMAS secciones del perfil como bloques apilados
// reordenables y ocultables por el dueño. Orden y visibilidad se
// persisten por handle en profile-display-store (localStorage
// 'starseed.profile.display.v1'), la misma clave del display.
//
// La página construye las secciones (id + título + nodo) y este
// componente solo orquesta orden/visibilidad — así los consumidores
// reales (PostFeed, UnifiedCalendar, CollectionsGrid…) no cambian.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, EyeOff, Eye } from "lucide-react";
import {
    useProfileDisplay,
    type ProfileSectionId,
} from "./profile-display-store";

export interface FreeSectionDef {
    id: ProfileSectionId;
    title: string;
    node: React.ReactNode;
}

interface ProfileFreeLayoutProps {
    handle: string;
    isOwner: boolean;
    /** Secciones disponibles en esta página, en su orden por defecto. */
    sections: FreeSectionDef[];
}

export function ProfileFreeLayout({ handle, isOwner, sections }: ProfileFreeLayoutProps) {
    const { config, toggleSection, reorderSections } = useProfileDisplay(handle);

    const byId = new Map(sections.map((s) => [s.id, s]));
    // Orden persistido, limitado a las secciones que existen en esta página.
    const ordered = config.sections.filter((p) => byId.has(p.id));
    const visible = ordered.filter((p) => p.visible);
    const hidden = ordered.filter((p) => !p.visible);

    const move = (id: ProfileSectionId, dir: -1 | 1) => {
        const ids = ordered.map((p) => p.id);
        const i = ids.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return;
        const next = [...ids];
        [next[i], next[j]] = [next[j], next[i]];
        // Las secciones no presentes en esta página conservan su sitio al final.
        reorderSections(next);
    };

    return (
        // `min-w-0` en el contenedor y en cada bloque: sin él, un hijo ancho
        // (una tabla, un carril de pestañas…) estiraría la columna entera y el
        // contenido acabaría recortado. (Adenda 68 §C)
        <div className="flex min-w-0 flex-col gap-6">
            {isOwner && (
                <p className="text-xs text-muted-foreground">
                    Modo Libre: reordena u oculta los bloques de tu página. Los cambios se
                    guardan en este dispositivo.
                </p>
            )}

            {visible.map((pref, index) => {
                const def = byId.get(pref.id);
                if (!def) return null;
                return (
                    <section
                        key={pref.id}
                        aria-label={def.title}
                        className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.02] shadow-sm backdrop-blur-md"
                    >
                        <header className="flex min-w-0 items-center justify-between gap-2 px-4 pt-3 sm:px-5">
                            <h2 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {def.title}
                            </h2>
                            {isOwner && (
                                <div className="flex shrink-0 items-center gap-0.5">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 cursor-pointer"
                                        aria-label={`Subir ${def.title}`}
                                        disabled={index === 0}
                                        onClick={() => move(pref.id, -1)}
                                    >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 cursor-pointer"
                                        aria-label={`Bajar ${def.title}`}
                                        disabled={index === visible.length - 1}
                                        onClick={() => move(pref.id, 1)}
                                    >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 cursor-pointer"
                                        aria-label={`Ocultar ${def.title}`}
                                        onClick={() => toggleSection(pref.id)}
                                    >
                                        <EyeOff className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                        </header>
                        <div className="p-3 pt-2 sm:p-5 sm:pt-3">{def.node}</div>
                    </section>
                );
            })}

            {visible.length === 0 && (
                <p className="rounded-3xl border border-dashed border-white/12 p-8 text-center text-sm text-muted-foreground">
                    Todos los bloques están ocultos.
                </p>
            )}

            {isOwner && hidden.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Ocultos:
                    </span>
                    {hidden.map((pref) => {
                        const def = byId.get(pref.id);
                        if (!def) return null;
                        return (
                            <button
                                key={pref.id}
                                onClick={() => toggleSection(pref.id)}
                                title={`Mostrar ${def.title}`}
                                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:bg-white/10 hover:text-foreground"
                            >
                                <Eye className="h-3 w-3" /> {def.title}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
