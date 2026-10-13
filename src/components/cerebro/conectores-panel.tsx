"use client";

/** Pilar «Conectores» (componente de partida, CB1013A). Lo sustituye la tarea CB1013I (§6). */

import { EnConstruccion } from "@/components/cerebro/en-construccion";

export interface ConectoresPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ConectoresPanel({ brainName }: ConectoresPanelProps) {
    return (
        <EnConstruccion
            titulo="Conectores"
            tarea="CB1013H + CB1013I"
            queHara={`Reunirá en un solo sitio los conectores, integraciones, servidores MCP, canales y cuentas externas que usa «${brainName ?? "este cerebro"}», con su estado real y un interruptor para usarlos aquí.`}
            mientras="tus conexiones están en /conexiones."
        />
    );
}
