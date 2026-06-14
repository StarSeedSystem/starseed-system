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

export const sampleEvents: SampleEvent[] = [
    // ── Político ──
    {
        id: "evt-pol-1",
        slug: "asamblea-energia-procomun",
        system: "politico",
        kind: "asamblea",
        title: "Asamblea abierta: votación de la Ley de Energía Procomún",
        cover: picsumCover("evt-asamblea-energia", 1000, 500),
        description:
            "Sesión de soberanía directa para deliberar y abrir la votación líquida de la Ley de Energía Procomún 2026. Puedes participar en persona o delegar tu voto de forma revocable. Una persona, una voz.",
        startsAt: futureAt(5, 18),
        endsAt: futureAt(5, 21),
        location: "Centro Social Oikos Norte · Sala Magna",
        online: false,
        organizer: "Asamblea Local Oikos Norte",
        organizerAvatar: diceBearAvatar("Oikos Norte", "shapes"),
        organizerPageSlug: pageSlugById("page-pol-1"),
        attendees: 1240,
        accent: SYSTEM_ACCENT.politico,
        tags: ["Asamblea", "Energía", "Votación líquida"],
    },
    {
        id: "evt-pol-2",
        slug: "circulo-de-paz-mediacion",
        system: "politico",
        kind: "encuentro",
        title: "Círculo de Paz: taller de mediación restaurativa",
        cover: picsumCover("evt-circulo-paz", 1000, 500),
        description:
            "Encuentro práctico para aprender a facilitar Círculos de Paz en tu comunidad, según la Invariante de justicia restaurativa. Sin sanciones punitivas: reparación y reconciliación.",
        startsAt: futureAt(12, 17),
        endsAt: futureAt(12, 20),
        location: "En línea · Sala del Multiverso",
        online: true,
        organizer: "Mesa de Justicia Restaurativa",
        organizerAvatar: diceBearAvatar("Justicia Restaurativa", "shapes"),
        organizerPageSlug: pageSlugById("page-pol-2"),
        attendees: 318,
        accent: SYSTEM_ACCENT.politico,
        tags: ["Mediación", "Círculos de Paz"],
    },

    // ── Educativo ──
    {
        id: "evt-edu-1",
        slug: "clase-magistral-cosmologia",
        system: "educativo",
        kind: "curso",
        title: "Clase magistral en vivo: el origen del cosmos",
        cover: picsumCover("evt-cosmologia", 1000, 500),
        description:
            "Primera sesión sincrónica del curso Cosmología para Sembradores con la Dra. Amara Sen. Mentoría híbrida humano + IA y espacio de preguntas con tu Exocórtex.",
        startsAt: futureAt(3, 19),
        endsAt: futureAt(3, 21),
        location: "En línea · Biblioteca Inmersiva",
        online: true,
        organizer: "Cosmología para Sembradores",
        organizerAvatar: diceBearAvatar("Amara Sen", "lorelei"),
        organizerPageSlug: pageSlugById("page-edu-1"),
        attendees: 4210,
        accent: SYSTEM_ACCENT.educativo,
        tags: ["Astrofísica", "Curso", "En vivo"],
    },
    {
        id: "evt-edu-2",
        slug: "taller-pensamiento-sistemico",
        system: "educativo",
        kind: "taller",
        title: "Taller práctico: pensamiento sistémico y redes complejas",
        cover: picsumCover("evt-sistemas", 1000, 500),
        description:
            "Taller del Círculo de Estudio de Sistemas Complejos. Modelaremos redes, retroalimentación y emergencia con datasets abiertos reproducibles. Trae tu portátil.",
        startsAt: futureAt(9, 17),
        endsAt: futureAt(9, 20),
        location: "Nodo Sur · Aula de Datos Abiertos",
        online: false,
        organizer: "Biblioteca Universal — Nodo Sur",
        organizerAvatar: diceBearAvatar("Sistemas Complejos", "shapes"),
        organizerPageSlug: pageSlugById("page-edu-2"),
        attendees: 540,
        accent: SYSTEM_ACCENT.educativo,
        tags: ["Sistemas", "Taller", "Datos abiertos"],
    },

    // ── Cultural ──
    {
        id: "evt-cul-1",
        slug: "inauguracion-aurora-sintetica",
        system: "cultural",
        kind: "exposicion",
        title: "Inauguración: Aurora Sintética en el Multiverso",
        cover: picsumCover("evt-aurora", 1000, 500),
        description:
            "Apertura de la muestra colectiva de arte generativo, navegable en realidad virtual y remezclable bajo el Lienzo Universal. Recorrido guiado por Nova Reyes y el Colectivo Génesis.",
        startsAt: futureAt(7, 20),
        endsAt: futureAt(7, 23),
        location: "Galería del Multiverso · Ala Horizon",
        online: true,
        organizer: "Exposición: Aurora Sintética",
        organizerAvatar: diceBearAvatar("Nova Reyes", "lorelei"),
        organizerPageSlug: pageSlugById("page-cul-1"),
        attendees: 3120,
        accent: SYSTEM_ACCENT.cultural,
        tags: ["Multiverso", "Generativo", "VR"],
    },
    {
        id: "evt-cul-2",
        slug: "concierto-constelacion-sonora",
        system: "cultural",
        kind: "concierto",
        title: "Concierto colaborativo: Constelación Sonora en directo",
        cover: picsumCover("evt-constelacion", 1000, 500),
        description:
            "Jam generativa en directo donde el público añade capas a la obra viva Constelación Sonora. La composición evoluciona en todas sus instancias a la vez. Música como puente empático.",
        startsAt: futureAt(15, 21),
        endsAt: futureAt(15, 23),
        location: "Sangha Norte · Domo Sonoro + En línea",
        online: true,
        organizer: "Obra Viva: Constelación Sonora",
        organizerAvatar: diceBearAvatar("Iris Bloom", "lorelei"),
        organizerPageSlug: pageSlugById("page-cul-2"),
        attendees: 980,
        accent: SYSTEM_ACCENT.cultural,
        tags: ["Sonido", "Directo", "Colaborativo"],
    },

    // ── Eventos canónicos del "Radar Social" del Dashboard ──
    // Slugs alineados con slugify() del nombre que muestra el widget, para que
    // cada fila del radar enlace a una página de evento real.
    {
        id: "evt-radar-asamblea-vecinal",
        slug: "asamblea-vecinal",
        system: "politico",
        kind: "asamblea",
        title: "Asamblea Vecinal",
        cover: picsumCover("evt-asamblea-vecinal", 1000, 500),
        description:
            "Asamblea abierta de soberanía directa en el Parque Central. Presupuesto participativo, gestión de recursos comunes y votación líquida de las iniciativas del barrio. Una persona, una voz.",
        startsAt: futureAt(2, 18),
        endsAt: futureAt(2, 20),
        location: "Parque Central · Ágora al aire libre",
        online: false,
        organizer: "Sangha Norte",
        organizerAvatar: diceBearAvatar("Sangha Norte", "shapes"),
        organizerPageSlug: pageSlugById("page-com-sangha-norte"),
        attendees: 860,
        accent: SYSTEM_ACCENT.politico,
        tags: ["Asamblea", "Vecinal", "Votación líquida"],
    },
    {
        id: "evt-radar-taller-permacultura",
        slug: "taller-de-permacultura",
        system: "educativo",
        kind: "taller",
        title: "Taller de Permacultura",
        cover: picsumCover("evt-permacultura", 1000, 500),
        description:
            "Taller práctico de diseño regenerativo en el Vivero Comunal: suelos vivos, captación de agua y policultivos. Aprende a cerrar ciclos materiales hacia la soberanía alimentaria.",
        startsAt: futureAt(4, 17),
        endsAt: futureAt(4, 20),
        location: "Vivero Comunal · Sangha del Faro",
        online: false,
        organizer: "Sangha del Faro",
        organizerAvatar: diceBearAvatar("Sangha del Faro", "shapes"),
        organizerPageSlug: pageSlugById("page-com-sangha-faro"),
        attendees: 320,
        accent: SYSTEM_ACCENT.educativo,
        tags: ["Permacultura", "Taller", "Regenerativo"],
    },
    {
        id: "evt-radar-ritual-equinoccio",
        slug: "ritual-del-equinoccio",
        system: "cultural",
        kind: "ritual",
        title: "Ritual del Equinoccio",
        cover: picsumCover("evt-equinoccio", 1000, 500),
        description:
            "Encuentro ceremonial en el Domo Liminal para celebrar el equinoccio. Sonido envolvente, visuales generativos y prácticas de conexión empática para disolver las barreras del ego.",
        startsAt: futureAt(6, 20),
        endsAt: futureAt(6, 23),
        location: "Domo Liminal · Multiverso + presencial",
        online: true,
        organizer: "Multiverso Liminal",
        organizerAvatar: diceBearAvatar("Multiverso Liminal", "shapes"),
        organizerPageSlug: pageSlugById("page-com-multiverso-liminal"),
        attendees: 1480,
        accent: SYSTEM_ACCENT.cultural,
        tags: ["Ritual", "Equinoccio", "Ceremonia"],
    },
    {
        id: "evt-radar-estreno-mareas-datos",
        slug: "estreno-mareas-de-datos",
        system: "cultural",
        kind: "obra",
        title: "Estreno: Mareas de Datos",
        cover: picsumCover("evt-mareas-datos", 1000, 500),
        description:
            "Estreno de la obra audiovisual generativa Mareas de Datos en el Multiverso. Una experiencia navegable en realidad virtual, remezclable bajo el Lienzo Universal.",
        startsAt: futureAt(8, 21),
        endsAt: futureAt(8, 23),
        location: "Multiverso · Galería del Multiverso",
        online: true,
        organizer: "Colectivo Aurora",
        organizerAvatar: diceBearAvatar("Colectivo Aurora", "shapes"),
        organizerPageSlug: pageSlugById("page-cul-1"),
        attendees: 2240,
        accent: SYSTEM_ACCENT.cultural,
        tags: ["Estreno", "Generativo", "VR"],
    },
    {
        id: "evt-radar-mercado-trueque",
        slug: "mercado-de-trueque",
        system: "politico",
        kind: "mercado",
        title: "Mercado de Trueque",
        cover: picsumCover("evt-mercado-trueque", 1000, 500),
        description:
            "Mercado de don y trueque en la Plaza Oikos: bienes, saberes y tiempo sin mediación monetaria. Economía de abundancia en acción dentro de la Fase Semilla.",
        startsAt: futureAt(10, 11),
        endsAt: futureAt(10, 16),
        location: "Plaza Oikos · Junta Oikos",
        online: false,
        organizer: "Junta Oikos",
        organizerAvatar: diceBearAvatar("Junta Oikos", "shapes"),
        organizerPageSlug: pageSlugById("page-pol-1"),
        attendees: 640,
        accent: SYSTEM_ACCENT.politico,
        tags: ["Trueque", "Don", "Abundancia"],
    },
];

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
