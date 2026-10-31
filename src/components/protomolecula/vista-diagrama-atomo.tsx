"use client";

/**
 * Protomolécula · VISTA DEL ÁTOMO «diagrama» (Diagram Design) dentro del bloque
 * protomolécula del lienzo, las publicaciones y los mensajes. Contrato:
 * architecture/diagramas.md §3 y §4 (tareas H y K).
 *
 * Qué se ve lo decide `elegirVistaDiagrama` del bloque: el HTML listo lo pinta
 * `VistaDiagrama` (iframe `sandbox` aislado, sin `allow-same-origin` ni red,
 * fuentes del OS), y lo pendiente o rechazado se anuncia con su motivo.
 */
import { useMemo } from "react";
import { ATOMO_DIAGRAMA, elegirVistaDiagrama } from "@/lib/protomolecula/bloque-protomolecula";
import { VistaDiagrama } from "@/components/diagramas/vista-diagrama";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";

const htmlDe = (valores: Record<string, unknown>): string | null => {
    const valor = valores.html;
    return typeof valor === "string" ? valor : null;
};

export default function VistaDiagramaAtomo({ valores }: VistaProps) {
    const html = htmlDe(valores);
    const decision = useMemo(
        () => elegirVistaDiagrama({ herramientaId: ATOMO_DIAGRAMA, estado: "activo" }, html),
        [html],
    );

    if (!decision) {
        return (
            <p role="status" className="p-3 text-sm text-muted-foreground">
                Este átomo no es un diagrama de Diagram Design.
            </p>
        );
    }
    if (decision.vista === "error") {
        return (
            <div role="alert" className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100">
                <p className="font-semibold">Diagrama rechazado</p>
                <p className="mt-1">{decision.motivo}</p>
            </div>
        );
    }
    if (decision.vista === "pendiente") {
        return (
            <p aria-live="polite" role="status" className="p-3 text-sm text-muted-foreground">
                {decision.motivo}
            </p>
        );
    }
    return <VistaDiagrama html={html ?? ""} titulo="Diagrama" />;
}
