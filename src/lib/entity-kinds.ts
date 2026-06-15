// src/lib/entity-kinds.ts
// ─────────────────────────────────────────────────────────────────────────────
// Registro canónico de los TIPOS de página/entidad de StarSeed OS. Unifica los
// distintos vocabularios que usan las rutas (profile pageType, os_* kind, widgets)
// en un único conjunto de claves canónicas, cada una con su metadato visual
// (icono, acento, sistema cromático) y el toolkit funcional que le corresponde.
//
// Lo consumen: el dispatcher GovernanceToolkit, las páginas de detalle
// (profile / pagina / grupo / evento / partido / entidad) y los widgets del hub.
// ─────────────────────────────────────────────────────────────────────────────

import {
    User,
    Sprout,
    Landmark,
    Flag,
    Users2,
    Vote,
    CalendarDays,
    FileText,
    Hammer,
    type LucideIcon,
} from "lucide-react";

export type EntityKind =
    | "personal"
    | "comunidad"
    | "ef"
    | "partido"
    | "asamblea"
    | "grupo"
    | "evento"
    | "pagina"
    | "proyecto";

export type SystemKey = "politico" | "cultural" | "educativo" | "social";

export interface EntityKindMeta {
    key: EntityKind;
    /** Etiqueta singular legible (badge / títulos). */
    label: string;
    /** Plural para listados. */
    plural: string;
    /** Icono Lucide representativo. */
    icon: LucideIcon;
    /** Color de acento por defecto si la entidad no define el suyo. */
    accent: string;
    /** Sistema cromático/funcional StarSeed al que pertenece. */
    system: SystemKey;
    /** Frase breve descriptiva del tipo. */
    blurb: string;
    /** Clave del toolkit funcional a renderizar. */
    toolkit:
        | "partido"
        | "ef"
        | "asamblea"
        | "comunidad"
        | "grupo"
        | "evento"
        | "none";
    /** Etiqueta de la pestaña que abre el toolkit en la página de detalle. */
    toolkitTab: string;
}

export const ENTITY_KINDS: Record<EntityKind, EntityKindMeta> = {
    personal: {
        key: "personal",
        label: "Perfil",
        plural: "Perfiles",
        icon: User,
        accent: "#9b8cff",
        system: "social",
        blurb: "Faceta pública de una cuenta soberana.",
        toolkit: "none",
        toolkitTab: "Espacio",
    },
    comunidad: {
        key: "comunidad",
        label: "Comunidad",
        plural: "Comunidades",
        icon: Sprout,
        accent: "#10B981",
        system: "cultural",
        blurb: "Sangha digital: proyectos, procomún y cultura compartida.",
        toolkit: "comunidad",
        toolkitTab: "Comunidad",
    },
    ef: {
        key: "ef",
        label: "Entidad Federativa",
        plural: "Entidades Federativas",
        icon: Landmark,
        accent: "#007FFF",
        system: "politico",
        blurb: "Unidad de gobernanza ontocrática: legislativo, ejecutivo y judicial.",
        toolkit: "ef",
        toolkitTab: "Gobernanza",
    },
    partido: {
        key: "partido",
        label: "Partido Político",
        plural: "Partidos",
        icon: Flag,
        accent: "#DC143C",
        system: "politico",
        blurb: "Coalición ideológica: programa, militancia y candidaturas.",
        toolkit: "partido",
        toolkitTab: "Partido",
    },
    asamblea: {
        key: "asamblea",
        label: "Asamblea",
        plural: "Asambleas",
        icon: Vote,
        accent: "#FFBF00",
        system: "politico",
        blurb: "Órgano deliberativo: orden del día, debate y actas.",
        toolkit: "asamblea",
        toolkitTab: "Asamblea",
    },
    grupo: {
        key: "grupo",
        label: "Grupo",
        plural: "Grupos",
        icon: Users2,
        accent: "#22d3ee",
        system: "educativo",
        blurb: "Círculo de estudio o colectivo de trabajo.",
        toolkit: "grupo",
        toolkitTab: "Grupo",
    },
    evento: {
        key: "evento",
        label: "Evento",
        plural: "Eventos",
        icon: CalendarDays,
        accent: "#c084fc",
        system: "cultural",
        blurb: "Encuentro coordinado físico o en el Multiverso.",
        toolkit: "evento",
        toolkitTab: "Evento",
    },
    pagina: {
        key: "pagina",
        label: "Página",
        plural: "Páginas",
        icon: FileText,
        accent: "#E9C46A",
        system: "social",
        blurb: "Entidad de contenido del Lienzo Universal.",
        toolkit: "none",
        toolkitTab: "Herramientas",
    },
    proyecto: {
        key: "proyecto",
        label: "Proyecto",
        plural: "Proyectos",
        icon: Hammer,
        accent: "#f59e0b",
        system: "educativo",
        blurb: "Iniciativa con objetivos, tareas y contribuciones.",
        toolkit: "grupo",
        toolkitTab: "Proyecto",
    },
};

/**
 * Normaliza cualquier etiqueta de tipo (pageType de profile, kind de os_*,
 * texto de widget, español libre) a una EntityKind canónica.
 */
export function normalizeEntityKind(input: string | null | undefined): EntityKind {
    const k = (input ?? "").toString().trim().toLowerCase();
    if (!k) return "pagina";
    // Coincidencias directas
    if (k in ENTITY_KINDS) return k as EntityKind;
    // Sinónimos / variantes
    const map: Record<string, EntityKind> = {
        perfil: "personal",
        persona: "personal",
        usuario: "personal",
        "entidad federativa": "ef",
        "entidad-federativa": "ef",
        federativa: "ef",
        "e.f.": "ef",
        "e.f": "ef",
        sangha: "comunidad",
        community: "comunidad",
        comunidades: "comunidad",
        "partido político": "partido",
        "partido politico": "partido",
        partidos: "partido",
        coalicion: "partido",
        "coalición": "partido",
        circulo: "grupo",
        "círculo": "grupo",
        colectivo: "grupo",
        estudio: "grupo",
        consejo: "asamblea",
        asambleas: "asamblea",
        encuentro: "evento",
        eventos: "evento",
        festival: "evento",
        biorregion: "comunidad",
        "biorregión": "comunidad",
        obra: "pagina",
        ley: "ef",
        curso: "grupo",
    };
    if (map[k]) return map[k];
    // Heurística por subcadena
    if (k.includes("federativ") || k.includes("e.f")) return "ef";
    if (k.includes("partido") || k.includes("coalici")) return "partido";
    if (k.includes("asamble") || k.includes("consejo")) return "asamblea";
    if (k.includes("comunidad") || k.includes("sangha")) return "comunidad";
    if (k.includes("evento") || k.includes("festival") || k.includes("encuentro")) return "evento";
    if (k.includes("grupo") || k.includes("estudio") || k.includes("circulo")) return "grupo";
    if (k.includes("proyecto")) return "proyecto";
    return "pagina";
}

export function entityKindMeta(input: string | null | undefined): EntityKindMeta {
    return ENTITY_KINDS[normalizeEntityKind(input)];
}
