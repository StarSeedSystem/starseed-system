"use client";

// ════════════════════════════════════════════════════════════════════════════
// ProfileLibraryShowcasePanel — «Biblioteca pública de mi perfil» (Adenda 66 §4)
// ----------------------------------------------------------------------------
// Segundo lugar (además del menú «Permisos» de cada nodo en el Finder) desde el
// que se elige QUÉ bibliotecas/folders/archivos aparecen en la sección pública
// de Biblioteca del perfil. Lo NO seleccionado no se lista aunque sea público.
//
// Al MARCAR un nodo, `setShowInProfile` eleva su ámbito a `public` (si no, las
// visitas ni siquiera podrían leerlo — RLS `es_doc_acl_allows`). Al DESMARCAR
// no se revoca nada de lo ya compartido: solo deja de mostrarse en la vitrina
// (justicia restaurativa, CLAUDE.md §6).
//
// Datos: la biblioteca de la CUENTA (`entity_state`, kind 'user'), vía
// entity-library. Sin sesión: no-op honesto.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, Eye, FileText, Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useEntityLibrary, libraryRef, type EntityRef } from "@/lib/library/entity-library";
import { isShownInProfile, setShowInProfile, libraryResourceRef, type ResourceRef } from "@/lib/sharing/access";

function useMyLibraryRef(): EntityRef | null {
    const [ref, setRef] = useState<EntityRef | null>(null);
    useEffect(() => {
        let alive = true;
        void createClient()
            .auth.getUser()
            .then(({ data }) => {
                const uid = data?.user?.id;
                if (alive && uid) setRef(libraryRef("user", uid));
            });
        return () => {
            alive = false;
        };
    }, []);
    return ref;
}

/** Fila con interruptor «Mostrar en mi perfil» para un nodo (biblioteca/folder/archivo). */
function ShowcaseRow({
    icon: Icon,
    label,
    hint,
    resource,
    onChanged,
}: {
    icon: typeof Folder;
    label: string;
    hint?: string;
    resource: ResourceRef;
    onChanged: () => void;
}) {
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setChecked(isShownInProfile(resource));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- type/id identifican el nodo
    }, [resource.type, resource.id, onChanged]);

    const toggle = useCallback(
        (next: boolean) => {
            setBusy(true);
            setChecked(next);
            void setShowInProfile(resource, next)
                .then(() => {
                    toast.message(next ? "Se mostrará en tu perfil" : "Ya no se muestra en tu perfil", {
                        description: next
                            ? `«${label}» pasa a ser público para poder verse en tu perfil.`
                            : `«${label}» deja de listarse en tu perfil.`,
                    });
                    onChanged();
                })
                .finally(() => setBusy(false));
        },
        [resource, label, onChanged],
    );

    return (
        <label
            className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors hover:bg-white/[0.06]",
                checked && "border-emerald-400/30 bg-emerald-400/[0.06]",
            )}
        >
            <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={(e) => toggle(e.target.checked)}
                className="size-3 cursor-pointer accent-emerald-400"
            />
            <Icon className={cn("size-3.5 shrink-0", checked ? "text-emerald-300" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
            {hint && <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>}
            {busy && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
        </label>
    );
}

export function ProfileLibraryShowcasePanel() {
    const myRef = useMyLibraryRef();
    const { doc, loading } = useEntityLibrary(myRef);
    // Fuerza la relectura de `isShownInProfile` (síncrona sobre la cache) tras cada cambio.
    const [tick, setTick] = useState(0);
    const bump = useCallback(() => setTick((t) => t + 1), []);

    const libraryResource = useMemo(
        () => (myRef ? libraryResourceRef(myRef, "Mi biblioteca") : null),
        [myRef],
    );

    if (!myRef) {
        return (
            <p className="rounded-xl border border-dashed border-white/12 p-4 text-center text-xs text-muted-foreground">
                Inicia sesión para elegir qué se muestra en tu perfil.
            </p>
        );
    }

    const empty = !loading && doc.folders.length === 0 && doc.items.length === 0;

    return (
        <div className="space-y-3">
            <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                    <BookMarked className="size-4 text-primary" /> Biblioteca pública de tu perfil
                </h2>
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Eye className="mt-0.5 size-3 shrink-0" />
                    Elige qué folders y archivos aparecen en la pestaña Biblioteca de tu perfil. Lo que no marques no se
                    lista. Marcar un nodo lo hace <b className="font-semibold">público</b> (si no, las visitas no
                    podrían abrirlo).
                </p>
            </div>

            {loading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Cargando tu biblioteca…
                </p>
            ) : empty ? (
                <p className="rounded-xl border border-dashed border-white/12 p-4 text-center text-xs text-muted-foreground">
                    Tu biblioteca aún está vacía. Guarda algo y podrás elegir qué mostrar aquí.
                </p>
            ) : (
                <div className="space-y-3">
                    {libraryResource && (
                        <ShowcaseRow
                            icon={BookMarked}
                            label="Toda mi biblioteca"
                            hint="abre la biblioteca entera"
                            resource={libraryResource}
                            onChanged={bump}
                            key={`lib-${tick}`}
                        />
                    )}

                    {doc.folders.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-muted-foreground">Folders</p>
                            {doc.folders.map((f) => (
                                <ShowcaseRow
                                    key={`${f.id}-${tick}`}
                                    icon={Folder}
                                    label={f.name}
                                    resource={{ type: "folder", id: f.id, title: f.name, libraryRef: myRef, ownerId: myRef.id }}
                                    onChanged={bump}
                                />
                            ))}
                        </div>
                    )}

                    {doc.items.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-muted-foreground">Archivos y referencias</p>
                            {doc.items.slice(0, 40).map((it) => (
                                <ShowcaseRow
                                    key={`${it.id}-${tick}`}
                                    icon={FileText}
                                    label={it.title}
                                    hint={it.type}
                                    resource={{ type: "file", id: it.id, title: it.title, libraryRef: myRef, ownerId: myRef.id }}
                                    onChanged={bump}
                                />
                            ))}
                            {doc.items.length > 40 && (
                                <p className="text-[10px] text-muted-foreground">
                                    Se muestran los 40 primeros. Para el resto, usa «Permisos» desde la Biblioteca.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ProfileLibraryShowcasePanel;
