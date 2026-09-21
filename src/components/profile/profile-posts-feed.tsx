"use client";

/**
 * PUBLICACIONES DE UN PERFIL (Adenda 220)
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes la pestaña «Publicaciones» montaba `PostFeed` SIN filtro: enseñaba el
 * feed GLOBAL de `cafe_posts` (o «Aún no hay publicaciones» si esa tabla estaba
 * vacía) y nunca las publicaciones reales de la cuenta, que el Lienzo guarda en
 * `os_posts` (slug virtual `page/perfil-mi-perfil`, páginas, grupos, secciones).
 *
 * Ahora: `useOsPostsByAuthor(uid)` — todo lo publicado por la cuenta dueña del
 * perfil, más los `cafe_posts` de su perfil si existen, ordenado por fecha y
 * pintado con la misma `PostCard` del OS (marcos de forma incluidos).
 */

import { useMemo } from "react";
import Link from "next/link";
import { FileText, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PostCard } from "@/components/social/PostCard";
import { useOsPostsByAuthor } from "@/hooks/use-os-entities";
import { useCafePosts } from "@/hooks/use-cafe-posts";
import type { NormalizedPost } from "@/lib/social-posts";

export function ProfilePostsFeed({
    authorId,
    profileId,
    isOwner,
    name,
}: {
    /** uid real de la cuenta dueña del perfil (null → solo cafe_posts del perfil). */
    authorId: string | null;
    /** id de perfil en `cafe_posts.profile_id`, si se conoce. */
    profileId?: string | null;
    isOwner: boolean;
    name: string;
}) {
    const os = useOsPostsByAuthor(authorId, 50);
    // Solo con `profileId` conocido: sin filtro `useCafePosts` devolvería el feed global.
    const cafe = useCafePosts({ profileId: profileId || "__ninguno__", channelKey: `profile-${profileId || "x"}`, limit: 50 });

    const posts = useMemo<NormalizedPost[]>(() => {
        // Las os_posts del autor son de ESTE perfil: si la fila no guardó nombre
        // (fallback «Ciudadano StarSeed»), se firma con el nombre real del perfil.
        const firmadas = os.posts.map((p) => (!p.authorName || p.authorName === "Ciudadano StarSeed" ? { ...p, authorName: name } : p));
        const todos: NormalizedPost[] = [];
        const vistos = new Set<string>();
        // Fuente "os" primero; "cafe" segundo. Clave compuesta evita colisión
        // si un `os_post` y un `cafe_post` comparten el mismo UUID.
        for (const p of [...firmadas, ...(profileId ? cafe.posts : [])]) {
            const src = firmadas.includes(p) ? "os" : "cafe";
            const key = `${src}:${p.id}`;
            if (!vistos.has(key)) {
                vistos.add(key);
                todos.push(p);
            }
        }
        // Orden cronológico descendente: defensa ante `createdAt` vacío
        // (un `""` colocaba la fila al inicio por `localeCompare`).
        return todos.sort((a, b) => {
            const at = new Date(a.createdAt || "1970-01-01T00:00:00Z").getTime();
            const bt = new Date(b.createdAt || "1970-01-01T00:00:00Z").getTime();
            return bt - at;
        });
    }, [os.posts, cafe.posts, profileId, name]);

    const cargando = os.loading || (Boolean(profileId) && cafe.loading);

    if (cargando && posts.length === 0) {
        return (
            <div className="space-y-4">
                {[0, 1].map((i) => (
                    <div key={i} className="space-y-3 rounded-2xl border border-border/50 p-4">
                        <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-1/3" /></div>
                        <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
                    </div>
                ))}
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={FileText}
                title={isOwner ? "Todavía no has publicado nada" : `${name} todavía no ha publicado`}
                description={isOwner
                    ? "Lo que crees en el Lienzo Universal —texto, fotos con marco, vídeo, código, mapas— aparecerá aquí."
                    : "Cuando publique algo en la red, lo verás en esta pestaña."}
                action={isOwner ? (
                    <Button asChild className="cursor-pointer gap-1.5">
                        <Link href="/crear"><PenSquare className="h-4 w-4" /> Crear mi primera publicación</Link>
                    </Button>
                ) : undefined}
            />
        );
    }

    return (
        <div className="space-y-4">
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
    );
}
