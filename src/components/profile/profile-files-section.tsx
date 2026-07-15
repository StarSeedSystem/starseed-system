'use client';

// ════════════════════════════════════════════════════════════════
// ProfileFilesSection — sección "Archivos" del perfil
// ----------------------------------------------------------------
// Muestra los recursos REALES guardados en la Biblioteca del usuario
// (lib/library-store → localStorage soberano del dispositivo). Solo
// el dueño ve su biblioteca; para perfiles ajenos no existe fuente
// accesible → estado vacío honesto (nunca archivos inventados).
// ════════════════════════════════════════════════════════════════

import React from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { FolderOpen, FileText, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useSavedLibrary } from "@/lib/library-store";

interface ProfileFilesSectionProps {
    isOwner: boolean;
    /** Nombre visible del perfil (para los textos). */
    name: string;
    /** UID del dueño del perfil (para resolver su biblioteca pública). */
    ownerUid?: string | null;
}

function formatSavedAt(ts: number): string {
    try {
        return new Date(ts).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    } catch {
        return "";
    }
}

import { useEntityLibrary, libraryRef } from "@/lib/library/entity-library";
import { profilePublicNodes } from "@/lib/sharing/access";

export function ProfileFilesSection({ isOwner, name, ownerUid }: ProfileFilesSectionProps) {
    const localLibrary = useSavedLibrary();
    // Resolutor de la biblioteca pública del perfil visitado
    const { doc: publicDoc, loading: publicLoading } = useEntityLibrary(
        !isOwner && ownerUid ? libraryRef("user", ownerUid) : null
    );

    // Los archivos públicos mostrados al visitante
    const publicFiles = React.useMemo(() => {
        if (isOwner || !publicDoc) return [];
        const shown = profilePublicNodes(publicDoc);
        return shown.files.map((f) => publicDoc.items.find((it) => it.id === f.id)).filter(Boolean) as any[];
    }, [isOwner, publicDoc]);

    const items = isOwner ? localLibrary.items.filter(it => it.kind === 'file' || it.kind === 'package') : publicFiles;
    const isLoading = !isOwner && publicLoading;

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <FolderOpen className="h-4 w-4 text-violet-400" /> Archivos
                    </CardTitle>
                    <CardDescription>
                        {isOwner
                            ? "Recursos guardados en tu Biblioteca (en este dispositivo)."
                            : `Archivos compartidos por ${name}.`}
                    </CardDescription>
                </div>
                <Link
                    href="/library"
                    className="shrink-0 whitespace-nowrap text-sm text-primary hover:underline cursor-pointer"
                >
                    Ver biblioteca →
                </Link>
            </CardHeader>
            <CardContent>
                {/* Perfil ajeno: no hay fuente real accesible de sus archivos. */}
                {!isOwner && items.length === 0 && !isLoading && (
                    <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        Este perfil aún no comparte archivos públicos.
                    </p>
                )}

                {!isOwner && isLoading && (
                    <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground animate-pulse">
                        Sincronizando archivos públicos...
                    </p>
                )}

                {isOwner && items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        Aún no has guardado archivos en tu Biblioteca.
                    </p>
                )}

                {items.length > 0 && (
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => {
                            const inner = (
                                <>
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05]">
                                        <FileText className="h-3.5 w-3.5 text-violet-400" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium group-hover:text-primary transition-colors">
                                            {item.title}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {item.kind}
                                            {item.savedAt ? ` · ${formatSavedAt(item.savedAt)}` : ""}
                                        </span>
                                    </span>
                                    {item.url && (
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                                    )}
                                </>
                            );
                            const cls =
                                "group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-all hover:-translate-y-0.5 hover:border-white/25";
                            return (
                                <li key={item.id}>
                                    {item.url ? (
                                        item.url.startsWith("/") ? (
                                            <Link href={item.url} className={`${cls} cursor-pointer`}>
                                                {inner}
                                            </Link>
                                        ) : (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`${cls} cursor-pointer`}
                                            >
                                                {inner}
                                            </a>
                                        )
                                    ) : (
                                        <div className={cls}>{inner}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
