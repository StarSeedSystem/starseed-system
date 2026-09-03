"use client";

/**
 * PUBLICACIONES RECIENTES del perfil (Adenda 220): datos REALES por autor
 * (`useOsPostsByAuthor`) en vez de la lista de ejemplo `feedItems` (vacía
 * desde el de-mock) que dejaba la tarjeta muda. Estado vacío honesto con
 * acción para el dueño.
 */

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, PenSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useOsPostsByAuthor } from "@/hooks/use-os-entities";
import { formatRelativeTime } from "@/lib/social-posts";
import { FilePreview, type FileLike } from "@/components/files/file-preview";

export function RecentPostsWidget({
    authorId,
    isOwner = false,
    name,
    onVerTodas,
}: {
    /** uid real de la cuenta dueña del perfil (null = desconocido). */
    authorId?: string | null;
    isOwner?: boolean;
    name?: string;
    /** Abre la pestaña «Publicaciones» del perfil. */
    onVerTodas?: () => void;
}) {
    const { posts, loading } = useOsPostsByAuthor(authorId ?? null, 3);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Publicaciones recientes</CardTitle>
                <CardDescription>{isOwner ? "Lo último que compartiste en la red." : `Última actividad de ${name || "este perfil"}.`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full rounded-lg" />
                        <Skeleton className="h-12 w-4/5 rounded-lg" />
                    </div>
                ) : posts.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="Todavía no hay publicaciones"
                        description={isOwner ? "Tu primera publicación aparecerá aquí y en tu pestaña «Publicaciones»." : "Cuando publique algo, lo verás aquí."}
                        className="py-8 sm:py-10"
                        action={isOwner ? (
                            <Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5">
                                <Link href="/crear"><PenSquare className="h-3.5 w-3.5" /> Crear publicación</Link>
                            </Button>
                        ) : undefined}
                    />
                ) : (
                    <>
                        {posts.map((p) => {
                            const file: FileLike | null = p.media?.url && (p.media.kind === "image" || p.media.kind === "video")
                                ? { url: p.media.url, name: p.media.name, type: p.media.kind === "video" ? "video/*" : "image/*" }
                                : null;
                            const resumen = (p.title || p.body || "").replace(/\s+/g, " ").trim();
                            return (
                                <div key={p.id} className="rounded-lg border border-white/10 transition-colors hover:bg-white/[0.04]">
                                    <Link href={`/post/${p.id}`} className="block p-3">
                                        <p className="truncate text-sm font-medium">{resumen || "Publicación"}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(p.createdAt)}</p>
                                    </Link>
                                    {file && (
                                        <div className="px-3 pb-3">
                                            <FilePreview file={file} context="post" compact actions={false} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {onVerTodas ? (
                            <button type="button" onClick={onVerTodas} className="cursor-pointer text-sm font-semibold text-primary hover:underline">
                                Ver todas las publicaciones
                            </button>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
