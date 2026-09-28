/**
 * migrar-seguidos — importa, UNA vez por cuenta, los "seguidos" de personas
 * (`os_follows`) como contactos privados. Nunca borra `os_follows` (seguir
 * páginas/comunidades/E.F./partidos sigue existiendo tal cual). Nunca lanza.
 */

import { fetchProfileByUsername } from "@/lib/social/os-profiles";
import type { ContactoEntrada } from "@/lib/contactos/tipos";
import { createClient } from "@/utils/supabase/client";

const PREFIJO_PERFIL = "profile-";

function handleDeSlug(slug: string): string {
    return slug.startsWith(PREFIJO_PERFIL) ? slug.slice(PREFIJO_PERFIL.length) : slug;
}

/**
 * Lee `os_follows` de `uid` y resuelve, de los slugs que sean de PERSONA
 * (`profile-<handle>` o el handle a secas), los que de verdad tengan un perfil
 * StarSeed. Los slugs de página/grupo/comunidad no resuelven por username y se
 * descartan solos (no hay falso positivo). Deduplica por `userId`.
 */
export async function leerSeguidosPersonas(uid: string): Promise<ContactoEntrada[]> {
    if (!uid) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_follows").select("page_slug").eq("follower_id", uid);
        if (error || !Array.isArray(data)) return [];

        const handles = Array.from(
            new Set(
                (data as Array<{ page_slug?: string }>)
                    .map((r) => String(r.page_slug ?? "").trim())
                    .filter(Boolean)
                    .map(handleDeSlug),
            ),
        );
        if (!handles.length) return [];

        const perfiles = await Promise.all(
            handles.map((h) => fetchProfileByUsername(h).catch(() => null)),
        );

        const vistos = new Set<string>();
        const salida: ContactoEntrada[] = [];
        for (const perfil of perfiles) {
            if (!perfil || perfil.userId === uid || vistos.has(perfil.userId)) continue;
            vistos.add(perfil.userId);
            salida.push({
                nombre: perfil.displayName,
                username: perfil.username,
                userId: perfil.userId,
                perfil: {
                    nombre: perfil.displayName,
                    avatarUrl: perfil.avatarUrl,
                    bio: perfil.bio,
                    tomada: new Date().toISOString(),
                },
                origen: "seguido",
                visibilidad: "privada",
                relacion: "comunidad",
            });
        }
        return salida;
    } catch {
        return [];
    }
}
