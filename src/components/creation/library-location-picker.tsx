"use client";

// src/components/creation/library-location-picker.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE UBICACIÓN de la LIBRERÍA (Adenda 66 §6) — para el destino
// «Librería» del Lienzo: elige BIBLIOTECA (de las que el usuario tiene acceso,
// vía myLibraryDestinations) + FOLDER destino dentro de ella (árbol de folders
// de src/lib/library/entity-library). El Lienzo guarda el contenido como ítem
// de biblioteca en esta ubicación (con su ACL), no como post.
//
// Estilo Crystal Liquid Glass · iconos Lucide · alias @/ · SSR-safe.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
    useMyLibraryDestinations,
    useEntityLibrary,
    type EntityRef,
    type LibraryFolder,
} from "@/lib/library/entity-library";
import { Library, FolderTree, FolderRoot, Loader2 } from "lucide-react";

/** Ubicación destino resuelta (biblioteca + folder). */
export interface LibraryLocation {
    ref: EntityRef;
    /** Etiqueta de la biblioteca (para el toast/UI). */
    libraryLabel: string;
    /** Folder destino (null = raíz de la biblioteca). */
    folderId: string | null;
    folderLabel?: string;
}

interface LibraryLocationPickerProps {
    value: LibraryLocation | null;
    onChange: (loc: LibraryLocation | null) => void;
    className?: string;
}

/** Ordena los folders en un recorrido en profundidad, con nivel de anidamiento. */
function flattenFolders(folders: LibraryFolder[]): Array<{ folder: LibraryFolder; depth: number }> {
    const byParent = new Map<string | null, LibraryFolder[]>();
    for (const f of folders) {
        const key = f.parentId ?? null;
        const list = byParent.get(key) ?? [];
        list.push(f);
        byParent.set(key, list);
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    }
    const out: Array<{ folder: LibraryFolder; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
        for (const f of byParent.get(parentId) ?? []) {
            out.push({ folder: f, depth });
            walk(f.id, depth + 1);
        }
    };
    walk(null, 0);
    return out;
}

export function LibraryLocationPicker({ value, onChange, className }: LibraryLocationPickerProps) {
    const { destinations, loading } = useMyLibraryDestinations();
    // Biblioteca elegida (por defecto la primera = "Mi biblioteca").
    const [libKey, setLibKey] = useState<string | null>(null);

    // Selección inicial: la primera biblioteca disponible.
    useEffect(() => {
        if (!libKey && destinations.length > 0) {
            const first = destinations[0];
            setLibKey(`${first.ref.kind}:${first.ref.id}`);
        }
    }, [destinations, libKey]);

    const chosenDest = useMemo(
        () => destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === libKey) ?? null,
        [destinations, libKey],
    );

    const libRef = chosenDest?.ref ?? null;
    const { doc, loading: foldersLoading } = useEntityLibrary(libRef);
    const flatFolders = useMemo(() => flattenFolders(doc.folders), [doc.folders]);

    // Cuando cambia la biblioteca, fija la ubicación en la raíz de esa biblioteca.
    useEffect(() => {
        if (!chosenDest) return;
        const same =
            value &&
            value.ref.kind === chosenDest.ref.kind &&
            value.ref.id === chosenDest.ref.id;
        if (!same) {
            onChange({
                ref: chosenDest.ref,
                libraryLabel: chosenDest.label,
                folderId: null,
                folderLabel: undefined,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [libKey]);

    if (loading) {
        return (
            <p className="flex items-center gap-2 text-xs text-white/45">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando tus bibliotecas…
            </p>
        );
    }
    if (destinations.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-white/12 p-3 text-xs text-white/45">
                Inicia sesión para guardar en una biblioteca.
            </p>
        );
    }

    const selectFolder = (folderId: string | null, folderLabel?: string) => {
        if (!chosenDest) return;
        onChange({ ref: chosenDest.ref, libraryLabel: chosenDest.label, folderId, folderLabel });
    };

    return (
        <div className={cn("space-y-3", className)}>
            {/* Biblioteca */}
            <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Biblioteca</p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {destinations.map((d) => {
                        const key = `${d.ref.kind}:${d.ref.id}`;
                        const active = key === libKey;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setLibKey(key)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 cursor-pointer",
                                    active
                                        ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                                        : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]",
                                )}
                            >
                                <Library className="w-3 h-3" />
                                <span className="max-w-[150px] truncate">{d.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Folder destino */}
            <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Folder destino</p>
                {foldersLoading ? (
                    <p className="flex items-center gap-2 text-xs text-white/45">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando folders…
                    </p>
                ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                        <button
                            type="button"
                            onClick={() => selectFolder(null)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                                (value?.folderId ?? null) === null
                                    ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                                    : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]",
                            )}
                        >
                            <FolderRoot className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            Raíz de la biblioteca
                        </button>
                        {flatFolders.map(({ folder, depth }) => {
                            const active = value?.folderId === folder.id;
                            return (
                                <button
                                    key={folder.id}
                                    type="button"
                                    onClick={() => selectFolder(folder.id, folder.name)}
                                    style={{ paddingLeft: `${0.625 + depth * 0.9}rem` }}
                                    className={cn(
                                        "flex w-full items-center gap-2 rounded-lg border py-1.5 pr-2.5 text-left text-xs transition-colors cursor-pointer",
                                        active
                                            ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                                            : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]",
                                    )}
                                >
                                    <FolderTree className="h-3.5 w-3.5 shrink-0 text-white/40" />
                                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
