"use client";

// src/lib/events/events-store.ts
// -----------------------------------------------------------------------------
// Capa de datos de EVENTOS sobre Supabase (tabla pública `events`, realtime).
//
// Tabla:
//   events(id, owner, title, description, starts_at, ends_at, location, kind,
//          visibility, meta jsonb, created_at)
//   RLS: owner OR visibility='public' pueden LEER; sólo el owner ESCRIBE.
//
// Diseño (igual que el resto de capas de datos del SOSD — ver post-entity.ts):
//   • SSR-safe: en el servidor (sin `window`) las operaciones degradan a no-op.
//   • Nunca lanza: las lecturas devuelven [] y las escrituras `null`/`false`
//     ante cualquier error (sin sesión, sin red, RLS, tabla ausente…).
//   • `toCalendarEvent(row)` mapea una fila cruda de `events` a la forma
//     `CalendarItem` que el Sincrómetro/Calendario ya sabe renderizar, de modo
//     que los eventos reales se mezclan con la semilla local sin cambios en la
//     UI.
//
// El almacenamiento canónico del calendario usa `date` (YYYY-MM-DD) + `time`
// (HH:MM); aquí derivamos ambos desde el `starts_at` (timestamptz) de la fila.
// -----------------------------------------------------------------------------

import { createClient } from "@/utils/supabase/client";
import type {
    CalendarItem,
    CalendarLayer,
    CalendarVisibility,
} from "@/contexts/calendar-context";

// ----------------------------- Tipos ----------------------------------------

/** Forma cruda de una fila de `events` (todos los campos defensivos). */
export interface EventRow {
    id: string;
    owner?: string | null;
    title?: string | null;
    description?: string | null;
    /** timestamptz ISO de comienzo. */
    starts_at?: string | null;
    /** timestamptz ISO de fin (opcional). */
    ends_at?: string | null;
    location?: string | null;
    /** Categoría libre del evento (mapeada a `layer` del calendario). */
    kind?: string | null;
    /** 'public' | 'private' (estándar Supabase RLS). */
    visibility?: string | null;
    /** jsonb con extras opcionales: attendees, capacity, color, urgent, durationMin, tags… */
    meta?: Record<string, any> | null;
    created_at?: string | null;
}

/** Datos para crear un evento (la propiedad `owner` se rellena automáticamente). */
export interface CreateEventInput {
    title: string;
    description?: string;
    /** ISO (timestamptz) o `Date`. */
    startsAt: string | Date;
    /** ISO (timestamptz) o `Date`. Opcional. */
    endsAt?: string | Date | null;
    location?: string;
    kind?: string;
    visibility?: "public" | "private";
    /** Extras opcionales que viajan en `meta` jsonb. */
    meta?: Record<string, any>;
}

/** Parche para actualizar un evento (mismos campos, todos opcionales). */
export interface UpdateEventPatch {
    title?: string;
    description?: string | null;
    startsAt?: string | Date;
    endsAt?: string | Date | null;
    location?: string | null;
    kind?: string;
    visibility?: "public" | "private";
    meta?: Record<string, any> | null;
}

// ----------------------------- Helpers --------------------------------------

const TABLE = "events";

