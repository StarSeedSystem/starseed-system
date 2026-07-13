"use client";

// ════════════════════════════════════════════════════════════════════════════
// ProfilePublicLibrary — Biblioteca PÚBLICA de un perfil (Adenda 66 §4)
// ----------------------------------------------------------------------------
// Cada perfil elige QUÉ bibliotecas/folders/archivos aparecen en su sección
// pública de Biblioteca («Mostrar en mi perfil», ShareAccessDialog · §4).
// Esta vista es lo que ve una VISITA: exactamente esos nodos, ni uno más.
//
// Antes: la pestaña Biblioteca de un perfil ajeno decía "es privada" y no
// mostraba nada. Ahora muestra la vitrina elegida por su dueño/a.
//
// Cómo puede leerse sin ser el dueño: al marcar un nodo como "Mostrar en mi
// perfil" su ACL pasa a `scope:"public"`, y la RLS de `entity_state`
// (`es_doc_acl_allows(value,'read')`, migración 20260712100100) deja leer la
// fila de la biblioteca. El filtrado por nodo lo hace este componente: solo se
// listan los marcados (lo NO seleccionado no se lista aunque fuese público).
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, ChevronLeft, ExternalLink, Folder, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntityLibrary, type EntityRef, type SavedItem } from "@/lib/library/entity-library";
import { profilePublicNodes } from "@/lib/sharing/access";
import { deepLinkFor } from "@/components/library/finder/finder-types";

export interface ProfilePublicLibraryProps {
    /** Biblioteca del perfil visitado (kind 'user' con su uid, o 'profile' con la faceta). */
    libraryRef: EntityRef;
    /** Nombre visible del perfil (para los textos honestos). */
    name: string;
}

/** Enlace de apertura de un ítem: ruta interna, url externa o enlace profundo a la Biblioteca. */
function hrefOf(ref: EntityRef, item: SavedItem): string {
    if (item.route) return item.route;
    if (item.url) return item.url;
    return deepLinkFor(ref, item.id);
}

export function ProfilePublicLibrary({ libraryRef, name }: ProfilePublicLibraryProps) {
    const { doc, loading } = useEntityLibrary(libraryRef);
    const [openFolder, setOpenFolder] = useState<string | null>(null);

    const shown = useMemo(() => profilePublicNodes(doc), [doc]);

    const folderItems = useMemo(() => {
        if (!openFolder) return [];
        return doc.items.filter((it) => (it.folderId ?? null) === openFolder);
    }, [doc.items, openFolder]);

    const openFolderName = useMemo(
        () => doc.folders.find((f) => f.id === openFolder)?.name ?? "",
        [doc.folders, openFolder],
    );

    const empty = !loading && shown.folders.length === 0 && shown.files.length === 0;

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <BookMarked className="h-4 w-4 text-primary" /> Biblioteca de {name}
                    </CardTitle>
                    <CardDescription>
                        {shown.wholeLibrary
                            ? "Biblioteca abierta al público por su dueño/a."
                            : "Lo que este perfil ha elegido mostrar públicamente."}
                    </CardDescription>
                </div>
                <Link
                    href="/library"
                    className="shrink-0 whitespace-nowrap text-sm text-primary hover:underline cursor-pointer"
                >
                    Ver Biblioteca →
                </Link>
            </CardHeader>

            <CardContent>
                {loading ? (
                    <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        Cargando…
                    </p>
                ) : empty ? (
                    <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        {name} no muestra todavía nada en su Biblioteca pública. Lo privado sigue siendo privado.
                    </p>
                ) : openFolder ? (
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => setOpenFolder(null)}
                            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" /> {openFolderName || "Volver"}
                        </button>
                        {folderItems.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                                Este folder no tiene contenido visible.
                            </p>
                        ) : (
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {folderItems.map((it) => (
                                    <li key={it.id}>
                                        <Link
                                            href={hrefOf(libraryRef, it)}
                                            target={it.url && !it.route ? "_blank" : undefined}
                                            className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm transition-colors hover:bg-white/[0.07]"
                                        >
                                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="min-w-0 flex-1 truncate">{it.title}</span>
                                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {shown.folders.length > 0 && (
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {shown.folders.map((f) => (
                                    <li key={f.id}>
                                        <button
                                            type="button"
                                            onClick={() => setOpenFolder(f.id)}
                                            className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.07]"
                                        >
                                            <Folder className="h-4 w-4 shrink-0 text-primary" />
                                            <span className="min-w-0 flex-1 truncate">{f.title}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {shown.files.length > 0 && (
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {shown.files.map((f) => {
                                    const item = doc.items.find((it) => it.id === f.id);
                                    if (!item) return null;
                                    return (
                                        <li key={f.id}>
                                            <Link
                                                href={hrefOf(libraryRef, item)}
                                                target={item.url && !item.route ? "_blank" : undefined}
                                                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm transition-colors hover:bg-white/[0.07]"
                                            >
                                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default ProfilePublicLibrary;
