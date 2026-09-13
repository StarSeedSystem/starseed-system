"use client";

/**
 * Pestaña Director del Mando (1/3 · p318F) — agentes en vivo por fase honesta.
 * Cabecera «N vivos · N esperando aprobación · N colgados» (vivos = escribiendo +
 * verificando + revisando; esperando aprobación NUNCA cuenta como colgado) y una
 * lista con id, fase, modelo·proveedor, KB y minutos.
 *
 * `AgenteVivo` no lleva la cola del latido (`latidos-*.json` guarda las tareas
 * por id, sin nombre de cola — ver `director-fuentes.ts:leerLatidos`), así que
 * Aprobar/Rechazar/Soltar viajan con `nombre: ""` y el Mando devuelve el error
 * real si le falta ese dato; llevar la cola hasta aquí es la próxima tarea.
 */

import { useState } from "react";
import { Check, Unplug, X } from "lucide-react";
import type { AgenteVivo, EstadoAgente } from "@/lib/mando/director-datos";
import { MarcoWidget } from "@/components/dashboard/kit/marco-widget";

export interface ResumenAgentesVivos {
    vivos: number; colgados: number; esperandoAprobacion: number; lista: AgenteVivo[];
}

const ETIQUETA_ESTADO: Record<EstadoAgente, string> = {
    escribiendo: "escribiendo", verificando: "verificando", revisando: "revisando",
    esperando_aprobacion: "esperando aprobación", colgado: "colgado", hecho: "hecho",
};

const BOTON = "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50";

async function ordenColas(accion: string, tarea: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; detalle: string }> {
    try {
        const r = await fetch("/api/mando/colas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accion, nombre: "", tarea, dondeActual: "mac", ...extra }),
        });
        const cuerpo = (await r.json()) as { ok?: boolean; detalle?: string; error?: string };
        return { ok: Boolean(cuerpo.ok), detalle: cuerpo.detalle ?? cuerpo.error ?? `HTTP ${r.status}` };
    } catch {
        return { ok: false, detalle: "No se pudo hablar con el Mando." };
    }
}

function FilaAgente({ agente }: { agente: AgenteVivo }) {
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);
    const accionar = async (etiqueta: string, accion: string, extra?: Record<string, unknown>) => {
        setOcupado(etiqueta);
        setResultado(null);
        setResultado(await ordenColas(accion, agente.id, extra));
        setOcupado(null);
    };
    return (
        <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/20 bg-black/10 px-3 py-2 text-xs" data-testid={`agente-${agente.id}`}>
            <div className="flex min-w-0 flex-col">
                <span className="font-bold text-foreground/90">{agente.id} · {ETIQUETA_ESTADO[agente.estado]}</span>
                <span className="text-[11px] text-muted-foreground/70">
                    {agente.modelo ? `${agente.modelo} · ${agente.proveedor}` : agente.proveedor} · {agente.kb} KB · {agente.minutos} min
                    {agente.intento ? ` · intento ${agente.intento}` : ""}
                </span>
            </div>
            {agente.estado === "esperando_aprobacion" ? (
                <div className="flex items-center gap-1.5">
                    <button type="button" disabled={ocupado !== null} onClick={() => void accionar("aprobar", "aprobar")} className={`${BOTON} border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`}>
                        <Check className="size-3" aria-hidden /> {ocupado === "aprobar" ? "…" : "Aprobar"}
                    </button>
                    <button type="button" disabled={ocupado !== null} onClick={() => void accionar("rechazar", "rechazar")} className={`${BOTON} border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20`}>
                        <X className="size-3" aria-hidden /> {ocupado === "rechazar" ? "…" : "Rechazar"}
                    </button>
                </div>
            ) : null}
            {agente.estado === "colgado" ? (
                <button type="button" disabled={ocupado !== null} onClick={() => void accionar("soltar", "reasignar", { donde: "nube" })} className={`${BOTON} border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`}>
                    <Unplug className="size-3" aria-hidden /> {ocupado === "soltar" ? "…" : "Soltar"}
                </button>
            ) : null}
            {resultado ? <span className={`w-full text-[10px] ${resultado.ok ? "text-emerald-400/80" : "text-rose-400/80"}`}>{resultado.detalle}</span> : null}
        </li>
    );
}

export function DirectorAgentesVivos({ agentes }: { agentes: ResumenAgentesVivos }) {
    return (
        <MarcoWidget titulo="Agentes en vivo" categoria="sistema">
            <div className="flex h-full flex-col gap-2 p-3" data-testid="director-agentes-vivos">
                <p className="text-xs font-semibold text-foreground/80">
                    {agentes.vivos} vivos · {agentes.esperandoAprobacion} esperando aprobación · {agentes.colgados} colgados
                </p>
                {agentes.lista.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/60">ningún agente en el latido</p>
                ) : (
                    <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
                        {agentes.lista.map((a) => <FilaAgente key={a.id} agente={a} />)}
                    </ul>
                )}
            </div>
        </MarcoWidget>
    );
}
