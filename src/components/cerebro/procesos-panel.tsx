"use client";

/** Pilar «Procesos activos» (componente de partida, CB1013A). Lo sustituye la tarea CB1013N (§7). */

import { EnConstruccion } from "@/components/cerebro/en-construccion";

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ProcesosPanel(_props: ProcesosPanelProps) {
    return (
        <EnConstruccion
            titulo="Procesos activos"
            tarea="CB1013J–Q"
            queHara="Mostrará los agentes de Genesis y PoliGenesis, los sueños y la imaginación en segundo plano, las descargas, instalaciones y actualizaciones, las apps en segundo plano y el uso real de CPU, RAM, GPU, disco y batería de cada servidor vinculado, con intervalo y umbrales ajustables."
            mientras="los agentes y medidores de la Mac están en Genesis (/genesis)."
        />
    );
}
