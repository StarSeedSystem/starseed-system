"use client";

/*
 * MiGenesis — el Genesis de cada persona (2026-10-10): cambia TU cuenta (perfil, páginas,
 * apariencia, dock, tableros y agentes) hablando con un agente de modelos gratuitos o con los
 * atajos, siempre con vista previa, confirmación y deshacer. No toca el código del OS (eso es
 * MetaGenesis). SOP: architecture/genesis-personas-poligenesis.md
 */

import { useCallback, useMemo, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import { puertosDelOs, contextoDeMiCuenta } from "@/lib/genesis/puertos-os";
import type { Ambito } from "@/lib/genesis/operaciones";
import { PanelOperaciones } from "./panel-operaciones";
import { AtajosGenesis } from "./atajos-genesis";

const AMBITO: Ambito = { tipo: "persona" };

const SUGERENCIAS = [
    "Pon Decisiones en mi dock",
    "Cambia mi biografía por: tejedora de comunidades",
    "Añade el widget Ágora Causal a mi tablero principal",
    "Crea un agente privado que me resuma las propuestas abiertas",
    "Haz la letra un poco más grande",
];

export function MiGenesis() {
    const { rawConfig, updateConfig, bgScopeMode } = useAppearance();
    const configRef = useRef(rawConfig);
    configRef.current = rawConfig;
    const actualizarRef = useRef(updateConfig);
    actualizarRef.current = updateConfig;

    const puertos = useMemo(
        () =>
            puertosDelOs({
                leer: () => configRef.current,
                escribir: (parche) => actualizarRef.current(parche as Parameters<typeof updateConfig>[0]),
                ambitoFondo: bgScopeMode,
            }),
        // updateConfig y rawConfig van por referencia (refs): solo el ámbito del fondo rehace los puertos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bgScopeMode],
    );

    const cargarContexto = useCallback(() => contextoDeMiCuenta(), []);

    return (
        <section className="space-y-4" data-testid="mi-genesis">
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3 text-xs text-white/70">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                <p>
                    Genesis cambia tu cuenta con operaciones de una lista cerrada: nunca ejecuta código. Ajustes, tu perfil, la Biblioteca y el deshacer
                    siempre siguen a tu alcance.
                </p>
            </div>
            <PanelOperaciones
                ambito={AMBITO}
                modo="aplicar"
                motivoModo="Se aplican en tu cuenta cuando confirmas."
                puertos={puertos}
                cargarContexto={cargarContexto}
                sugerencias={SUGERENCIAS}
                atajos={(anadir, ctx) => <AtajosGenesis anadir={anadir} ctx={ctx} />}
            />
        </section>
    );
}
