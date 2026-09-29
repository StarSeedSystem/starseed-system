/**
 * Utilidades de prueba del catálogo ampliado (Ola 0929-C): pintar un widget DENTRO del marco
 * unificado con una clase de tamaño forzada, como lo hace el registro.
 */
import * as React from "react";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

/** Medidas (px) típicas de cada clase: las que el marco mediría. */
export const MEDIDAS: Record<ClaseTamano, { width: number; height: number }> = {
    micro: { width: 96, height: 96 },
    s: { width: 160, height: 150 },
    m: { width: 380, height: 260 },
    l: { width: 380, height: 325 },
    xl: { width: 560, height: 480 },
    panoramico: { width: 760, height: 260 },
    torre: { width: 180, height: 420 },
};

export function ctxMarco(clase: ClaseTamano, acento = "#39ff14", acento2 = "#7c5cff"): ContextoMarcoUnificado {
    const { base, horizontal } = disenoDe(clase);
    return { acento, acento2, clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] };
}

export function EnMarco({ clase, children, acento }: { clase: ClaseTamano; children: React.ReactNode; acento?: string }) {
    return <ContextoMarco.Provider value={ctxMarco(clase, acento)}>{children}</ContextoMarco.Provider>;
}
