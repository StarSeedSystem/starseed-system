"use client";
/** Botón «Hacerla viva» (CVV1028, tarea K · contrato `architecture/contenido-vivo.md` §2).
 *  Se pone en el lienzo universal de creación sobre lo que se está haciendo
 *  (publicación, página, evento, cartel, estación o mensaje) y abre el panel de
 *  la tarea H. Al confirmar, añade el plan de niveles a lo que ya existe sin
 *  rehacerlo: el texto del plan lo recibe el lienzo y él decide dónde encaja. */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
    PanelContenidoVivo,
    type CotizacionViva,
} from "@/components/contenido-vivo/panel-contenido-vivo";
import { CATALOGO_RUTAS } from "@/lib/contenido-vivo/catalogo-rutas";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

export interface BotonHacerlaVivaProps {
    contexto: ContextoVivo;
    /** Recibe el texto del plan (vacío si no queda tarea encendida) para añadirlo a la creación. */
    anadir: (plan: string) => void;
}

/**
 * Texto del plan a partir de la cotización del panel (función pura): una línea
 * por tarea con la ruta elegida, «local» o sus créditos, y nada si no queda
 * ninguna tarea, para que el lienzo no reciba una línea vacía.
 */
export function textoPlanVivo(cotizacion: readonly CotizacionViva[]): string {
    const lineas = cotizacion.map((linea) => {
        const ruta = CATALOGO_RUTAS.find((r) => r.id === linea.rutaId);
        const coste = ruta?.tipo === "local" ? "local" : `${linea.creditos} créditos`;
        return `- ${linea.tarea}: ${ruta?.nombre ?? linea.rutaId} (${coste})`;
    });
    return lineas.length > 0 ? ["Contenido vivo:", ...lineas].join("\n") : "";
}

/** El botón con su panel: un solo interruptor de montaje para cualquier lienzo. */
export function BotonHacerlaViva({ contexto, anadir }: BotonHacerlaVivaProps) {
    const [abierto, setAbierto] = useState(false);
    const alConfirmar = (cotizacion: CotizacionViva[]) => {
        setAbierto(false);
        const plan = textoPlanVivo(cotizacion);
        // Con el plan vacío no se toca la creación: nada que añadir.
        if (plan) anadir(plan);
    };
    return (
        <div className="space-y-3">
            <button
                type="button"
                aria-expanded={abierto}
                aria-controls="panel-contenido-vivo-creacion"
                onClick={() => setAbierto((v) => !v)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/50 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20"
            >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {abierto ? "Ocultar el plan" : "Hacerla viva"}
            </button>
            <div id="panel-contenido-vivo-creacion" aria-expanded={abierto}>
                {abierto && <PanelContenidoVivo contexto={contexto} onConfirmar={alConfirmar} />}
            </div>
        </div>
    );
}
