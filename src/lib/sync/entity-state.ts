"use client";

/*
 * entity-state — Estado sincronizado por ENTIDAD (usuario, perfil, página, grupo,
 * comunidad, evento, E.F., partido…). Contrato base de:
 *   · Biblioteca por entidad (guardados personales/grupales)
 *   · Secciones compartidas sincronizadas (pizarras, escritorios de grupo, etc.)
 *   · Sincronización en TIEMPO REAL entre dispositivos (Realtime de Supabase)
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md
 * Tabla: public.entity_state (owner_kind, owner_id, key) → value jsonb, rev, updated_at,
 *        updated_by, device_id. RLS: usuario dueño de su ámbito; miembros (os_memberships
 *        por group_slug) o dueños (os_groups/os_pages.owner_id) en ámbitos de entidad.
 * Estrategia: LWW (last-write-wins) por rev/updated_at; device_id evita eco local.
 * Local-first: localStorage sigue siendo fuente de verdad sin conexión.
 */

import { createClient } from "@/utils/supabase/client";

export type EntityKind =
    | "user"
    | "profile"
    | "page"
    | "group"
    | "community"
    | "event"
    | "ef"
    | "party"
    | "other";

export interface EntityRef {
    kind: EntityKind;
    /** uuid del usuario para kind="user"; slug (o uuid) de la entidad en el resto */
    id: string;
}

export interface EntityStateRow<T = unknown> {
    value: T;
    rev: number;
    updated_at: string;
    device_id: string | null;
}

const DEVICE_KEY = "starseed.device.id";

/** Identificador estable de este dispositivo/neurona (se crea una sola vez). */
export function deviceId(): string {
    if (typeof window === "undefined") return "server";
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = `neu-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch {
        return "unknown";
    }
}

/** Ref del usuario autenticado (o null sin sesión). Nunca lanza. */
export async function currentUserRef(): Promise<EntityRef | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data.user ? { kind: "user", id: data.user.id } : null;
    } catch {
        return null;
    }
}

/**
 * Resultado EXPLÍCITO de una lectura/escritura en la nube.
 *
 * ── Por qué existe (Adenda 66 §2 · causa raíz del "solo se guarda en local") ──
 * `getEntityState`/`setEntityState` devolvían `null` TANTO cuando no había fila
 * como cuando Supabase rechazaba la operación (RLS, tabla inexistente, red). El
 * llamador no podía distinguir "no hay nada" de "ha fallado", así que el fallo
 * se propagaba en silencio y el usuario nunca sabía por qué su biblioteca no
 * salía de este dispositivo. Las variantes `*Checked` devuelven el mensaje real
 * para que la UI pueda MOSTRARLO. Las variantes originales se conservan (mismo
 * contrato) para los consumidores que no necesitan el detalle.
 */
export interface EntityStateResult<T = unknown> {
    row: EntityStateRow<T> | null;
    /** Mensaje de error legible, o null si la operación fue bien. */
    error: string | null;
}

/** Lee el estado de una sección distinguiendo "no existe" (row=null, error=null) de "falló" (error≠null). */
export async function getEntityStateChecked<T = unknown>(
    ref: EntityRef,
    key: string,
): Promise<EntityStateResult<T>> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("entity_state")
            .select("value, rev, updated_at, device_id")
            .eq("owner_kind", ref.kind)
            .eq("owner_id", ref.id)
            .eq("key", key)
            .maybeSingle();
        if (error) return { row: null, error: error.message || "No se pudo leer de la nube." };
        return { row: (data as EntityStateRow<T> | null) ?? null, error: null };
    } catch (e) {
        return { row: null, error: (e as Error)?.message || "Error de red al leer de la nube." };
    }
}

/** Escribe (upsert) el estado de una sección devolviendo el error real si lo hubo. */
export async function setEntityStateChecked<T = unknown>(
    ref: EntityRef,
    key: string,
    value: T,
): Promise<EntityStateResult<T>> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("entity_state")
            .upsert(
                {
                    owner_kind: ref.kind,
                    owner_id: ref.id,
                    key,
                    value: value as object,
                    device_id: deviceId(),
                },
                { onConflict: "owner_kind,owner_id,key" },
            )
            .select("value, rev, updated_at, device_id")
            .maybeSingle();
        if (error) return { row: null, error: error.message || "No se pudo guardar en la nube." };
        if (!data) {
            return {
                row: null,
                error: "La nube aceptó la escritura pero no devolvió la fila (¿sin permiso de lectura sobre este ámbito?).",
            };
        }
        return { row: data as EntityStateRow<T>, error: null };
    } catch (e) {
        return { row: null, error: (e as Error)?.message || "Error de red al guardar en la nube." };
    }
}

/** Lee el estado de una sección de una entidad. null si no existe o sin sesión. */
export async function getEntityState<T = unknown>(
    ref: EntityRef,
    key: string,
): Promise<EntityStateRow<T> | null> {
    return (await getEntityStateChecked<T>(ref, key)).row;
}

/** Escribe (upsert) el estado de una sección. Devuelve la fila resultante o null. */
export async function setEntityState<T = unknown>(
    ref: EntityRef,
    key: string,
    value: T,
): Promise<EntityStateRow<T> | null> {
    return (await setEntityStateChecked<T>(ref, key, value)).row;
}

export interface EntityStateChange<T = unknown> extends EntityStateRow<T> {
    key: string;
    ownerKind: EntityKind;
    ownerId: string;
    /** true si el cambio lo originó este mismo dispositivo (normalmente ignorar) */
    self: boolean;
}

/**
 * Suscripción en tiempo real a los cambios de una entidad (todas sus claves o una).
 * Devuelve función de limpieza. Nunca lanza; sin sesión devuelve noop.
 */
export function subscribeEntityState<T = unknown>(
    ref: EntityRef,
    key: string | null,
    cb: (change: EntityStateChange<T>) => void,
): () => void {
    try {
        const supabase = createClient();
        const channelName = `es:${ref.kind}:${ref.id}`;
        const channel = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "entity_state",
                    filter: `owner_id=eq.${ref.id}`,
                },
                (payload: { new?: Record<string, unknown> }) => {
                    const row = payload.new;
                    if (!row) return;
                    if (row.owner_kind !== ref.kind) return;
                    if (key && row.key !== key) return;
                    cb({
                        key: String(row.key),
                        ownerKind: row.owner_kind as EntityKind,
                        ownerId: String(row.owner_id),
                        value: row.value as T,
                        rev: Number(row.rev ?? 0),
                        updated_at: String(row.updated_at ?? ""),
                        device_id: (row.device_id as string) ?? null,
                        self: row.device_id === deviceId(),
                    });
                },
            )
            .subscribe();
        return () => {
            try {
                supabase.removeChannel(channel);
            } catch {
                /* noop */
            }
        };
    } catch {
        return () => {};
    }
}
