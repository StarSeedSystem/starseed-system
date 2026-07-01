"use client";

// ═══════════════════════════════════════════════════════════════════════════
// os-events-calendar.ts — Adaptador READ-ONLY de `os_events` → CalendarItem
// ---------------------------------------------------------------------------
// El SOSD tiene dos superficies de eventos:
//   · `events`     → capa del Sincrómetro (events-store.ts) — ya integrada.
//   · `os_events`  → capa social (os-social.ts, /evento/[slug], mapa, editor).
//
// Este módulo lee (solo lectura) los `os_events` REALES y los expone como
// `CalendarItem` para que el calendario muestre también los eventos sociales,
// sin duplicar lógica de escritura (la escritura vive en os-social.ts).
//
// Filosofía: SSR-safe, nunca lanza, [] ante cualquier fallo. No inventa datos:
// si `fetchEvents` cae al ejemplo (isSample) NO se incluye — el calendario solo
// muestra eventos reales por esta vía (los de ejemplo ya viven en la semilla).
// ═══════════════════════════════════════════════════════════════════════════

import { fetchEvents, type OsEvent } from "@/lib/os-social";
import type { CalendarItem, CalendarLayer } from "@/contexts/calendar-context";

/** 'YYYY-MM-DD' (local) desde un ISO. Defensivo. */
function isoToLocalDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** 'HH:MM' (local) desde un ISO. */
function isoToLocalTime(iso: string): string | undefined {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

/** Mapea el `kind` textual de un os_event → capa del calendario. */
function kindToLayer(kind: string | null | undefined): CalendarLayer {
    const t = (kind ?? "").toLowerCase().trim();
    if (t.includes("asamble") || t.includes("polít") || t.includes("politic")) return "politica";
    if (t.includes("cultur") || t.includes("arte") || t.includes("celebra") || t.includes("exposic"))
        return "cultura";
    if (t.includes("taller") || t.includes("educ") || t.includes("clase") || t.includes("curso"))
        return "educacion";
    if (t.includes("bien") || t.includes("medit") || t.includes("salud")) return "bienestar";
    return "cultura"; // por defecto los encuentros sociales caen en cultura.
}

/** Convierte un `OsEvent` real (con fecha) a `CalendarItem`. */
function osEventToCalendarItem(ev: OsEvent): CalendarItem | null {
    if (!ev.startsAt) return null; // sin fecha no se puede ubicar en el calendario.
    const date = isoToLocalDate(ev.startsAt);
    const time = isoToLocalTime(ev.startsAt);
    return {
        id: `os-ev-${ev.id}`,
        title: ev.title,
        description: ev.description || undefined,
        date,
        time,
        layer: kindToLayer(ev.kind),
        visibility: "publico",
        location: ev.placeLabel || ev.location || undefined,
        attendees: ev.attendeeCount || undefined,
        tags: Array.isArray(ev.tags) ? ev.tags : undefined,
        recurrence: "none",
        sourceRef: `os_event:${ev.slug}`,
    };
}

/**
 * Lista los `os_events` REALES como `CalendarItem`. Excluye los de ejemplo
 * (isSample) y los que no tienen fecha. Devuelve [] ante cualquier fallo.
 */
export async function listOsEventsForCalendar(): Promise<CalendarItem[]> {
    if (typeof window === "undefined") return [];
    try {
        const events = await fetchEvents(); // real de Supabase (lanza → catch abajo)
        const items: CalendarItem[] = [];
        for (const ev of events) {
            if (ev.isSample) continue; // no fake data: los de ejemplo ya están en la semilla.
            const item = osEventToCalendarItem(ev);
            if (item) items.push(item);
        }
        return items;
    } catch {
        return [];
    }
}
