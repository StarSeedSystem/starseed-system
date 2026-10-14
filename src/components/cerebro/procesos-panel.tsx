"use client";

/**
 * Pilar «Procesos activos» (CB1013J–Q, §7). Esta parte muestra el hardware de
 * cada servidor vinculado aplicando el módulo puro `cerebros/procesos`:
 * esta Mac (`/api/mando/hardware` → hardwareDesdeMac, tope de 4 s), los nodos de
 * MetaGenesis (leerEstadoAutonomo → hardwareDesdeNodo) y las neuronas de la
 * cuenta (`neuron_devices` → hardwareDesdeNeurona). Lo que no se mide dice
 * «sin medida», nunca un 0. Los avisos salen de avisosHardware con
 * UMBRALES_POR_DEFECTO; el intervalo y umbrales ajustables llegan con CB1013P.
 */

import { useEffect, useState } from "react";
import {
    avisosHardware,
    hardwareDesdeMac,
    hardwareDesdeNeurona,
    hardwareDesdeNodo,
    porcentaje,
    UMBRALES_POR_DEFECTO,
    type HardwareServidor,
} from "@/lib/cerebros/procesos";
import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { listNeurons } from "@/lib/neurons/neurons";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";

const ETIQUETA_MEDIDA = { cpu: "CPU", ram: "RAM", disco: "Disco", bateria: "Batería" } as const;

function textoPct(v: number | null): string {
    return v == null ? "sin medida" : `${v} %`;
}

function FilaHardware({ h }: { h: HardwareServidor }) {
    const discoPct = porcentaje(
        h.discoLibreGb != null && h.discoTotalGb != null ? h.discoTotalGb - h.discoLibreGb : null,
        h.discoTotalGb,
    );
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-white/85">
                {h.nombre}
                <span className="ml-2 text-xs font-normal text-white/50">
                    {h.tipo === "mac" ? "Esta Mac" : h.tipo === "a1" ? "A1" : h.tipo === "neurona" ? "Neurona" : "Servidor"}
                    {h.medidoEn != null ? ` · medido ${textoHace(Date.now() - h.medidoEn)}` : ""}
                </span>
            </p>
            <p className="mt-1 text-xs text-white/60">
                CPU {textoPct(h.cpuPct)} · RAM {textoPct(porcentaje(h.ramUsadaMb, h.ramTotalMb))} · Disco {textoPct(discoPct)} · Batería {textoPct(h.bateriaPct)}
            </p>
        </li>
    );
}

async function leerHardware(ahora: number): Promise<HardwareServidor[]> {
    const out: HardwareServidor[] = [];
    const control = new AbortController();
    const tope = setTimeout(() => control.abort(), 4000);
    try {
        const r = await fetch("/api/mando/hardware", { cache: "no-store", signal: control.signal });
        const h = hardwareDesdeMac(await r.json().catch(() => null), ahora);
        if (h) out.push(h);
    } catch { /* la API solo responde en la Mac: se sigue con el resto */ } finally { clearTimeout(tope); }
    const estado = await leerEstadoAutonomo(ahora).catch(() => null);
    if (estado?.ok) for (const nodo of estado.estado.nodos) {
        const h = hardwareDesdeNodo(nodo, ahora);
        if (h) out.push(h);
    }
    for (const neurona of await listNeurons().catch(() => [])) {
        const h = hardwareDesdeNeurona(neurona, ahora);
        if (h) out.push(h);
    }
    return out;
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ProcesosPanel(_props: ProcesosPanelProps) {
    const [lista, setLista] = useState<HardwareServidor[] | null>(null);

    useEffect(() => {
        let vivo = true;
        void leerHardware(Date.now()).then((h) => { if (vivo) setLista(h); });
        return () => { vivo = false; };
    }, []);

    if (lista === null) return <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>;
    if (lista.length === 0)
        return <p className="text-sm text-white/60">Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está disponible en la propia Mac o con sesión de MetaGenesis.</p>;

    return (
        <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
            <ProcesosHardware hardware={lista} umbrales={UMBRALES_POR_DEFECTO} />
        </section>
    );
}
