"use client";

/**
 * Escena 3D compartida · PERSISTENCIA en `os_spaces` (L5 · 2026-09-28).
 * ============================================================================
 * Una escena es una fila de `os_spaces` con `kind = 'escena'` (lo admite la migración
 * `20260928130000_l5-3d-xr.sql`; mientras no esté aplicada, crear falla con un mensaje claro y
 * nada se rompe). Mismo RLS, invitaciones y enlace público que pizarras y escritorios: por eso
 * compartir reutiliza `inviteToSpace`/`updateSpaceMeta`/`deleteSpace` de `@/lib/spaces/spaces`.
 *
 * Guardar es COMPARAR-E-INTERCAMBIAR sobre `rev` (el disparador lo sube en cada UPDATE): se
 * escribe solo si nadie escribió desde la última lectura; si alguien lo hizo, quien llama relee,
 * fusiona objeto a objeto y vuelve a intentarlo. Así dos personas guardando a la vez no se pisan.
 */

import { createClient } from "@/utils/supabase/client";
import { deviceId } from "@/lib/sync/entity-state";
import { sanearDoc, type DocEscena } from "./modelo";

export const KIND_ESCENA = "escena";

export type ErrorEscena = "sin-sesion" | "sin-migracion" | "no-encontrada" | "sin-permiso" | "red";

export const MENSAJES_ERROR: Record<ErrorEscena, string> = {
    "sin-sesion": "Inicia sesión para crear o guardar escenas 3D.",
    "sin-migracion":
        "Las escenas 3D compartidas aún no están activadas en la base de datos del OS. En cuanto se aplique su actualización, podrás crearlas.",
    "no-encontrada": "No se encuentra esta escena, o no tienes acceso a ella. Pide a quien la creó que te invite.",
    "sin-permiso": "Solo puedes mirar: quien creó la escena no te ha dado permiso para editarla.",
    red: "No hay conexión con el servidor. Lo que hagas se queda aquí hasta que vuelva.",
};

export interface FilaEscena {
    id: string;
    titulo: string;
    dueno: string;
    acceso: string;
    rev: number;
    doc: DocEscena;
    /** Objetos que no se pudieron leer (datos dañados o por encima del techo). */
    descartados: number;
    actualizada: string;
}

export interface ResumenEscena {
    id: string;
    titulo: string;
    actualizada: string;
    objetos: number;
}

function clasificar(error: { code?: string; message?: string } | null | undefined): ErrorEscena {
    const code = error?.code ?? "";
    const msg = (error?.message ?? "").toLowerCase();
    if (code === "23514" || msg.includes("os_spaces_kind_check") || msg.includes("check constraint")) return "sin-migracion";
    if (code === "42501" || msg.includes("row-level security") || msg.includes("permission")) return "sin-permiso";
    if (code === "PGRST116") return "no-encontrada";
    return "red";
}

function filaDe(row: Record<string, unknown>): FilaEscena {
    const { doc, descartados } = sanearDoc(row.doc);
    return {
        id: String(row.id),
        titulo: typeof row.title === "string" && row.title.trim() ? row.title : "Escena sin título",
        dueno: String(row.owner_account ?? ""),
        acceso: typeof row.access === "string" ? row.access : "invite",
        rev: typeof row.rev === "number" ? row.rev : 0,
        doc,
        descartados,
        actualizada: typeof row.updated_at === "string" ? row.updated_at : "",
    };
}

export async function usuarioActual(): Promise<string | null> {
    try {
        const { data } = await createClient().auth.getSession();
        return data.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

export async function crearFilaEscena(
    titulo: string,
    doc: DocEscena,
): Promise<{ fila: FilaEscena; error?: undefined } | { fila?: undefined; error: ErrorEscena }> {
    const uid = await usuarioActual();
    if (!uid) return { error: "sin-sesion" };
    try {
        const { data, error } = await createClient()
            .from("os_spaces")
            .insert({
                kind: KIND_ESCENA,
                title: titulo.trim().slice(0, 120) || "Escena 3D",
                owner_account: uid,
                access: "invite",
                allowed_profiles: [],
                doc,
                device_id: deviceId(),
            })
            .select("*")
            .maybeSingle();
        if (error || !data) return { error: clasificar(error) };
        return { fila: filaDe(data as Record<string, unknown>) };
    } catch {
        return { error: "red" };
    }
}

export async function leerFilaEscena(
    id: string,
): Promise<{ fila: FilaEscena; error?: undefined } | { fila?: undefined; error: ErrorEscena }> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "no-encontrada" };
    try {
        const { data, error } = await createClient().from("os_spaces").select("*").eq("id", id).maybeSingle();
        if (error) return { error: clasificar(error) };
        if (!data) return { error: "no-encontrada" };
        const row = data as Record<string, unknown>;
        if (row.kind !== KIND_ESCENA && !(row.doc && (row.doc as Record<string, unknown>).tipo === "escena3d")) {
            return { error: "no-encontrada" };
        }
        return { fila: filaDe(row) };
    } catch {
        return { error: "red" };
    }
}

