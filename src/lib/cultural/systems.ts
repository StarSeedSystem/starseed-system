"use client";

/*
 * cultural/systems — SISTEMAS CULTURALES de la confederación intergaláctica.
 * ---------------------------------------------------------------------------
 * Un "sistema" cultural es una gran esfera de tradición humana (iberoamérica,
 * Europa, África, mundo árabe, Asia oriental…). Se usa de forma COHERENTE en
 * todo el PACK 2 cultural:
 *   · Mapa-mundi de conexiones  → color del pin por el sistema de la persona.
 *   · Idiomas / puente cultural → cada idioma pertenece a un sistema.
 *   · Calendario festivo        → cada festividad pertenece a un sistema.
 *   · Hermanamiento de Sanghas  → el lazo se pinta con los colores de AMBOS.
 *
 * Sin dependencias nuevas. Colores en HEX (para Leaflet/SVG) + helpers rgba
 * para las superficies "liquid glass". Defensivo: `systemById` nunca lanza.
 */

export interface CulturalSystem {
    /** Id estable (se persiste en tags públicos `sistema:<id>`). */
    id: string;
    /** Nombre visible en español. */
    label: string;
    /** Color HEX del sistema (pins de mapa, lazos de hermanamiento, acentos). */
    color: string;
    /** Descripción de una línea. */
    hint: string;
}

/**
 * Catálogo curado de sistemas culturales. Colores distribuidos por el círculo
 * cromático para que sean distinguibles de un vistazo en el mapa y las leyendas.
 */
export const CULTURAL_SYSTEMS: CulturalSystem[] = [
    { id: "iberoamerica", label: "Iberoamérica", color: "#f59e0b", hint: "Latinoamérica, España y Portugal" },
    { id: "europa", label: "Europa", color: "#3b82f6", hint: "Europa occidental y central" },
    { id: "eslavo", label: "Mundo eslavo", color: "#6366f1", hint: "Europa del este y Eurasia" },
    { id: "anglosajon", label: "Anglosajón", color: "#06b6d4", hint: "Norteamérica y esfera anglófona" },
    { id: "africa", label: "África", color: "#f97316", hint: "África subsahariana" },
    { id: "arabe", label: "Mundo árabe", color: "#10b981", hint: "Norte de África y Oriente Medio" },
    { id: "asia-oriental", label: "Asia oriental", color: "#ef4444", hint: "China, Japón, Corea" },
    { id: "asia-sur", label: "Asia del sur", color: "#ec4899", hint: "India y subcontinente" },
    { id: "sudeste-asiatico", label: "Sudeste asiático", color: "#14b8a6", hint: "Indochina e insulindia" },
    { id: "oceania", label: "Oceanía", color: "#22c55e", hint: "Pacífico y Australasia" },
    { id: "originarios", label: "Pueblos originarios", color: "#a855f7", hint: "Naciones y saberes ancestrales (Abya Yala)" },
    { id: "global", label: "Interconexión global", color: "#94a3b8", hint: "Confederación intergaláctica / sin sistema declarado" },
];

const SYSTEM_INDEX: Record<string, CulturalSystem> = Object.fromEntries(
    CULTURAL_SYSTEMS.map((s) => [s.id, s]),
);

/** Sistema por defecto cuando no hay ninguno declarado. */
export const FALLBACK_SYSTEM: CulturalSystem =
    SYSTEM_INDEX["global"] ?? CULTURAL_SYSTEMS[CULTURAL_SYSTEMS.length - 1];

/** Devuelve el sistema por id (o el global si no existe). Nunca lanza. */
export function systemById(id: string | null | undefined): CulturalSystem {
    if (!id) return FALLBACK_SYSTEM;
    return SYSTEM_INDEX[id] ?? FALLBACK_SYSTEM;
}

/** Color HEX de un sistema (o el fallback). */
export function systemColor(id: string | null | undefined): string {
    return systemById(id).color;
}

/**
 * Convierte un HEX (#rrggbb) a rgba con la opacidad dada. Para las superficies
 * glass y anillos suaves. Defensivo: si el hex no es válido, usa el fallback.
 */
export function hexToRgba(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
    const value = m ? m[1] : "94a3b8";
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
