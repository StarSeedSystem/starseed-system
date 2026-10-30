"use client";

/**
 * Pilar «Procesos activos» (CB1013J–Q, §7). Lee `leerProcesos()` al montarse y
 * cada `intervaloSeg` de las preferencias (CB1013P), solo con la pestaña
 * visible. Arriba, cuentas reales por tipo como filtros; debajo, la lista
 * agrupada por tipo con las acciones que ya existen (abrir /genesis y
 * restaurar una ventana); después el hardware (CB1013O) y los ajustes
 * plegables (CB1013P). Al pie, las fuentes consultadas con su resultado.
 * Lo que no se mide dice «sin medida», nunca un 0.
 */

import { useCallback, useEffect, useId, useState } from "react";
import {
    ETIQUETA_TIPO,
    type HardwareServidor,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import {
    accionProceso,
    contarPorTipos,
    filtrarPorTipos,
    tiposVisibles,
} from "@/lib/cerebros/procesos-panel-logica";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEstadoActualizaciones } from "@/components/actualizaciones/use-estado-actualizaciones";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const ETIQUETA_ESTADO = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
} as const;

interface Lectura {
    procesos: ProcesoActivo[];
    hardware: HardwareServidor[];
    fuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }>;
    cuando: number;
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

function FilaProceso({ p }: { p: ProcesoActivo }) {
    const accion = accionProceso(p);
    const desde = p.desde == null ? null : textoHace(Date.now() - p.desde);
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-white/85">{p.nombre}</p>
            <p className="mt-1 text-xs text-white/60">
                {ETIQUETA_ESTADO[p.estado]} · {p.donde}
                {p.detalle ? ` · ${p.detalle}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
                {desde ? `desde ${desde}` : "desde: sin medida"}
                {p.progreso != null ? ` · ${Math.round(p.progreso * 100)} %` : ""}
            </p>
            {p.progreso != null && (
                <div className="mt-2 h-1.5 w-full rounded bg-white/10" role="progressbar" aria-valuenow={Math.round(p.progreso * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-1.5 rounded bg-cyan-500" style={{ width: `${Math.min(100, Math.max(0, p.progreso * 100))}%` }} />
                </div>
            )}
            {accion.clase === "genesis" && (
                <a
                    href="/genesis"
                    className="mt-2 inline-flex cursor-pointer items-center rounded px-2 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/10 whitespace-normal h-auto"
                >
                    Abrir Genesis
                </a>
            )}
            {accion.clase === "ventana" && accion.desktopId && accion.winId && (
                <button
                    type="button"
                    onClick={() => setWindowMinimized(accion.desktopId!, accion.winId!, false)}
                    className="mt-2 inline-flex cursor-pointer items-center rounded px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 whitespace-normal h-auto"
                >
                    Restaurar ventana
                </button>
            )}
        </li>
    );
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const idPlegable = useId();
    const { prefs } = usarPreferenciasProcesos();
    const presencia = usePresenciaNeuronas();
    const actualizaciones = useEstadoActualizaciones();
    const [lectura, setLectura] = useState<Lectura | null>(null);
    const [leyendo, setLeyendo] = useState(false);
    const [tipoActivo, setTipoActivo] = useState<TipoProceso | null>(null);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

    const leer = useCallback(() => {
        setLeyendo(true);
        void leerProcesos({ atrasos: actualizaciones.atrasos, presencia })
            .catch(() => null)
            .then((r) => {
                if (r) setLectura({ ...r, cuando: Date.now() });
                setLeyendo(false);
            });
    }, [actualizaciones.atrasos, presencia]);

    useEffect(() => { leer(); }, [leer]);

    // Cada intervaloSeg, y solo con la pestaña visible («document.visibilityState»).
    useEffect(() => {
        const ms = Math.max(5, prefs.intervaloSeg) * 1000;
        const temporizador = window.setInterval(() => {
            if (document.visibilityState === "visible") leer();
        }, ms);
        const alVolver = () => { if (document.visibilityState === "visible") leer(); };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            window.clearInterval(temporizador);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [prefs.intervaloSeg, leer]);

    const tipos = tiposVisibles(prefs.tipos);
    const procesos = lectura ? filtrarPorTipos(lectura.procesos, tipos) : [];
    const visibles = tipoActivo ? filtrarPorTipos(procesos, [tipoActivo]) : procesos;
    const cuentas = contarPorTipos(procesos, tipos);
    const grupos = agruparPorTipo(visibles);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/50">
                    Última lectura: {lectura ? new Date(lectura.cuando).toLocaleTimeString("es-ES") : "sin lectura aún"}
                </p>
                <button
                    type="button"
                    onClick={leer}
                    className="inline-flex cursor-pointer items-center rounded px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/10 whitespace-normal h-auto"
                >
                    {leyendo ? "Actualizando…" : "Actualizar"}
                </button>
            </div>

            <section aria-label="Cuentas por tipo" className="flex flex-wrap gap-2">
                {cuentas.map((c) => {
                    const activo = tipoActivo === c.tipo;
                    return (
                        <button
                            key={c.tipo}
                            type="button"
                            onClick={() => setTipoActivo(activo ? null : c.tipo)}
                            className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors whitespace-normal h-auto ${
                                activo ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/10 bg-black/20 text-white/60 hover:bg-white/5"
                            }`}
                        >
                            {c.etiqueta} · {c.cuenta}
                        </button>
                    );
                })}
            </section>

            <section aria-label="Procesos activos" className="space-y-3">
                {!lectura ? (
                    <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
                ) : visibles.length === 0 ? (
                    <p className="text-sm text-white/60">Ningún proceso activo del tipo o los tipos visibles ahora mismo.</p>
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
            <section aria-label="Hardware de los servidores vinculados">
                <ProcesosHardware hardware={lectura?.hardware ?? []} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />
            </section>
            <section aria-label="Ajustes de procesos" className="space-y-2">
                <button
                    type="button"
                    aria-expanded={ajustesAbiertos}
                    aria-controls={idPlegable}
                    onClick={() => setAjustesAbiertos((v) => !v)}
                    className="inline-flex cursor-pointer items-center rounded px-2 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 whitespace-normal h-auto"
                >
                    {ajustesAbiertos ? "Ocultar ajustes" : "Mostrar ajustes"}
                </button>
                {ajustesAbiertos && (
                    <div id={idPlegable}>
                        <ProcesosAjustes brainId={brainId} />
                    </div>
                )}
            </section>
            <section aria-label="Fuentes consultadas" className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Fuentes consultadas</h3>
                <ul className="space-y-1">
                    {(lectura?.fuentes ?? []).map((f) => (
                        <li key={f.nombre} className="text-[11px] text-white/50">
                            {f.ok ? "✓" : "✗"} {f.nombre} · {f.ok ? `${f.ms} ms` : `sin respuesta${f.motivo ?? ""}`}
                        </li>
                    ))}
                    {lectura === null && <li className="text-[11px] text-white/50">Sin lectura aún.</li>}
                </ul>
                <p className="text-[11px] text-white/40">«No disponible aquí» significa que la fuente solo responde en la propia Mac o con sesión de MetaGenesis.</p>
            </section>
        </div>
    );
}


