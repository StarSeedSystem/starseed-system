// src/data/sample-events.ts
// ─────────────────────────────────────────────────────────────────────────────
// Dataset de EJEMPLO de EVENTOS y COMUNIDADES de la Red StarSeed, interconectado
// con `sample-entities.ts` (cada evento referencia a una página/comunidad
// organizadora por su slug, de modo que el enlace funcione de verdad).
//
// Imágenes libres (mismas fuentes que sample-entities): Picsum + DiceBear.
// Fechas FUTURAS deterministas relativas a "ahora" para que la demo no caduque.
// ─────────────────────────────────────────────────────────────────────────────

import {
    type SystemKey,
    SYSTEM_ACCENT,
    picsumCover,
    diceBearAvatar,
    samplePages,
} from "@/data/sample-entities";
import { pageSlug } from "@/lib/entity-links";

export interface SampleEvent {
    id: string;
    slug: string;
    system: SystemKey;
    kind:
        | "asamblea"
        | "curso"
        | "taller"
        | "exposicion"
        | "concierto"
        | "encuentro"
        | "ritual"
        | "obra"
        | "mercado";
    title: string;
    cover: string;
    description: string;
    /** ISO con fecha/hora futura. Se formatea con Intl en la vista. */
    startsAt: string;
    endsAt?: string;
    location: string;
    online: boolean;
    /** Nombre del organizador + slug de la página/comunidad que organiza. */
    organizer: string;
    organizerAvatar: string;
    /** Slug de la página organizadora (debe existir en samplePages). */
    organizerPageSlug: string;
    attendees: number;
    accent: string;
    tags: string[];
}

const NOW = Date.now();
const DAY = 86_400_000;
/** Fecha futura determinista a `days` días + `hour`:00 local-ish (ISO). */
function futureAt(days: number, hour = 18): string {
    const d = new Date(NOW + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

// Helper: slug de una página de `samplePages` por id (para enlazar al organizador).
function pageSlugById(id: string): string {
    const p = samplePages.find((x) => x.id === id);
    return p ? pageSlug(p) : "";
}

export const sampleEvents: SampleEvent[] = [];

// ── Selectores ──
export function eventsBySystem(s: SystemKey): SampleEvent[] {
    return sampleEvents.filter((e) => e.system === s);
}
export function findEvent(key: string): SampleEvent | undefined {
    return sampleEvents.find((e) => e.slug === key || e.id === key);
}
/** Eventos organizados por una página dada (por su slug). */
export function eventsByOrganizerSlug(slug: string): SampleEvent[] {
    return sampleEvents.filter((e) => e.organizerPageSlug === slug);
}