/** id del usuario actual (o null si no hay sesión). SSR-safe, nunca lanza. */
export async function currentUserId(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/** Normaliza una entrada de fecha (ISO string | Date) a ISO string. */
function toISO(input: string | Date | null | undefined): string | null {
    if (!input) return null;
    try {
        if (input instanceof Date) return input.toISOString();
        // Si ya es una cadena, intentamos parsear para validar; si falla, la
        // devolvemos tal cual (el backend la rechazaría, no nosotros).
        const d = new Date(input);
        return Number.isNaN(d.getTime()) ? String(input) : d.toISOString();
    } catch {
        return typeof input === "string" ? input : null;
    }
}

/** Mapea el `visibility` de Supabase ('public'/'private') a `CalendarVisibility`. */
function mapVisibility(v: string | null | undefined): CalendarVisibility {
    const s = (v ?? "").toLowerCase();
    if (s === "public" || s === "publico" || s === "público") return "publico";
    if (s === "red" || s === "network") return "red";
    return "privado";
}

/** Mapea el `visibility` del calendario a la forma de Supabase ('public'/'private'). */
function toDbVisibility(v: "public" | "private" | undefined): string {
    return v === "public" ? "public" : "private";
}

/**
 * Mapea el `kind` textual de un evento → capa estructurada del calendario.
 * Acepta tanto valores ya-canónicos (una `CalendarLayer`) como etiquetas libres
 * ("Político", "Cultural", "evento"…). Replica la heurística de
 * calendar-context para que los eventos reales se coloreen igual que la semilla.
 */
function kindToLayer(kind: string | null | undefined): CalendarLayer {
    const t = (kind ?? "").toLowerCase().trim();
    // Si ya es una capa canónica, respétala.
    const canonical: CalendarLayer[] = [
        "politica",
        "cultura",
        "educacion",
        "bienestar",
        "personal",
        "recordatorios",
        "alarmas",
        "sistema",
        "externa",
    ];
    if ((canonical as string[]).includes(t)) return t as CalendarLayer;

    if (t.includes("polít") || t.includes("politic")) return "politica";
    if (t.includes("cultur") || t.includes("arte")) return "cultura";
    if (
        t.includes("educ") ||
        t.includes("hackathon") ||
        t.includes("clase") ||
        t.includes("taller")
    )
        return "educacion";
    if (t.includes("bien") || t.includes("medit") || t.includes("salud")) return "bienestar";
    if (t.includes("record")) return "recordatorios";
    if (t.includes("alarm")) return "alarmas";
    if (t.includes("sist") || t.includes("system") || t.includes("log")) return "sistema";
    if (t.includes("extern")) return "externa";
    return "personal";
}

/** Extrae 'YYYY-MM-DD' (local) de un ISO de timestamptz. */
function isoToLocalDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        // Fallback: si trae el patrón YYYY-MM-DD al inicio, úsalo crudo.
        return iso.slice(0, 10);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Extrae 'HH:MM' (local) de un ISO de timestamptz. */
function isoToLocalTime(iso: string): string | undefined {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

/** Duración (minutos) entre dos ISO, si ambos existen y son válidos. */
function durationMinutes(startIso: string, endIso: string | null | undefined): number | undefined {
    if (!endIso) return undefined;
    const a = new Date(startIso).getTime();
    const b = new Date(endIso).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return undefined;
    return Math.round((b - a) / 60000);
}

/**
 * Mapea una fila cruda de `events` a la forma `CalendarItem` del Sincrómetro.
 * Es el inverso conceptual de cómo `calendar-context` siembra `communityEvents`.
 */
export function toCalendarEvent(row: EventRow): CalendarItem {
    const meta = row.meta ?? {};
    const startsAt = row.starts_at ?? "";
    const date = startsAt ? isoToLocalDate(startsAt) : new Date().toISOString().slice(0, 10);
    const time = startsAt ? isoToLocalTime(startsAt) : undefined;
    const endDate = row.ends_at ? isoToLocalDate(row.ends_at) : undefined;

    const durationMin =
        typeof meta.durationMin === "number"
            ? meta.durationMin
            : durationMinutes(startsAt, row.ends_at);

    const item: CalendarItem = {
        id: row.id,
        title: row.title ?? "Evento",
        description: row.description ?? undefined,
        date,
        // Sólo adjuntamos endDate si es un día distinto (evento multi-día).
        endDate: endDate && endDate !== date ? endDate : undefined,
        time,
        durationMin,
        layer: kindToLayer(row.kind),
        visibility: mapVisibility(row.visibility),
        location: row.location ?? undefined,
        attendees: typeof meta.attendees === "number" ? meta.attendees : undefined,
        capacity: typeof meta.capacity === "number" ? meta.capacity : undefined,
        urgent: typeof meta.urgent === "boolean" ? meta.urgent : undefined,
        color: typeof meta.color === "string" ? meta.color : undefined,
        tags: Array.isArray(meta.tags) ? meta.tags.filter((t: any) => typeof t === "string") : undefined,
        recurrence: "none",
        sourceRef: row.id,
        createdAt: row.created_at ?? undefined,
        aiHighlight: typeof meta.aiHighlight === "boolean" ? meta.aiHighlight : undefined,
    };
    return item;
}

// ----------------------------- Lectura --------------------------------------

/**
 * Lista los eventos visibles para el usuario: los suyos (owner) + los públicos.
 * RLS ya restringe esto en servidor; el filtro `.or(...)` es una optimización
 * explícita coherente con la política. Devuelve [] ante cualquier fallo.
 */
export async function listEvents(): Promise<CalendarItem[]> {
    if (typeof window === "undefined") return [];
    try {
        const supabase = createClient();
        const uid = await currentUserId();

        let query = supabase.from(TABLE).select("*");

        // owner OR visibility='public'. Si no hay sesión, sólo públicos.
        if (uid) {
            query = query.or(`owner.eq.${uid},visibility.eq.public`);
        } else {
            query = query.eq("visibility", "public");
        }

        const { data, error } = await query.order("starts_at", { ascending: true });
        if (error || !Array.isArray(data)) return [];

        return data.map((row) => toCalendarEvent(row as EventRow));
    } catch {
        return [];
    }
}

// ----------------------------- Escritura ------------------------------------

/**
 * Crea un evento propiedad del usuario actual. Devuelve el `CalendarItem`
 * resultante (ya mapeado) o `null` si no hay sesión / falla la escritura.
 */
export async function createEvent(input: CreateEventInput): Promise<CalendarItem | null> {
    if (typeof window === "undefined") return null;
    try {
        const supabase = createClient();
        const owner = await currentUserId();
        if (!owner) return null; // sin sesión no se puede persistir (RLS lo exige).

        const startsAt = toISO(input.startsAt);
        if (!startsAt) return null;

        const payload = {
            owner,
            title: input.title,
            description: input.description ?? null,
            starts_at: startsAt,
            ends_at: toISO(input.endsAt ?? null),
            location: input.location ?? null,
            kind: input.kind ?? "evento",
            visibility: toDbVisibility(input.visibility),
            meta: input.meta ?? {},
        };

        const { data, error } = await supabase
            .from(TABLE)
            .insert(payload)
            .select("*")
            .maybeSingle();

        if (error || !data) return null;
        return toCalendarEvent(data as EventRow);
    } catch {
        return null;
    }
}

/**
 * Actualiza un evento por id (sólo surte efecto si el usuario es el owner por
 * RLS). Devuelve el `CalendarItem` actualizado o `null` ante fallo.
 */
export async function updateEvent(
    id: string,
    patch: UpdateEventPatch,
): Promise<CalendarItem | null> {
    if (typeof window === "undefined" || !id) return null;
    try {
        const supabase = createClient();

        const update: Record<string, any> = {};
        if (patch.title !== undefined) update.title = patch.title;
        if (patch.description !== undefined) update.description = patch.description;
        if (patch.startsAt !== undefined) update.starts_at = toISO(patch.startsAt);
        if (patch.endsAt !== undefined) update.ends_at = toISO(patch.endsAt ?? null);
        if (patch.location !== undefined) update.location = patch.location;
        if (patch.kind !== undefined) update.kind = patch.kind;
        if (patch.visibility !== undefined) update.visibility = toDbVisibility(patch.visibility);
        if (patch.meta !== undefined) update.meta = patch.meta;

        if (Object.keys(update).length === 0) return null;

        const { data, error } = await supabase
            .from(TABLE)
            .update(update)
            .eq("id", id)
            .select("*")
            .maybeSingle();

        if (error || !data) return null;
        return toCalendarEvent(data as EventRow);
    } catch {
        return null;
    }
}

/**
 * Elimina un evento por id (sólo el owner por RLS). Devuelve `true` si la
 * operación no produjo error; `false` ante cualquier fallo.
 */
export async function deleteEvent(id: string): Promise<boolean> {
    if (typeof window === "undefined" || !id) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase.from(TABLE).delete().eq("id", id);
        return !error;
    } catch {
        return false;
    }
}
