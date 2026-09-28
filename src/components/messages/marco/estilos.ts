/**
 * Material y acentos de la sección Mensajería (2026-09-28): cristal oscuro, violeta de Mensajes,
 * azur de Aurora, esmeralda de presencia. Un solo sitio para que lista, chat, correos y ajustes
 * hablen el mismo idioma visual.
 */

import type { CSSProperties } from "react";

export const ACENTO = {
    mensajes: "#7C5CFF",
    aurora: "#007FFF",
    esmeralda: "#10B981",
    lima: "#39FF14",
    ambar: "#FFBF00",
    carmesi: "#DC143C",
    contactos: "#14B8A6",
} as const;

/** Panel de cristal (radio 22 px): lista, chat, lector de correo. */
export const CLASE_PANEL =
    "rounded-[22px] border border-white/[0.08] bg-[rgba(12,14,34,0.55)] backdrop-blur-[20px] backdrop-saturate-[1.4] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_-32px_rgba(0,0,0,0.65)]";

/** Superficie de un elemento (radio 16 px): filas, tarjetas de ajustes. */
export const CLASE_ITEM = "rounded-2xl border border-white/[0.06] bg-white/[0.03]";

/** Rótulo de sección: 11 px, versalitas, tracking .14em, ~55 % blanco. */
export const CLASE_ROTULO = "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55";

/** Pastilla fantasma de un color: fondo al 12 % y filo interior al 40 %. */
export function pildoraFantasma(color: string, activa = true): CSSProperties {
    return activa
        ? { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` }
        : { background: "rgba(255,255,255,0.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" };
}

/** Punto de «en línea» con halo suave. */
export const ESTILO_PUNTO_EN_LINEA: CSSProperties = {
    background: ACENTO.esmeralda,
    boxShadow: `0 0 0 2px rgba(10,12,28,0.95), 0 0 10px ${ACENTO.esmeralda}aa`,
};

/** Muelle de framer-motion para paneles y hojas. */
export const MUELLE = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Duración de la transición del modo enfoque (s). */
export const DURACION_ENFOQUE = 0.25;