export type ResultadoGuardado =
    | { ok: true; rev: number }
    | { ok: false; conflicto: true }
    | { ok: false; conflicto?: false; error: ErrorEscena };

/** Escribe `doc` solo si la fila sigue en `rev`. Sin filas afectadas = conflicto (o sin permiso). */
export async function guardarSiRev(id: string, rev: number, doc: DocEscena): Promise<ResultadoGuardado> {
    try {
        const { data, error } = await createClient()
            .from("os_spaces")
            .update({ doc, device_id: deviceId() })
            .eq("id", id)
            .eq("rev", rev)
            .select("rev");
        if (error) return { ok: false, error: clasificar(error) };
        const filas = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        if (filas.length === 0) return { ok: false, conflicto: true };
        const nueva = filas[0].rev;
        return { ok: true, rev: typeof nueva === "number" ? nueva : rev + 1 };
    } catch {
        return { ok: false, error: "red" };
    }
}

/**
 * ¿Puede esta cuenta editar la escena? Dueña → sí. Si no, la función `space_can_edit` de la base
 * (la misma que decide el RLS); si no se puede llamar, la fila propia de `os_space_editors`.
 */
export async function puedeEditarEscena(id: string, dueno: string): Promise<boolean> {
    const uid = await usuarioActual();
    if (!uid) return false;
    if (uid === dueno) return true;
    const supabase = createClient();
    try {
        const { data, error } = await supabase.rpc("space_can_edit", { _space_id: id });
        if (!error && typeof data === "boolean") return data;
    } catch {
        /* sigue abajo */
    }
    try {
        const { data } = await supabase
            .from("os_space_editors")
            .select("role,status")
            .eq("space_id", id)
            .eq("account", uid)
            .maybeSingle();
        const fila = data as { role?: string; status?: string } | null;
        return !!fila && fila.role === "editor" && (fila.status === "member" || fila.status === "invited");
    } catch {
        return false;
    }
}

export async function listarEscenasPropias(): Promise<ResumenEscena[]> {
    const uid = await usuarioActual();
    if (!uid) return [];
    try {
        const { data, error } = await createClient()
            .from("os_spaces")
            .select("id,title,updated_at,doc")
            .eq("owner_account", uid)
            .eq("kind", KIND_ESCENA)
            .order("updated_at", { ascending: false })
            .limit(100);
        if (error || !Array.isArray(data)) return [];
        return (data as Array<Record<string, unknown>>).map((row) => {
            const f = filaDe(row);
            return {
                id: f.id,
                titulo: f.titulo,
                actualizada: f.actualizada,
                objetos: Object.values(f.doc.objetos).filter((o) => !o.borrado).length,
            };
        });
    } catch {
        return [];
    }
}

/** Escenas a las que me han invitado o que son de mis grupos (lo que el RLS me deja leer y no es mío). */
export async function listarEscenasCompartidas(): Promise<ResumenEscena[]> {
    const uid = await usuarioActual();
    if (!uid) return [];
    try {
        const { data: filas } = await createClient()
            .from("os_space_editors")
            .select("space_id")
            .eq("account", uid)
            .limit(200);
        const ids = Array.isArray(filas) ? (filas as Array<{ space_id?: string }>).map((f) => String(f.space_id)).filter(Boolean) : [];
        if (ids.length === 0) return [];
        const { data, error } = await createClient()
            .from("os_spaces")
            .select("id,title,updated_at,doc,owner_account")
            .in("id", ids)
            .eq("kind", KIND_ESCENA)
            .order("updated_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return (data as Array<Record<string, unknown>>)
            .filter((row) => row.owner_account !== uid)
            .map((row) => {
                const f = filaDe(row);
                return { id: f.id, titulo: f.titulo, actualizada: f.actualizada, objetos: Object.values(f.doc.objetos).filter((o) => !o.borrado).length };
            });
    } catch {
        return [];
    }
}
