"use client";

/**
 * ── hub-social/diversity — Diversidad de conexiones ──────────────────────────
 *
 * Lecturas claras y consejos accionables sobre el equilibrio de la red del
 * perfil: distribución por los 4 sistemas, índice de equilibrio (entropía
 * normalizada 0-100) y reciprocidad (vínculos mutuos / total). Todo derivado de
 * `GraphMetrics` (datos reales). Sin dependencias nuevas.
 */

import { SYSTEM_KEYS, SYSTEM_META, type SystemKey } from "@/lib/hub-social/meta";
import type { GraphMetrics } from "@/lib/hub-social/graph";

export interface DonutSegment {
    system: SystemKey;
    label: string;
    color: string;
    count: number;
    /** Proporción 0-1 sobre el total. */
    fraction: number;
    /** Porcentaje redondeado 0-100. */
    pct: number;
}

/** Segmentos del donut/barras por sistema (orden canónico). */
export function donutSegments(metrics: GraphMetrics): DonutSegment[] {
    const total = metrics.total || 0;
    return SYSTEM_KEYS.map((system) => {
        const count = metrics.perSystem[system];
        const fraction = total > 0 ? count / total : 0;
        return {
            system,
            label: SYSTEM_META[system].label,
            color: SYSTEM_META[system].color,
            count,
            fraction,
            pct: Math.round(fraction * 100),
        };
    });
}

export interface BalanceReading {
    label: string;
    tone: string; // color
    blurb: string;
}

/** Lectura cualitativa del índice de equilibrio. */
export function balanceReading(balanceIndex: number, systemsPresent: number): BalanceReading {
    if (systemsPresent <= 1) {
        return { label: "Monocultivo", tone: "#f59e0b", blurb: "Tu red vive en un solo sistema. Diversificar te hará más resiliente." };
    }
    if (balanceIndex >= 80) {
        return { label: "Plenamente diverso", tone: "#34d399", blurb: "Tu red florece por igual en los cuatro sistemas. Equilibrio ejemplar." };
    }
    if (balanceIndex >= 55) {
        return { label: "Diverso", tone: "#22d3ee", blurb: "Buen reparto entre sistemas. Un empujón más y alcanzas el equilibrio pleno." };
    }
    if (balanceIndex >= 30) {
        return { label: "Equilibrio incipiente", tone: "#9b8cff", blurb: "Empiezas a tejer varios sistemas. Sigue ampliando los que menos pesan." };
    }
    return { label: "Concentrado", tone: "#f59e0b", blurb: "Tu red se concentra en pocos sistemas. Explora los que faltan para equilibrarla." };
}

/** Sistemas sin ninguna conexión. */
export function missingSystems(metrics: GraphMetrics): SystemKey[] {
    return SYSTEM_KEYS.filter((k) => metrics.perSystem[k] === 0);
}

/** Sistema con MENOS peso (entre los presentes o ausentes) para el consejo. */
export function weakestSystem(metrics: GraphMetrics): SystemKey {
    let weakest: SystemKey = SYSTEM_KEYS[0];
    let min = Infinity;
    for (const k of SYSTEM_KEYS) {
        if (metrics.perSystem[k] < min) { min = metrics.perSystem[k]; weakest = k; }
    }
    return weakest;
}

/** Consejo accionable, honesto y concreto. */
export function diversityAdvice(metrics: GraphMetrics): string {
    if (metrics.total === 0) {
        return "Aún no tienes conexiones. Empieza siguiendo una página o uniéndote a un grupo para sembrar tu red.";
    }
    const missing = missingSystems(metrics);
    if (missing.length > 0) {
        const target = missing[0];
        return `Te falta el sistema ${SYSTEM_META[target].label.toLowerCase()}: ${SYSTEM_META[target].tip}.`;
    }
    if (metrics.reciprocityPct < 25) {
        return "Tienes presencia en los cuatro sistemas, pero pocos vínculos recíprocos. Únete a entidades que ya sigues para fortalecer tu tejido.";
    }
    if (metrics.balanceIndex < 60) {
        const weak = weakestSystem(metrics);
        return `Tu red está algo desnivelada hacia unos sistemas. ${SYSTEM_META[weak].tip[0].toUpperCase()}${SYSTEM_META[weak].tip.slice(1)}.`;
    }
    return "Tu red es diversa y recíproca. Mantén el equilibrio y sigue cultivando los vínculos que más resuenan contigo.";
}

export interface ReciprocityReading {
    label: string;
    tone: string;
}
export function reciprocityReading(pct: number): ReciprocityReading {
    if (pct >= 50) return { label: "Tejido fuerte", tone: "#34d399" };
    if (pct >= 25) return { label: "Tejido en formación", tone: "#22d3ee" };
    if (pct > 0) return { label: "Tejido incipiente", tone: "#9b8cff" };
    return { label: "Sin vínculos mutuos", tone: "#f59e0b" };
}
