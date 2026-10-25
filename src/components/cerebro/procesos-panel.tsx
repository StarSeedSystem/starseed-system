"use client";

/**
 * Pilar «Procesos activos» (CB1013N, §7 de cerebros-fusion-telepatia.md).
 * Lee con `leerProcesos()` al montarse y en cada `intervaloSeg` de las
 * preferencias (CB1013P), solo con la pestaña visible. Arriba, cuentas reales
 * por tipo como filtros pulsables; debajo, la lista agrupada por tipo con
 * acciones existentes únicamente (abrir Genesis y restaurar una ventana en
 * segundo plano si desktop-store lo permite); luego el hardware (CB1013O),
 * los ajustes plegables y las fuentes consultadas con ✓/✗. Cada número sale de
 * una medida real; lo que no se puede medir dice «sin medida», nunca un 0.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    hardwareDesdeNodo,
    type HardwareServidor,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import {
    cuentasPorTipo,
    filtrarPorTipo,
    tiposFiltro,
    textoEstado,
    ventanaAppFondo,
} from "@/lib/cerebros/procesos-tablero";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { textoHace } from "@/lib/metagenesis/remoto";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

type Lectura = Awaited<ReturnType<typeof leerProcesos>>;
type EstadoFuente = Lectura["fuentes"][number];

function sinDuplicados(lista: HardwareServidor[]): HardwareServidor[] {
    const vistos = new Set<string>();
    const salida: HardwareServidor[] = [];
    for (const h of lista) {
        if (vistos.has(h.id)) continue;
        vistos.add(h.id);
        salida.push(h);
    }
    return salida;
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const { prefs } = usarPreferenciasProcesos();
    const [procesos, setProcesos] = useState<ProcesoActivo[] | null>(null);
    const [hardware, setHardware] = useState<HardwareServidor[] | null>(null);
    const [fuentes, setFuentes] = useState<EstadoFuente[] | null>(null);
    const [ultima, setUltima] = useState<number | null>(null);
    const [filtro, setFiltro] = useState<TipoProceso | null>(null);
    const [ajustesAbierto, setAjustesAbierto] = useState(false);
    const [leyendo, setLeyendo] = useState(false);
    const vivo = useRef(true);

    const leer = useCallback(async (): Promise<void> => {
        setLeyendo(true);
        const ahora = Date.now();
        const [lectura, nodos] = await Promise.all([
            leerProcesos().catch(() => null),
            leerEstadoAutonomo(ahora).catch(() => null),
        ]);
        setLeyendo(false);
        if (!vivo.current || lectura === null) return;
        const extra = (nodos?.ok ? nodos.estado.nodos : [])
            .map((n) => hardwareDesdeNodo(n, ahora))
            .filter((h): h is HardwareServidor => h !== null);
        setProcesos(lectura.procesos);
        setHardware(sinDuplicados([...lectura.hardware, ...extra]));
        setFuentes(lectura.fuentes);
        setUltima(ahora);
    }, []);

    useEffect(() => {
        vivo.current = true;
        void leer();
        const reloj = setInterval(() => {
            if (typeof document === "undefined" || document.visibilityState !== "visible") return;
            void leer();
        }, Math.max(5, prefs.intervaloSeg) * 1000);
        return () => {
            vivo.current = false;
            clearInterval(reloj);
        };
    }, [leer, prefs.intervaloSeg]);

    const fijos = tiposFiltro(prefs.tipos);
    const filtroActivo = filtro !== null && fijos.includes(filtro) ? filtro : null;
    const cuentas = cuentasPorTipo(procesos ?? [], prefs.tipos);
    const grupos = procesos === null ? {} : agruparPorTipo(filtrarPorTipo(procesos, filtroActivo));

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Procesos activos</h3>
                <div className="flex items-center gap-3 text-xs text-white/50">
                    <span>
                        {ultima === null
                            ? "Sin lectura todavía"
                            : `Última lectura: ${new Date(ultima).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                    <button
                        type="button"
                        onClick={() => void leer()}
                        disabled={leyendo}
                        className="cursor-pointer whitespace-normal h-auto rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                        {leyendo ? "Actualizando…" : "Actualizar"}
                    </button>
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                {cuentas.map((c) => (
                    <button
                        key={c.tipo}
                        type="button"
                        aria-pressed={filtroActivo === c.tipo}
                        onClick={() => setFiltro(filtroActivo === c.tipo ? null : c.tipo)}
                        className={
                            "cursor-pointer whitespace-normal h-auto rounded-full border px-3 py-1 text-xs transition-colors " +
                            (filtroActivo === c.tipo
                                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                                : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10")
                        }
                    >
                        {c.etiqueta} · {c.cuenta}
                    </button>
                ))}
            </div>

            <section aria-label="Procesos por tipo" className="space-y-4">
                {procesos === null ? (
                    <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
                ) : Object.keys(grupos).length === 0 ? (
                    <p className="text-sm text-white/60">
                        Ninguna fuente informó de procesos activos en los tipos visibles.
                    </p>
                ) : (
                    fijos.map((tipo) => {
                        const delTipo = grupos[tipo];
                        if (!delTipo?.length) return null;
                        return (
                            <div key={tipo} className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                                    {cuentas.find((c) => c.tipo === tipo)?.etiqueta} · {delTipo.length}
                                </h4>
                                <ul className="space-y-2">
                                    {delTipo.map((p) => <FilaProceso key={p.id} p={p} />)}
                                </ul>
                            </div>
                        );
                    })
                )}
            </section>

            {hardware !== null ? (
                <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                    <h3 className="text-sm font-semibold text-white">Hardware de los servidores vinculados</h3>
                    <ProcesosHardware hardware={hardware} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />
                </section>
            ) : (
                <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
            )}

            <section aria-label="Ajustes de procesos">
                <button
                    type="button"
                    aria-expanded={ajustesAbierto}
                    onClick={() => setAjustesAbierto((v) => !v)}
                    className="cursor-pointer whitespace-normal h-auto rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition-colors hover:bg-white/10"
                >
                    {ajustesAbierto ? "Ocultar ajustes" : "Ajustes"}
                </button>
                {ajustesAbierto && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                        <ProcesosAjustes brainId={brainId} />
                    </div>
                )}
            </section>

            <section aria-label="Fuentes consultadas" className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Fuentes consultadas{ultima === null ? "" : ` · ${new Date(ultima).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`}
                </h4>
                {fuentes === null ? (
                    <p className="text-xs text-white/50">Sin lectura todavía.</p>
                ) : (
                    <ul className="grid gap-1 md:grid-cols-2">
                        {fuentes.map((f) => (
                            <li key={f.nombre} className="text-[11px] text-white/60">
                                <span className={f.ok ? "text-emerald-400" : "text-red-400"}>{f.ok ? "✓" : "✗"}</span>{" "}
                                {f.nombre}
                                {f.ok ? ` · ${f.ms} ms` : ` · ${(f.motivo ?? "sin respuesta").trim()}`}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function FilaProceso({ p }: { p: ProcesoActivo }) {
    const ventana = ventanaAppFondo(p);
    const abrirGenesis = p.tipo === "genesis" && p.id.startsWith("agente:");
    const restaurar = () => {
        if (!ventana) return;
        try {
            setWindowMinimized(ventana.escritorio, ventana.ventana, false);
        } catch {
            /* desktop-store no está disponible aquí */
        }
    };
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium text-white/85">{p.nombre}</p>
                <div className="flex items-center gap-2">
                    {abrirGenesis && (
                        <a
                            href="/genesis"
                            className="cursor-pointer whitespace-normal h-auto rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80 transition-colors hover:bg-white/10"
                        >
                            Abrir Genesis
                        </a>
                    )}
                    {ventana && (
                        <button
                            type="button"
                            onClick={restaurar}
                            className="cursor-pointer whitespace-normal h-auto rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80 transition-colors hover:bg-white/10"
                        >
                            Restaurar ventana
                        </button>
                    )}
                </div>
            </div>
            <p className="mt-1 text-xs text-white/60">
                {textoEstado(p.estado)} · corre en {p.donde} ·{" "}
                {p.desde === null ? "inicio sin medida" : `desde ${textoHace(Math.max(0, Date.now() - p.desde))}`}
            </p>
            {p.detalle ? <p className="mt-1 text-xs text-white/50">{p.detalle}</p> : null}
            {p.progreso !== null && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-white/10">
                    <div
                        className="h-full bg-cyan-400"
                        style={{ width: `${Math.min(100, Math.max(0, Math.round(p.progreso * 100)))}%` }}
                    />
                </div>
            )}
            <p className="mt-1 text-[11px] text-white/45">Fuente: {p.fuente}</p>
        </li>
    );
}
