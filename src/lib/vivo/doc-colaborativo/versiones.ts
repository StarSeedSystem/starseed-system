"use client";

/**
 * Historial de versiones de documentos y presentaciones (últimas 20, restaurables).
 *
 * Las versiones NO viven dentro del `doc` del espacio: si lo hicieran, cada guardado (cada ~1 s
 * mientras alguien escribe) reenviaría 20 copias del documento. Van en su propia tabla
 * `os_doc_versiones` (migración 20260928130000_l2-documentos.sql: RLS = leer si puedes leer el
 * espacio, crear/borrar si puedes editarlo, poda automática a 20) y solo se piden al abrir el
 * panel de historial.
 *
 * Mientras esa migración no esté aplicada, el historial se guarda en ESTE dispositivo
 * (localStorage) y la interfaz lo dice: honestidad antes que fingir que se comparte.
 */

import { createClient } from "@/utils/supabase/client";

export const MAX_VERSIONES = 20;
export const TABLA_VERSIONES = "os_doc_versiones";
const CLAVE_LOCAL = (espacioId: string) => `starseed.doc-colab.versiones.${espacioId}`;
const MAX_BYTES_VERSION = 1_800_000;

export type MotivoVersion = "auto" | "manual" | "restaurar";

export interface InfoVersion {
    id: string;
    creada: string;
    autorNombre: string | null;
    motivo: MotivoVersion;
    resumen: string | null;
    /** true = guardada solo en este dispositivo. */
    local: boolean;
}

interface VersionLocal extends InfoVersion {
    contenido: unknown;
}

export interface ListaVersiones {
    versiones: InfoVersion[];
    /** El servidor todavía no tiene la tabla: el historial es solo de este dispositivo. */
    soloLocal: boolean;
    error: string | null;
}

let tablaAusente = false;

/** ¿El error dice que la tabla no existe (migración sin aplicar)? */
export function esTablaAusente(error: unknown): boolean {
    const e = (error ?? {}) as { code?: unknown; message?: unknown };
    const m = String(e.message ?? "").toLowerCase();
    return e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || (m.includes(TABLA_VERSIONES) && (m.includes("does not exist") || m.includes("could not find")));
}

function motivoValido(v: unknown): MotivoVersion {
    return v === "manual" || v === "restaurar" ? v : "auto";
}

function leerLocal(espacioId: string): VersionLocal[] {
    try {
        const raw = localStorage.getItem(CLAVE_LOCAL(espacioId));
        const lista = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(lista)) return [];
        return lista
            .filter((v): v is VersionLocal => !!v && typeof v === "object" && typeof (v as VersionLocal).id === "string" && typeof (v as VersionLocal).creada === "string")
            .map((v) => ({ ...v, motivo: motivoValido(v.motivo), local: true }))
            .slice(0, MAX_VERSIONES);
    } catch {
        return [];
    }
}

function escribirLocal(espacioId: string, lista: VersionLocal[]): boolean {
    let quedan = lista.slice(0, MAX_VERSIONES);
    while (quedan.length) {
        try {
            localStorage.setItem(CLAVE_LOCAL(espacioId), JSON.stringify(quedan));
            return true;
        } catch {
            quedan = quedan.slice(0, -1); // sin sitio: se olvidan las más viejas
        }
    }
    return false;
}

function idLocal(): string {
    try {
        return globalThis.crypto?.randomUUID?.() ?? `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    } catch {
        return `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }
}

export async function listarVersiones(espacioId: string): Promise<ListaVersiones> {
    const locales = leerLocal(espacioId).map(({ contenido: _c, ...info }) => info);
    if (tablaAusente) return { versiones: locales, soloLocal: true, error: null };
    try {
        const { data, error } = await createClient()
            .from(TABLA_VERSIONES)
            .select("id, creada, autor_nombre, motivo, resumen")
            .eq("space_id", espacioId)
            .order("creada", { ascending: false })
            .limit(MAX_VERSIONES);
        if (error) {
            if (esTablaAusente(error)) {
                tablaAusente = true;
                return { versiones: locales, soloLocal: true, error: null };
            }
            return { versiones: locales, soloLocal: false, error: "No se pudo cargar el historial. Revisa la conexión." };
        }
        const remotas: InfoVersion[] = (Array.isArray(data) ? data : []).map((row) => {
            const r = row as Record<string, unknown>;
            return {
                id: String(r.id),
                creada: typeof r.creada === "string" ? r.creada : "",
                autorNombre: typeof r.autor_nombre === "string" ? r.autor_nombre : null,
                motivo: motivoValido(r.motivo),
                resumen: typeof r.resumen === "string" ? r.resumen : null,
                local: false,
            };
        });
        const todas = [...remotas, ...locales].sort((a, b) => (a.creada < b.creada ? 1 : -1)).slice(0, MAX_VERSIONES);
        return { versiones: todas, soloLocal: false, error: null };
    } catch {
        return { versiones: locales, soloLocal: false, error: "No se pudo cargar el historial. Revisa la conexión." };
    }
}

export async function leerVersion(espacioId: string, version: Pick<InfoVersion, "id" | "local">): Promise<unknown | null> {
    if (version.local) return leerLocal(espacioId).find((v) => v.id === version.id)?.contenido ?? null;
    try {
        const { data, error } = await createClient().from(TABLA_VERSIONES).select("contenido").eq("id", version.id).eq("space_id", espacioId).maybeSingle();
        if (error || !data) return null;
        return (data as { contenido?: unknown }).contenido ?? null;
    } catch {
        return null;
    }
}

export interface NuevaVersion {
    contenido: unknown;
    motivo: MotivoVersion;
    resumen?: string | null;
    autorNombre?: string | null;
}

/** Guarda una versión (en el servidor si se puede; si no, en este dispositivo). */
export async function guardarVersion(espacioId: string, v: NuevaVersion): Promise<{ ok: boolean; local: boolean; error: string | null }> {
    let bytes = 0;
    try {
        bytes = JSON.stringify(v.contenido).length;
    } catch {
        return { ok: false, local: false, error: "No se pudo preparar la versión." };
    }
    if (bytes > MAX_BYTES_VERSION) return { ok: false, local: false, error: "Esta versión es demasiado grande para guardarse en el historial." };
    const resumen = (v.resumen ?? "").trim().slice(0, 160) || null;
    const autorNombre = (v.autorNombre ?? "").trim().slice(0, 80) || null;
    if (!tablaAusente) {
        try {
            const sb = createClient();
            const { data: auth } = await sb.auth.getUser();
            const uid = auth?.user?.id;
            if (uid) {
                const { error } = await sb.from(TABLA_VERSIONES).insert({
                    space_id: espacioId,
                    autor: uid,
                    autor_nombre: autorNombre,
                    motivo: v.motivo,
                    resumen,
                    contenido: v.contenido,
                });
                if (!error) return { ok: true, local: false, error: null };
                if (esTablaAusente(error)) tablaAusente = true;
                else return { ok: false, local: false, error: "No se pudo guardar la versión en el servidor." };
            }
        } catch {
            /* sin red: a este dispositivo */
        }
    }
    const lista = leerLocal(espacioId);
    const nueva: VersionLocal = { id: idLocal(), creada: new Date().toISOString(), autorNombre, motivo: v.motivo, resumen, local: true, contenido: v.contenido };
    const ok = escribirLocal(espacioId, [nueva, ...lista]);
    return ok ? { ok: true, local: true, error: null } : { ok: false, local: true, error: "No queda sitio en este dispositivo para guardar la versión." };
}

/** Solo para pruebas. */
export function reiniciarVersionesParaTests(): void {
    tablaAusente = false;
}
