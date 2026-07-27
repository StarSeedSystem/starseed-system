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
    archivos: number | null;
}

const EMPTY_REMOTE: RemoteCounts = { comunidades: null, grupos: null, publicaciones: null, archivos: null };

export function useProfileRealCounts(opts: {
    isOwner: boolean;
    linksCount: number;
    targetUserId?: string;
    targetProfileId?: string;
}): ProfileRealCounts {
    const { isOwner, linksCount, targetUserId, targetProfileId } = opts;
    const { user, profile } = useAccount();
    const { items: savedItems } = useSavedLibrary();
    const [remote, setRemote] = useState<RemoteCounts>(EMPTY_REMOTE);

    const currentUserId = user?.id ?? null;
    const currentProfileId = typeof profile?.id === "string" && profile.id ? profile.id : null;
    
    // Si isOwner, usamos nuestros IDs, si no, los del target.
    const resolvedUserId = isOwner ? currentUserId : targetUserId;
    const resolvedProfileId = isOwner ? currentProfileId : targetProfileId;

    useEffect(() => {
        if (!resolvedUserId) {
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
                    .eq("user_id", resolvedUserId);
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
                    .eq("follower_id", resolvedUserId);
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
            if (resolvedProfileId) {
                try {
                    const { count, error } = await supabase
                        .from("cafe_posts")
                        .select("id", { count: "exact", head: true })
                        .eq("profile_id", resolvedProfileId);
                    if (!error && typeof count === "number") publicaciones = count;
                } catch {
                    /* sin dato real → null */
                }
            }

            
            // Archivos: si no es owner, contamos nodos marcados como 'public' en su libreria (doc_acl_allows read).
            let archivos: number | null = null;
                try {
                    // Contar archivos públicos en entity_state para la libreria de este usuario
                    // Asumimos que los items publicos se leen directamente porque RLS lo permite
                    // Pero la forma mas rapida es contar los elementos en el doc de libreria.
                    const { data, error } = await supabase.from('os_entity_library').select('doc').eq('id', `user:${resolvedUserId}`).single();
                    if (!error && data?.doc) {
                        const doc = data.doc;
                        const wholeLibrary = doc.acl?.showInProfile === true;
                        if (wholeLibrary) {
                            archivos = (doc.folders?.length || 0) + (doc.files?.length || 0);
                        } else {
                            archivos = (doc.folders?.filter((f: { acl?: { scope?: string } }) => f.acl?.scope === 'public').length || 0) +
                                       (doc.files?.filter((f: { acl?: { scope?: string } }) => f.acl?.scope === 'public').length || 0);
                        }
                    }
                } catch {
                    /* sin dato */
                }

            if (active) setRemote({ comunidades, grupos, publicaciones, archivos });
        })();

        return () => {
            active = false;
        };
    }, [isOwner, currentUserId, currentProfileId, resolvedUserId, resolvedProfileId]);

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
        // Archivos: Biblioteca local si es dueño, si no, conteo público.
        archivos: remote.archivos,
    };
}
