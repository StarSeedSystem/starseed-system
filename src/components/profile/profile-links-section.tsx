'use client';

// ════════════════════════════════════════════════════════════════
// ProfileLinksSection — sección "Enlaces" del perfil
// ----------------------------------------------------------------
// Lista de enlaces (título + URL) configurables por el DUEÑO del
// perfil, persistidos por handle en profile-display-store
// (localStorage 'starseed.profile.display.v1' → soberanía local).
// Estados vacíos honestos: sin enlaces no se pinta nada falso.
// ════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, ExternalLink, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { useProfileDisplay } from "./profile-display-store";

interface ProfileLinksSectionProps {
    handle: string;
    isOwner: boolean;
    /** Nombre visible del perfil (para los textos). */
    name: string;
}

export function ProfileLinksSection({ handle, isOwner, name }: ProfileLinksSectionProps) {
    const { config, addLink, removeLink } = useProfileDisplay(handle);
    const links = config.links;

    const [title, setTitle] = useState("");
    const [url, setUrl] = useState("");

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;
        addLink(title, url);
        setTitle("");
        setUrl("");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline">
                    <Link2 className="h-4 w-4 text-emerald-400" /> Enlaces
                </CardTitle>
                <CardDescription>
                    {isOwner
                        ? "Tus enlaces destacados. Se guardan en este dispositivo."
                        : `Enlaces destacados de ${name}.`}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {links.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        {isOwner
                            ? "Aún no has añadido enlaces. Añade el primero abajo."
                            : "Este perfil aún no tiene enlaces públicos."}
                    </p>
                )}

                {links.length > 0 && (
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {links.map((l) => {
                            const isInternal = l.url.startsWith("/");
                            const row = (
                                <span className="flex min-w-0 flex-1 items-center gap-3">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05]">
                                        <Link2 className="h-3.5 w-3.5 text-emerald-400" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium group-hover:text-primary transition-colors">
                                            {l.title}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {l.url}
                                        </span>
                                    </span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                                </span>
                            );
                            return (
                                <li key={l.id} className="flex items-center gap-1">
                                    {isInternal ? (
                                        <Link
                                            href={l.url}
                                            className="group flex min-w-0 flex-1 cursor-pointer items-center rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-all hover:-translate-y-0.5 hover:border-white/25"
                                        >
                                            {row}
                                        </Link>
                                    ) : (
                                        <a
                                            href={l.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group flex min-w-0 flex-1 cursor-pointer items-center rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-all hover:-translate-y-0.5 hover:border-white/25"
                                        >
                                            {row}
                                        </a>
                                    )}
                                    {isOwner && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                                            aria-label={`Eliminar enlace ${l.title}`}
                                            onClick={() => removeLink(l.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {isOwner && (
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row"
                    >
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Título (opcional)"
                            className="sm:max-w-[12rem]"
                            aria-label="Título del enlace"
                        />
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://…"
                            type="text"
                            inputMode="url"
                            aria-label="URL del enlace"
                            className="flex-1"
                        />
                        <Button
                            type="submit"
                            disabled={!url.trim()}
                            className="cursor-pointer gap-1.5"
                        >
                            <Plus className="h-4 w-4" /> Añadir
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
