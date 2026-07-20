"use client";

/**
 * ── hub-social/meta — Metadatos cromáticos compartidos del Hub social ────────
 *
 * Fuente ÚNICA de los 4 sistemas cromáticos y los tipos de conexión para TODOS
 * los paneles sociales del Hub (insignias, diversidad, delegaciones, presencia,
 * historias, sinapsis). Los colores replican EXACTAMENTE los ya usados en
 * `connections-hub.tsx` para que la identidad visual sea consistente (Crystal
 * Liquid Glass). Iconos Lucide (nunca emojis). Sin dependencias nuevas.
 */

import {
    Scale, School, Palette, Users, Globe, Users2, CalendarDays, Landmark, Flag,
    type LucideIcon,
} from "lucide-react";
import type { SystemKey } from "@/lib/entity-kinds";

export type { SystemKey };

/** Los 4 sistemas en orden canónico (usado por entropía/diversidad). */
export const SYSTEM_KEYS: readonly SystemKey[] = ["politico", "educativo", "cultural", "social"] as const;

export interface SystemMeta {
    label: string;
    color: string;
    icon: LucideIcon;
    /** Consejo accionable cuando falta este sistema en la red del perfil. */
    tip: string;
}

export const SYSTEM_META: Record<SystemKey, SystemMeta> = {
    politico: { label: "Político", color: "#3B9EFF", icon: Scale, tip: "sigue una Entidad Federativa o un partido para tejer tu voz política" },
    educativo: { label: "Educativo", color: "#22d3ee", icon: School, tip: "únete a un grupo de estudio o proyecto para nutrir tu aprendizaje" },
    cultural: { label: "Cultural", color: "#c084fc", icon: Palette, tip: "asiste a un evento o sigue una comunidad para florecer en lo cultural" },
    social: { label: "Social", color: "#9b8cff", icon: Users, tip: "sigue páginas y perfiles para ampliar tu tejido social" },
};

/** Tipos de conexión (mismo vocabulario que connections-hub). */
export type ConnType = "pagina" | "grupo" | "evento" | "entidad" | "partido";

export const CONN_TYPES: readonly ConnType[] = ["pagina", "grupo", "evento", "entidad", "partido"] as const;

export interface TypeMeta {
    label: string;
    singular: string;
    icon: LucideIcon;
}

export const TYPE_META: Record<ConnType, TypeMeta> = {
    pagina: { label: "Páginas", singular: "Página", icon: Globe },
    grupo: { label: "Grupos", singular: "Grupo", icon: Users2 },
    evento: { label: "Eventos", singular: "Evento", icon: CalendarDays },
    entidad: { label: "E. Federativas", singular: "E. Federativa", icon: Landmark },
    partido: { label: "Partidos", singular: "Partido", icon: Flag },
};

/** Color por defecto (dorado StarSeed). */
export const GOLD = "#E9C46A";

/** Vínculos posibles que el perfil tiene con una entidad. */
export type GraphBond = "follow" | "member" | "admin";

export const BOND_LABEL: Record<GraphBond, string> = {
    follow: "Sigues",
    member: "Miembro",
    admin: "Administras",
};
