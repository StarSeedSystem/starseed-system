"use client";

/**
 * Aviso de un fallo de micrófono, cámara o pantalla con «Abrir ajustes» cuando la app nativa sabe
 * abrir los del sistema (MIC1108A · 2026-11-08). Contrato: architecture/apps-autonomas-sin-internet.md §13.
 */
import { toast } from "sonner";
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";
import { abrirAjustesMedios } from "@/lib/nativa/medios-nativos";

export const ETIQUETA_ABRIR_AJUSTES = "Abrir ajustes";

export function avisarFalloMedios(motivo: string, ajustes?: AjustesMedios | null): void {
    if (!ajustes) {
        toast.error(motivo);
        return;
    }
    toast.error(motivo, {
        duration: 15_000,
        action: {
            label: ETIQUETA_ABRIR_AJUSTES,
            onClick: () => {
                void abrirAjustesMedios(ajustes).then((r) => {
                    if (!r.ok) toast.error(r.motivo);
                });
            },
        },
    });
}
