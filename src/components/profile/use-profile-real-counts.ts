'use client';

// ════════════════════════════════════════════════════════════════
// useProfileRealCounts — conteos REALES para los bloques del display
// ----------------------------------------------------------------
// Regla de oro (de-mock): cada bloque muestra un número SOLO si existe
// una fuente real accesible; si no, devuelve null y la UI pinta "—".
// NUNCA se inventan números.
//
// Fuentes reales por bloque (solo para el perfil PROPIO con sesión):
//   • grupos        → Supabase `os_memberships` (user_id).
//   • comunidades   → Supabase `os_follows` (follower_id) cruzado con
//                     `os_pages.kind === "comunidad"`.
//   • publicaciones → Supabase `cafe_posts` (profile_id de la cuenta).
//   • archivos      → localStorage vía useSavedLibrary() (Biblioteca).
//   • enlaces       → los enlaces configurados en profile-display-store.
//   • ef            → SIN fuente real todavía (no hay tabla de E.F. por
//                     usuario) → siempre null ("—").
//   • aportaciones  → SIN fuente real todavía → siempre null ("—").
//
// Para perfiles ajenos no hay fuente fiable (no se puede resolver el
// slug a una cuenta real) → todo null salvo enlaces locales existentes.
// Tolerante a fallos: cada consulta va en try/catch y degrada a null.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useAccount } from "@/context/account-context";
import { createClient } from "@/utils/supabase/client";
import { useSavedLibrary } from "@/lib/library-store";
import type { ProfileBlockId } from "./profile-display-store";

export type ProfileRealCounts = Record<ProfileBlockId, number | null>;

interface RemoteCounts {
    comunidades: number | null;
    grupos: number | null;
    publicaciones: number | null;
}

const EMPTY_REMOTE: RemoteCounts = { comunidades: null, grupos: null, publicaciones: null };

export function useProfileRealCounts(opts: {
    /** true si el perfil visto pertenece a la sesión actual. */
    isOwner: boolean;
    /** Nº de enlaces configurados localmente para este handle. */
    linksCount: number;
}): ProfileRealCounts {
    const { isOwner, linksCount } = opts;
    const { user, profile } = useAccount();
    const { items: savedItems } = useSavedLibrary();
    const [remote, setRemote] = useState<RemoteCounts>(EMPTY_REMOTE);

    const userId = user?.id ?? null;
    const profileId = typeof profile?.id === "string" && profile.id ? profile.id : null;

    useEffect(() => {
        if (!isOwner || !userId) {
            setRemote(EMPTY_REMOTE);
            return;
        }
        let active = true;

        (async () => {
            const supabase = createClient();

            // Grupos: membresías reales del usuario.
            let grupos: number | null = null;
            try {
                const { count, error } = await supabase
                    .from("os_memberships")
                    .select("group_slug", { count: "exact", head: true })
                    .eq("user_id", userId);
                if (!error && typeof count === "number") grupos = count;
            } catch {
                /* sin dato real → null */
            }

            // Comunidades: páginas seguidas cuyo kind es "comunidad".
            let comunidades: number | null = null;
            try {
                const { data, error } = await supabase
                    .from("os_follows")
                    .select("page_slug")
                    .eq("follower_id", userId);
                if (!error && Array.isArray(data)) {
                    const slugs = data
                        .map((r) => (r as { page_slug?: string | null }).page_slug)
                        .filter((s): s is string => typeof s === "string" && s !== "");
                    if (slugs.length === 0) {
                        comunidades = 0;
                    } else {
                        const { data: pages, error: pagesError } = await supabase
                            .from("os_pages")
                            .select("slug,kind")
                            .in("slug", slugs);
                        if (!pagesError && Array.isArray(pages)) {
                            comunidades = pages.filter(
                                (p) => (p as { kind?: string | null }).kind === "comunidad",
                            ).length;
                        }
                    }
                }
            } catch {
                /* sin dato real → null */
            }

            // Publicaciones: posts reales de la cuenta (cafe_posts.profile_id).
            let publicaciones: number | null = null;
            if (profileId) {
                try {
                    const { count, error } = await supabase
                        .from("cafe_posts")
                        .select("id", { count: "exact", head: true })
                        .eq("profile_id", profileId);
                    if (!error && typeof count === "number") publicaciones = count;
                } catch {
                    /* sin dato real → null */
                }
            }

            if (active) setRemote({ comunidades, grupos, publicaciones });
        })();

        return () => {
            active = false;
        };
    }, [isOwner, userId, profileId]);

    return {
        comunidades: remote.comunidades,
        // E.F.: sin fuente real por usuario todavía → honestamente "—".
        ef: null,
        grupos: remote.grupos,
        // Aportaciones: sin fuente real todavía → honestamente "—".
        aportaciones: null,
        publicaciones: remote.publicaciones,
        // Enlaces: los configurados por el dueño en este dispositivo.
        enlaces: isOwner || linksCount > 0 ? linksCount : null,
        // Archivos: Biblioteca local del dueño (localStorage soberano).
        archivos: isOwner ? savedItems.length : null,
    };
}
