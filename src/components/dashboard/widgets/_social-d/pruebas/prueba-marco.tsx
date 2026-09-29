/**
 * Ayudas de prueba del paquete D: fuerza una clase de tamaño con el contexto del marco unificado
 * (el marco real mide 0 en jsdom) y aporta `matchMedia`/`IntersectionObserver` mínimos.
 */
import * as React from "react";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { disenoDe } from "@/components/widgets-libres/familias/comun";

export function preparaDom(): void {
    if (typeof window === "undefined") return;
    if (!window.matchMedia) {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => undefined,
                removeListener: () => undefined,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
                dispatchEvent: () => false,
            }),
        });
    }
}

export function EnMarco({ clase, children }: { clase: ClaseTamano; children: React.ReactNode }) {
    const { base, horizontal } = disenoDe(clase);
    const ctx: ContextoMarcoUnificado = { acento: "#ec4899", acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] };
    return <ContextoMarco.Provider value={ctx}>{children}</ContextoMarco.Provider>;
}
