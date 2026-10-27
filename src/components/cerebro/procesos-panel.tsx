"use client";

/**
 * Pilar «Procesos activos» (CB1013J–Q, contrato §7). Lee las fuentes reales con
 * `leerProcesos()`, enseña las cuentas por tipo como filtros y agrupa la lista;
 * cada número sale de una medida o dice «sin medida». Las acciones son solo las
 * que ya existen: abrir Genesis para un agente y restaurar una ventana minimizada.
 * Debajo van el hardware con sus avisos y los ajustes plegables.
 */

import { useCallback, useEffect, useState } from "react";
import { ETIQUETA_TIPO, type ProcesoActivo, type TipoProceso } from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEstadoActualizaciones } from "@/components/actualizaciones/use-estado-actualizaciones";
import { focusWindow, setActiveDesktop, setWindowMinimized } from "@/components/desktop/desktop-store";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

type Datos = Awaited<ReturnType<typeof leerProcesos>>;

const ETIQUETA_ESTADO = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
} as const;

const CLASE_CHIP = "cursor-pointer rounded-full border px-3 py-1 text-xs whitespace-normal h-auto transition-colors";
const CLASE_ACCION = "cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10 whitespace-normal h-auto";

function FilaProceso({ p, onRefrescar }: { p: ProcesoActivo; onRefrescar: () => void }) {
    const resto = p.id.startsWith("ventana:") ? p.id.slice("ventana:".length) : "";
    const corte = resto.indexOf(":");
    const escritorio = corte > 0 ? resto.slice(0, corte) : null;
    const idVentana = corte > 0 ? resto.slice(corte + 1) : null;
    const restaurar = () => {
        if (!escritorio || !idVentana) return;
        setActiveDesktop(escritorio);
        setWindowMinimized(escritorio, idVentana, false);
        focusWindow(escritorio, idVentana);
        onRefrescar();
    };
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-medium text-white/85">{p.nombre}</p>
                    <p className="break-words text-xs text-white/60">
                        {ETIQUETA_ESTADO[p.estado]} · {p.donde}
                        {p.desde != null ? ` · ${textoHace(Date.now() - p.desde)}` : " · sin hora medida"}
                    </p>
                    {p.detalle ? <p className="break-words text-[11px] text-white/45">{p.detalle}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    {p.tipo === "genesis" ? <a href="/genesis" className={CLASE_ACCION}>Abrir Genesis</a> : null}
                    {escritorio && idVentana ? (
                        <button type="button" onClick={restaurar} className={CLASE_ACCION}>Restaurar ventana</button>
                    ) : null}
                </div>
            </div>
            {p.progreso != null ? (
                <div
                    className="mt-2"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(p.progreso * 100)}
                    aria-label={`Progreso de ${p.nombre}`}
                >
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.round(p.progreso * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-white/45">{Math.round(p.progreso * 100)} %</p>
                </div>
            ) : null}
            <p className="mt-1 text-[11px] text-white/35">Fuente: {p.fuente}</p>
        </li>
    );
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const { prefs } = usarPreferenciasProcesos();
    const presencia = usePresenciaNeuronas();
    const { atrasos } = useEstadoActualizaciones();
    const [datos, setDatos] = useState<Datos | null>(null);
    const [cargando, setCargando] = useState(false);
    const [ultima, setUltima] = useState<number | null>(null);
    const [filtro, setFiltro] = useState<TipoProceso | "todos">("todos");

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await leerProcesos({ atrasos, presencia });
            setDatos(r);
            setUltima(Date.now());
        } finally {
            setCargando(false);
        }
    }, [atrasos, presencia]);

    useEffect(() => {
        void cargar();
        const visible = () => document.visibilityState === "visible";
        const id = window.setInterval(() => { if (visible()) void cargar(); }, Math.max(5, prefs.intervaloSeg) * 1000);
        const alVolver = () => { if (visible()) void cargar(); };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [cargar, prefs.intervaloSeg]);

    const procesos = datos?.procesos ?? [];
    const grupos = agruparPorTipo(procesos);
    const tipos = (Object.keys(ETIQUETA_TIPO) as TipoProceso[]).filter(
        (t) => !prefs.tipos.length || prefs.tipos.includes(t),
    );
    const conCuenta = tipos.filter((t) => (grupos[t]?.length ?? 0) > 0);
    const aMostrar = filtro === "todos" ? tipos : [filtro];

    return (
        <div className="space-y-4">
            <section aria-label="Procesos activos" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">Procesos activos</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] text-white/45">
                            {ultima == null
                                ? "Sin lectura todavía"
                                : `Última lectura: ${new Date(ultima).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
                        </p>
                        <button
                            type="button"
                            onClick={() => void cargar()}
                            disabled={cargando}
                            className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50 whitespace-normal h-auto"
                        >
                            {cargando ? "Actualizando…" : "Actualizar"}
                        </button>
                    </div>
                </div>

                {datos == null ? (
                    <p className="text-sm text-white/60">Leyendo las fuentes de procesos…</p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar procesos por tipo">
                            <button
                                type="button"
                                onClick={() => setFiltro("todos")}
                                aria-pressed={filtro === "todos"}
                                className={`${CLASE_CHIP} ${filtro === "todos" ? "border-rose-400/50 bg-rose-500/10 text-rose-100" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"}`}
                            >
                                Todos · {procesos.length}
                            </button>
                            {conCuenta.map((tipo) => (
                                <button
                                    key={tipo}
                                    type="button"
                                    onClick={() => setFiltro(tipo)}
                                    aria-pressed={filtro === tipo}
                                    className={`${CLASE_CHIP} ${filtro === tipo ? "border-rose-400/50 bg-rose-500/10 text-rose-100" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"}`}
                                >
                                    {ETIQUETA_TIPO[tipo]} · {grupos[tipo]?.length ?? 0}
                                </button>
                            ))}
                        </div>

                        {procesos.length === 0 ? (
                            <p className="text-sm text-white/60">Ninguna fuente informó de procesos activos ahora mismo.</p>
                        ) : (
                            <div className="space-y-3">
                                {aMostrar.map((tipo) => {
                                    const lista = grupos[tipo] ?? [];
                                    if (!lista.length) return null;
                                    return (
                                        <div key={tipo} className="space-y-2">
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                                                {ETIQUETA_TIPO[tipo]} · {lista.length}
                                            </h4>
                                            <ul className="space-y-2">
                                                {lista.map((p) => (
                                                    <FilaProceso key={p.id} p={p} onRefrescar={() => void cargar()} />
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </section>

            <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Hardware de los servidores vinculados</h3>
                {datos == null ? (
                    <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
                ) : datos.hardware.length === 0 ? (
                    <p className="text-sm text-white/60">
                        Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está disponible en la propia Mac o con sesión de MetaGenesis.
                    </p>
                ) : (
                    <ProcesosHardware hardware={datos.hardware} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />
                )}
            </section>

            <details className="rounded-xl border border-white/10 bg-black/20">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-white/80">
                    Ajustes de procesos
                </summary>
                <div className="border-t border-white/10 p-3">
                    <ProcesosAjustes brainId={brainId} />
                </div>
            </details>

            <section aria-label="Fuentes consultadas" className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Fuentes consultadas</h3>
                {datos == null ? (
                    <p className="text-sm text-white/60">Sin fuentes todavía.</p>
                ) : (
                    <ul className="grid gap-1 sm:grid-cols-2">
                        {datos.fuentes.map((f) => (
                            <li key={f.nombre} className="break-words text-[11px] text-white/50">
                                <span className={f.ok ? "text-emerald-300" : "text-rose-300"}>{f.ok ? "✓" : "✗"}</span>{" "}
                                {f.nombre}
                                {f.ok ? ` · ${f.ms} ms` : ` · ${f.motivo?.trim() || "sin respuesta"}`}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
