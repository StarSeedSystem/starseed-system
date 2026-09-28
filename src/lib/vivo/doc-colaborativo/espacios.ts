"use client";

/**
 * Espacios de las apps colaborativas L2 (Documento, Presentación) sobre `os_spaces`.
 *
 * DECISIÓN (2026-09-28): `os_spaces.kind` solo admite desktop|dashboard|board (CHECK de la
 * migración 20260712090100). En lugar de tocar ese CHECK (otros agentes podrían reescribirlo a la
 * vez y el último en aplicarse ganaría), se usa `kind = 'dashboard'` como contenedor genérico —
 * el mismo precedente que `sharing/access.ts` para cerebros/archivos/carpetas, «nunca listado hoy
 * por ninguna vista de dashboards» — y el tipo REAL viaja en `doc.app` ("documento" |
 * "presentacion"). Así funciona YA, sin migración, con la RLS, las invitaciones
 * (`os_space_editors`) y el enlace público que ya existen para pizarras y escritorios.
 */

import { createClient } from "@/utils/supabase/client";
import { acceptSpaceInvite, createSpace, getSpace, type Space } from "@/lib/spaces/spaces";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";
import { colorDePersona } from "./modelo";
import type { Yo } from "./motor";

export type AppColaborativa = "documento" | "presentacion";
export const KIND_ESPACIO_APP = "dashboard" as const;

export const SIN_CUENTA_CREAR = "No se pudo crear. Inicia sesión e inténtalo de nuevo.";

export async function uidActual(): Promise<string | null> {
    try {
        const { data } = await createClient().auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/** Crea el espacio de una app colaborativa (acceso por invitación, como las demás apps en vivo). */
export async function crearEspacioApp(app: AppColaborativa, titulo: string, doc: Record<string, unknown>): Promise<Space> {
    const space = await createSpace({
        kind: KIND_ESPACIO_APP,
        title: titulo,
        access: "invite",
        doc: { ...doc, app },
    });
    if (!space) throw new Error(SIN_CUENTA_CREAR);
    return space;
}

export interface EntradaListaApp {
    refId: string;
    titulo: string;
    actualizado: string;
    /** true = lo creaste tú; false = te lo compartieron. */
    propio: boolean;
}

function filaAEntrada(row: Record<string, unknown>, uid: string): EntradaListaApp {
    return {
        refId: String(row.id),
        titulo: typeof row.title === "string" && row.title.trim() ? row.title : "Sin título",
        actualizado: typeof row.updated_at === "string" ? row.updated_at : "",
        propio: row.owner_account === uid,
    };
}

/**
 * Tus documentos/presentaciones: los tuyos y los que te compartieron (invitación aceptada o
 * pendiente). Solo columnas ligeras (nunca el `doc` entero) y filtro por `doc.app` en el índice GIN.
 */
export async function listarEspaciosApp(app: AppColaborativa, opciones: { soloPropios?: boolean } = {}): Promise<EntradaListaApp[]> {
    const uid = await uidActual();
    if (!uid) return [];
    const sb = createClient();
    const columnas = "id, title, updated_at, owner_account";
    const salida = new Map<string, EntradaListaApp>();
    try {
        const { data, error } = await sb
            .from("os_spaces")
            .select(columnas)
            .eq("owner_account", uid)
            .eq("kind", KIND_ESPACIO_APP)
            .contains("doc", { app })
            .order("updated_at", { ascending: false })
            .limit(200);
        if (!error && Array.isArray(data)) for (const row of data as Record<string, unknown>[]) salida.set(String(row.id), filaAEntrada(row, uid));
    } catch {
        /* sin red: lista vacía */
    }
    if (!opciones.soloPropios) {
        try {
            const { data: filas } = await sb
                .from("os_space_editors")
                .select("space_id")
                .eq("account", uid)
                .in("status", ["member", "invited"])
                .limit(300);
            const ids = (Array.isArray(filas) ? filas : []).map((f) => String((f as Record<string, unknown>).space_id)).filter((id) => !salida.has(id));
            if (ids.length) {
                const { data } = await sb
                    .from("os_spaces")
                    .select(columnas)
                    .in("id", ids)
                    .eq("kind", KIND_ESPACIO_APP)
                    .contains("doc", { app })
                    .order("updated_at", { ascending: false });
                if (Array.isArray(data)) for (const row of data as Record<string, unknown>[]) salida.set(String(row.id), filaAEntrada(row, uid));
            }
        } catch {
            /* compartidos: best-effort */
        }
    }
    return [...salida.values()].sort((a, b) => (a.actualizado < b.actualizado ? 1 : a.actualizado > b.actualizado ? -1 : 0));
}

/** ¿Puede `uid` editar el espacio? Dueño · RPC `space_can_edit` · su fila de editor. */
export async function resolverPermisoEspacio(space: Pick<Space, "id" | "ownerAccount">, uid: string | null): Promise<boolean> {
    if (!uid) return false;
    if (space.ownerAccount === uid) return true;
    const sb = createClient();
    try {
        const { data, error } = await sb.rpc("space_can_edit", { _space_id: space.id });
        if (!error && typeof data === "boolean") return data;
    } catch {
        /* sin RPC expuesta: se deduce de la fila */
    }
    try {
        const { data } = await sb.from("os_space_editors").select("role, status").eq("space_id", space.id).eq("account", uid).maybeSingle();
        const fila = data as { role?: string; status?: string } | null;
        return fila?.role === "editor" && (fila.status === "member" || fila.status === "invited");
    } catch {
        return false;
    }
}

export interface EspacioAbierto {
    space: Space;
    yo: Yo;
    puedeEditar: boolean;
}

export type ResultadoAbrir = { ok: true; abierto: EspacioAbierto } | { ok: false; motivo: "no-encontrado" | "red" };

/** Nombre visible de la persona (perfil público; si no, el correo sin dominio). */
async function nombreDe(uid: string | null): Promise<string> {
    if (!uid) return "Invitado";
    try {
        const perfiles = await fetchProfilesByIds([uid]);
        const p = perfiles[uid];
        if (p?.displayName?.trim()) return p.displayName.trim().slice(0, 60);
        if (p?.username?.trim()) return `@${p.username.trim()}`.slice(0, 60);
    } catch {
        /* sigue */
    }
    try {
        const { data } = await createClient().auth.getUser();
        const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const nombre = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
        if (nombre.trim()) return nombre.trim().slice(0, 60);
        const correo = data?.user?.email ?? "";
        if (correo) return correo.split("@")[0].slice(0, 60);
    } catch {
        /* sigue */
    }
    return "Alguien";
}

/** Abre un espacio: acepta la invitación pendiente, lee la fila y decide si se puede editar. */
export async function abrirEspacioApp(espacioId: string): Promise<ResultadoAbrir> {
    const uid = await uidActual();
    if (uid) await acceptSpaceInvite(espacioId).catch(() => {});
    const space = await getSpace(espacioId);
    if (!space) {
        // getSpace no distingue «no existe» de «sin red»: probamos la red con una lectura mínima.
        try {
            const { error } = await createClient().from("os_spaces").select("id").limit(1);
            if (error && /fetch|network/i.test(error.message)) return { ok: false, motivo: "red" };
        } catch {
            return { ok: false, motivo: "red" };
        }
        return { ok: false, motivo: "no-encontrado" };
    }
    const [puedeEditar, nombre] = await Promise.all([resolverPermisoEspacio(space, uid), nombreDe(uid)]);
    return { ok: true, abierto: { space, yo: { uid, nombre, color: colorDePersona(uid) }, puedeEditar } };
}
