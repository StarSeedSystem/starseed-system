"use client";
/**
 * Tus espacios en vivo (Ola 0929-C) — lo que CREASTE en el OS: escenas 3D, salas de juego,
 * documentos, presentaciones, tablas, pizarras y programas, todos filas de `os_spaces`.
 *
 * Una sola lectura ligera (id, título, tipo y fecha: nunca el `doc` entero, solo sus marcas
 * `doc->>app` / `doc->>vivo`) que COMPARTEN el Multiverso y el Estudio Creativo: una petición
 * cada 15 min como mucho, solo con el widget a la vista (`useCompartido`).
 */
import * as React from "react";
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { leerCompartido, obtenerCompartido, useCompartido, type EstadoCompartido } from "./recurso";

export type TipoEspacio = "escena" | "juego" | "documento" | "presentacion" | "tabla" | "pizarra" | "programa" | "dashboard" | "escritorio" | "otro";

export interface Espacio {
    id: string;
    titulo: string;
    tipo: TipoEspacio;
    /** ISO de la última edición. */
    actualizado: string;
}

export const TTL_ESPACIOS_MS = 15 * 60_000;

/** El tipo real: `kind` de la fila y, para los contenedores genéricos, la marca del documento. */
export function tipoDe(fila: { kind?: unknown; app?: unknown; vivo?: unknown }): TipoEspacio {
    const kind = String(fila.kind ?? "");
    const app = String(fila.app ?? "");
    const vivo = String(fila.vivo ?? "");
    if (kind === "escena") return "escena";
    if (kind === "board") return "pizarra";
    if (kind === "desktop") return "escritorio";
    if (kind === "juego" || vivo === "juego") return "juego";
    if (kind === "programa" || vivo === "programa") return "programa";
    if (app === "documento") return "documento";
    if (app === "presentacion") return "presentacion";
    if (vivo === "tabla") return "tabla";
    if (vivo === "dashboard" || kind === "dashboard") return "dashboard";
    return "otro";
}

/** Dónde se abre cada espacio (las mismas rutas que usan sus apps). */
export function rutaDe(e: Pick<Espacio, "id" | "tipo">): string {
    const id = encodeURIComponent(e.id);
    switch (e.tipo) {
        case "escena": return `/escena/${id}`;
        case "juego": return `/juego/${id}`;
        case "documento": return `/documento/${id}`;
        case "presentacion": return `/presentacion/${id}`;
        case "tabla": return `/tabla/${id}`;
        case "pizarra": return `/pizarra?board-space=${id}`;
        case "programa": return `/programa/${id}`;
        case "dashboard": return `/dashboard-compartido/${id}`;
        default: return "/escritorios";
    }
}

export function normalizarEspacios(filas: unknown): Espacio[] {
    return (Array.isArray(filas) ? filas : [])
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string")
        .map((f) => ({
            id: String(f.id),
            titulo: typeof f.title === "string" && f.title.trim() ? f.title.trim() : "Sin título",
            tipo: tipoDe(f),
            actualizado: typeof f.updated_at === "string" ? f.updated_at : "",
        }));
}

async function cargarEspacios(uid: string): Promise<Espacio[]> {
    const { data, error } = await createClient()
        .from("os_spaces")
        .select("id,title,kind,updated_at,app:doc->>app,vivo:doc->>vivo")
        .eq("owner_account", uid)
        .order("updated_at", { ascending: false })
        .limit(40);
    if (error) throw new Error(error.message || "La fuente no respondió");
    return normalizarEspacios(data);
}

export interface EstadoEspacios extends EstadoCompartido<Espacio[]> {
    /** `false` mientras se sabe si hay sesión. */
    listo: boolean;
    sinSesion: boolean;
}

/** Tus espacios (compartido entre widgets e instancias). */
export function useMisEspacios(activo: boolean): EstadoEspacios {
    const [uid, setUid] = React.useState<string | null | undefined>(undefined);
    React.useEffect(() => {
        let vivo = true;
        void uidActual().then((u) => { if (vivo) setUid(u); }).catch(() => { if (vivo) setUid(null); });
        return () => { vivo = false; };
    }, []);
    const r = useCompartido<Espacio[]>(uid ? `espacios:${uid}` : null, TTL_ESPACIOS_MS, () => cargarEspacios(uid!), activo);
    return { ...r, listo: uid !== undefined, sinSesion: uid === null };
}

/**
 * Lo que acabas de crear desde un widget entra YA en la lista compartida (sin volver a pedirla
 * a la nube): el resto de widgets e instancias lo ven al momento.
 */
export async function anotarEspacioNuevo(nuevo: Omit<Espacio, "actualizado">): Promise<void> {
    const uid = await uidActual().catch(() => null);
    if (!uid) return;
    const clave = `espacios:${uid}`;
    const antes = leerCompartido<Espacio[]>(clave)?.datos ?? [];
    const e: Espacio = { ...nuevo, actualizado: new Date().toISOString() };
    await obtenerCompartido<Espacio[]>(clave, TTL_ESPACIOS_MS, async () => [e, ...antes.filter((x) => x.id !== e.id)], { forzar: true });
}

/** «hace 5 min», «hace 3 h», «hace 2 días», «12 sept.» — sin segundos que envejezcan mal. */
export function haceTexto(iso: string, ahora = Date.now()): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const min = Math.max(0, Math.floor((ahora - t) / 60_000));
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} día${d === 1 ? "" : "s"}`;
    return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
