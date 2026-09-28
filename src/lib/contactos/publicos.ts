/**
 * publicos — capa Supabase de la LISTA PÚBLICA de contactos (`os_contactos_publicos`).
 * Es lo ÚNICO que sale de la cuenta: ni teléfono, ni correo, ni notas, ni
 * descripción viajan por aquí — solo `contacto_user_id` + una `etiqueta` (el
 * TIPO de relación, nunca `relacionDetalle` ni notas). Nunca lanza.
 */

import { fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";
import { RELACIONES, TABLA_CONTACTOS_PUBLICOS, type Contacto } from "@/lib/contactos/tipos";
import { createClient } from "@/utils/supabase/client";

const MENSAJE_TABLA_AUSENTE = "La lista pública aún no está disponible en este servidor.";

/** Reconoce "la tabla no existe" (servidor sin la migración aplicada) para mostrar un aviso en vez de un error crudo. */
export function esTablaAusente(error: unknown): boolean {
    const e = error as { code?: string; message?: string } | null | undefined;
    if (!e) return false;
    const code = e.code ?? "";
    const msg = (e.message ?? "").toLowerCase();
    return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("could not find the table");
}

function mensajeDeError(error: unknown, generico: string): string {
    if (esTablaAusente(error)) return MENSAJE_TABLA_AUSENTE;
    const msg = (error as { message?: string } | null | undefined)?.message;
    return msg || generico;
}

/** Etiqueta pública de un contacto: el TIPO de relación (nunca el matiz libre ni notas). */
export function etiquetaDeRelacion(relacion: Contacto["relacion"]): string | null {
    return RELACIONES.find((r) => r.id === relacion)?.etiqueta ?? null;
}

/** Publica (upsert) un contacto en la lista pública del dueño. Devuelve el mensaje de error, o null si fue bien. */
export async function publicarContacto(
    ownerId: string,
    contactoUserId: string,
    etiqueta?: string | null,
): Promise<string | null> {
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from(TABLA_CONTACTOS_PUBLICOS)
            .upsert(
                { owner_id: ownerId, contacto_user_id: contactoUserId, etiqueta: etiqueta ?? null },
                { onConflict: "owner_id,contacto_user_id" },
            );
        return error ? mensajeDeError(error, "No se pudo publicar el contacto.") : null;
    } catch (e) {
        return (e as Error)?.message || "Error de red al publicar el contacto.";
    }
}

/** Quita un contacto de la lista pública del dueño. */
export async function retirarContacto(ownerId: string, contactoUserId: string): Promise<string | null> {
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from(TABLA_CONTACTOS_PUBLICOS)
            .delete()
            .eq("owner_id", ownerId)
            .eq("contacto_user_id", contactoUserId);
        return error ? mensajeDeError(error, "No se pudo retirar el contacto.") : null;
    } catch (e) {
        return (e as Error)?.message || "Error de red al retirar el contacto.";
    }
}

export interface FilaContactoPublico {
    contactoUserId: string;
    etiqueta: string | null;
    perfil: OsProfile;
}

/**
 * Lista pública de un dueño, con los perfiles ya resueltos. Las filas cuyo
 * perfil no es legible (RLS de `os_profiles`) se OMITEN en silencio: esa es la
 * garantía de privacidad — nunca se enseña un `user_id` sin poder mostrar nada de él.
 */
export async function listarContactosPublicos(
    ownerId: string,
): Promise<{ filas: FilaContactoPublico[]; error: string | null }> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from(TABLA_CONTACTOS_PUBLICOS)
            .select("contacto_user_id, etiqueta, orden, creado")
            .eq("owner_id", ownerId)
            .order("orden", { ascending: true })
            .order("creado", { ascending: true });
        if (error) return { filas: [], error: mensajeDeError(error, "No se pudo leer la lista pública.") };

        const filas = (Array.isArray(data) ? data : []) as Array<{
            contacto_user_id: string;
            etiqueta: string | null;
        }>;
        const perfiles = await fetchProfilesByIds(filas.map((f) => String(f.contacto_user_id)));

        const out: FilaContactoPublico[] = [];
        for (const f of filas) {
            const perfil = perfiles[String(f.contacto_user_id)];
            if (!perfil) continue;
            out.push({ contactoUserId: String(f.contacto_user_id), etiqueta: f.etiqueta ?? null, perfil });
        }
        return { filas: out, error: null };
    } catch (e) {
        return { filas: [], error: (e as Error)?.message || "Error de red al leer la lista pública." };
    }
}

/**
 * Hace que la tabla coincida EXACTAMENTE con los contactos vivos, públicos y
 * con `userId` de la cuenta (añade lo que falte, quita lo que sobre).
 */
export async function reconciliarPublicos(ownerId: string, contactos: Contacto[]): Promise<string | null> {
    try {
        const supabase = createClient();
        const deseados = contactos.filter((c) => !c.borrado && c.visibilidad === "publica" && c.userId);
        const idsDeseados = new Set(deseados.map((c) => c.userId as string));

        const { data, error: errorLeer } = await supabase
            .from(TABLA_CONTACTOS_PUBLICOS)
            .select("contacto_user_id")
            .eq("owner_id", ownerId);
        if (errorLeer) return mensajeDeError(errorLeer, "No se pudo leer la lista pública.");

        const existentes = ((Array.isArray(data) ? data : []) as Array<{ contacto_user_id: string }>).map((f) =>
            String(f.contacto_user_id),
        );
        const aQuitar = existentes.filter((id) => !idsDeseados.has(id));
        if (aQuitar.length) {
            const { error } = await supabase
                .from(TABLA_CONTACTOS_PUBLICOS)
                .delete()
                .eq("owner_id", ownerId)
                .in("contacto_user_id", aQuitar);
            if (error) return mensajeDeError(error, "No se pudo limpiar la lista pública.");
        }

        for (const c of deseados) {
            const { error } = await supabase
                .from(TABLA_CONTACTOS_PUBLICOS)
                .upsert(
                    { owner_id: ownerId, contacto_user_id: c.userId as string, etiqueta: etiquetaDeRelacion(c.relacion) },
                    { onConflict: "owner_id,contacto_user_id" },
                );
            if (error) return mensajeDeError(error, "No se pudo publicar la lista.");
        }
        return null;
    } catch (e) {
        return (e as Error)?.message || "Error de red al reconciliar la lista pública.";
    }
}
