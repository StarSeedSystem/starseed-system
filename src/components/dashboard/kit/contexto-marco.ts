'use client';

// ════════════════════════════════════════════════════════════════
// Contexto del marco unificado (Ola L6)
// ----------------------------------------------------------------
// `MarcoUnificado` (src/components/widgets-libres/marco-unificado.tsx)
// envuelve el cuerpo de los widgets clásicos en el mismo material que
// WidgetLibre y publica aquí su acento, su clase de tamaño y el
// espaciado que le toca. Las piezas del kit (WidgetShell, StatTile,
// Chip, estados…) lo leen para adoptar la escala tipográfica y las
// pastillas fantasma SOLO dentro de ese marco: fuera de él (Genesis, Estudio, «marco clásico») el contexto es `null` y todo se ve
// exactamente como siempre.
// ════════════════════════════════════════════════════════════════

import { createContext, useContext } from "react";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

/** Diseño base de una clase: panorámico y torre reutilizan el de «m». */
export type BaseTamano = "micro" | "s" | "m" | "l" | "xl";

/** Clases de espaciado (Tailwind literales) que el marco asigna a cada tamaño. */
export interface EspaciadoMarco {
    cabecera: string;
    cuerpo: string;
    pie: string;
    /** Caja del icono de la cabecera. */
    icono: string;
    /** Tamaño del SVG dentro de esa caja. */
    iconoSvg: string;
    /** Radio del marco en px. */
    radio: number;
}

export interface ContextoMarcoUnificado {
    /** Luz principal del widget (hex). */
    acento: string;
    /** Segundo tono de la luz (hex). */
    acento2: string;
    /** Clase medida del propio marco. */
    clase: ClaseTamano;
    /** Diseño base de esa clase. */
    base: BaseTamano;
    /** true en panorámico (más ancho que alto). */
    horizontal: boolean;
    espaciado: EspaciadoMarco;
    /**
     * (Pulido 0930) La caja medida es claramente más ancha que alta, sea cual sea su clase. En
     * «micro» decide la composición: glifo y cifra EN FILA (una tesela de 108×65 o de 178×46 no
     * tiene alto para apilar nada). Opcional: fuera del marco unificado puede faltar.
     */
    apaisado?: boolean;
}

export const ContextoMarco = createContext<ContextoMarcoUnificado | null>(null);

/** El marco unificado que envuelve a este componente, o `null` si no hay ninguno. */
export function useMarcoUnificado(): ContextoMarcoUnificado | null {
    return useContext(ContextoMarco);
}
