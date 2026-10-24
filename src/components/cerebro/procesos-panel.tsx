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
    ETIQUETA_TIPO,
    hardwareDesdeMac,
    hardwareDesdeNeurona,
    hardwareDesdeNodo,
    porcentaje,
    UMBRALES_POR_DEFECTO,
    type HardwareServidor,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEstadoActualizaciones } from "@/components/actualizaciones/use-estado-actualizaciones";
import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { listNeurons } from "@/lib/neurons/neurons";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";

const ETIQUETA_MEDIDA = { cpu: "CPU", ram: "RAM", disco: "Disco", bateria: "Batería" } as const;
const ETIQUETA_ESTADO = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
} as const;

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

function FilaProceso({ p }: { p: ProcesoActivo }) {
    const desde = p.desde == null ? null : new Date(p.desde);
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-white/85">{p.nombre}</p>
            <p className="mt-1 text-xs text-white/60">
                {ETIQUETA_ESTADO[p.estado]} · {p.donde}
                {p.detalle ? ` · ${p.detalle}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
                Fuente: {p.fuente}
                {p.progreso == null ? " · progreso sin medida" : ` · ${Math.round(p.progreso * 100)} %`}
                {desde ? ` · desde las ${desde.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}
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
    const [procesos, setProcesos] = useState<ProcesoActivo[] | null>(null);
    const presencia = usePresenciaNeuronas();
    const actualizaciones = useEstadoActualizaciones();

    useEffect(() => {
        let vivo = true;
        void leerHardware(Date.now()).then((h) => { if (vivo) setLista(h); });
        return () => { vivo = false; };
    }, []);

    useEffect(() => {
        let vivo = true;
        void leerProcesos({ atrasos: actualizaciones.atrasos, presencia }).then((p) => {
            if (vivo) setProcesos(p.procesos);
        });
        return () => { vivo = false; };
    }, [actualizaciones.atrasos, presencia]);

    const grupos = procesos ? agruparPorTipo(procesos) : {};
    const tipos = Object.keys(ETIQUETA_TIPO) as TipoProceso[];

    return (
        <div className="space-y-4">
            <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                {lista === null ? (
                    <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
                ) : lista.length === 0 ? (
                    <p className="text-sm text-white/60">Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está disponible en la propia Mac o con sesión de MetaGenesis.</p>
                ) : (
                    <ProcesosHardware hardware={lista} umbrales={UMBRALES_POR_DEFECTO} />
                )}
            </section>

            <section aria-label="Procesos activos" className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Procesos activos</h3>
                {procesos === null ? (
                    <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
                ) : procesos.length === 0 ? (
                    <p className="text-sm text-white/60">Ninguna fuente informó de procesos activos ahora mismo.</p>
                ) : (
                    tipos.map((tipo) => {
                        const delTipo = grupos[tipo];
                        if (!delTipo?.length) return null;
                        return (
                            <div key={tipo} className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                                    {ETIQUETA_TIPO[tipo]} · {delTipo.length}
                                </h4>
                                <ul className="space-y-2">
                                    {delTipo.map((p) => <FilaProceso key={p.id} p={p} />)}
                                </ul>
                            </div>
                        );
                    })
                )}
            </section>
        </div>
    );
}
