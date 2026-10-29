"use client";

/**
 * Pilar «Procesos activos» (CB1013J–Q, §7 del contrato de cerebros).
 *
 * Lee las fuentes reales con `leerProcesos()` al montar y cada `intervaloSeg`
 * de las preferencias, solo con la pestaña visible. Cada número es una medida:
 * si una fuente no responde se dice «sin medida» y su motivo, nunca un 0.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    avisosHardware,
    ETIQUETA_TIPO,
    type AvisoHardware,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { agruparPorTipo, type ProcesosPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

export const TIPOS_PROCESO = Object.keys(ETIQUETA_TIPO) as TipoProceso[];

const ETIQUETA_ESTADO: Record<ProcesoActivo["estado"], string> = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
};

const ETIQUETA_MEDIDA: Record<AvisoHardware["medida"], string> = {
    cpu: "CPU",
    ram: "RAM",
    disco: "disco",
    bateria: "batería",
};

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export type CuentasPorTipo = Partial<Record<TipoProceso, number>>;

/** Tipos que se pueden enseñar: si la preferencia está vacía, todos. */
export function tiposVisibles(tipos: TipoProceso[]): TipoProceso[] {
    return tipos.length === 0 ? TIPOS_PROCESO : TIPOS_PROCESO.filter((t) => tipos.includes(t));
}

/** Cuenta real por tipo; los tipos visibles sin procesos aparecen con 0. */
export function contarPorTipo(procesos: ProcesoActivo[], visibles: TipoProceso[]): CuentasPorTipo {
    const cuentas: CuentasPorTipo = {};
    for (const tipo of visibles) cuentas[tipo] = 0;
    for (const proceso of procesos) {
        if (cuentas[proceso.tipo] !== undefined) cuentas[proceso.tipo] = (cuentas[proceso.tipo] ?? 0) + 1;
    }
    return cuentas;
}

/** Filtra por los tipos visibles y, si hay uno elegido, por ese tipo. */
export function filtrarProcesos(
    procesos: ProcesoActivo[],
    visibles: TipoProceso[],
    activo: TipoProceso | null,
): ProcesoActivo[] {
    const permitidos = activo ? visibles.filter((t) => t === activo) : visibles;
    return procesos.filter((p) => permitidos.includes(p.tipo));
}

export function agruparVisibles(
    procesos: ProcesoActivo[],
    visibles: TipoProceso[],
    activo: TipoProceso | null,
): ProcesosPorTipo {
    return agruparPorTipo(filtrarProcesos(procesos, visibles, activo));
}

/** El id de una ventana minimizada es `ventana:<escritorio>:<ventana>`. */
export function parsearVentana(id: string): { desktopId: string; windowId: string } | null {
    const prefijo = "ventana:";
    if (!id.startsWith(prefijo)) return null;
    const resto = id.slice(prefijo.length);
    const corte = resto.indexOf(":");
    if (corte <= 0 || corte === resto.length - 1) return null;
    return { desktopId: resto.slice(0, corte), windowId: resto.slice(corte + 1) };
}

/** Progreso 0..1 → porcentaje entero 0..100; null se queda null (sin medida). */
export function progresoPct(progreso: number | null): number | null {
    if (progreso == null || !Number.isFinite(progreso)) return null;
    return Math.max(0, Math.min(100, Math.round(progreso * 100)));
}

export function textoDesde(desde: number | null, ahora: number): string {
    if (desde == null || !Number.isFinite(desde)) return "desde sin medida";
    return `desde ${textoHace(ahora - desde)}`;
}

export function horaDeLectura(momento: number | null): string {
    if (momento == null) return "sin lectura";
    return new Date(momento).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

export function motivoFuente(fuente: { ok: boolean; motivo?: string }): string {
    if (fuente.ok) return "";
    return fuente.motivo?.trim() || "sin respuesta";
}

function FilaProceso({
    proceso,
    ahora,
    onRestaurar,
}: {
    proceso: ProcesoActivo;
    ahora: number;
    onRestaurar: (proceso: ProcesoActivo) => void;
}) {
    const progreso = progresoPct(proceso.progreso);
    const ventana = parsearVentana(proceso.id);
    return (
        <li className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/90">{proceso.nombre}</p>
                    <p className="mt-1 text-xs text-white/60">
                        {ETIQUETA_ESTADO[proceso.estado]} · {proceso.donde} · {textoDesde(proceso.desde, ahora)}
                    </p>
                    {proceso.detalle && <p className="mt-1 text-xs text-white/50">{proceso.detalle}</p>}
                </div>
                {proceso.tipo === "genesis" && (
                    <a
                        href="/genesis"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs text-cyan-100 transition-colors hover:bg-cyan-400/20 cursor-pointer whitespace-normal h-auto"
                    >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Abrir Genesis
                    </a>
                )}
                {ventana && (
                    <button
                        type="button"
                        onClick={() => onRestaurar(proceso)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 cursor-pointer whitespace-normal h-auto"
                    >
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Restaurar ventana
                    </button>
                )}
            </div>
            <p className="mt-2 text-[11px] text-white/45">Fuente: {proceso.fuente}</p>
            {progreso !== null && (
                <div className="mt-2">
                    <div
                        className="h-1.5 overflow-hidden rounded-full bg-white/10"
                        role="progressbar"
                        aria-label={`Progreso de ${proceso.nombre}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progreso}
                    >
                        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progreso}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-white/45">{progreso} %</p>
                </div>
            )}
        </li>
    );
}

type LecturaProcesos = Awaited<ReturnType<typeof leerProcesos>>;

export default function ProcesosPanel({ brainId, brainName }: ProcesosPanelProps) {
    const { prefs } = usarPreferenciasProcesos();
    const [datos, setDatos] = useState<LecturaProcesos | null>(null);
    const [cargando, setCargando] = useState(false);
    const [ultima, setUltima] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tipoActivo, setTipoActivo] = useState<TipoProceso | null>(null);
    const [avisoAccion, setAvisoAccion] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        if (document.visibilityState !== "visible") return;
        setCargando(true);
        setError(null);
        try {
            const lectura = await leerProcesos();
            setDatos(lectura);
            setUltima(Date.now());
        } catch {
            setError("No se pudieron leer las fuentes de procesos.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        let cancelado = false;
        const leer = async () => {
            if (document.visibilityState !== "visible") return;
            setCargando(true);
            try {
                const lectura = await leerProcesos();
                if (cancelado) return;
                setDatos(lectura);
                setUltima(Date.now());
                setError(null);
            } catch {
                if (!cancelado) setError("No se pudieron leer las fuentes de procesos.");
            } finally {
                if (!cancelado) setCargando(false);
            }
        };
        void leer();
        const id = window.setInterval(() => {
            if (document.visibilityState === "visible") void leer();
        }, Math.max(5, prefs.intervaloSeg) * 1000);
        const alCambiar = () => {
            if (document.visibilityState === "visible") void leer();
        };
        document.addEventListener("visibilitychange", alCambiar);
        return () => {
            cancelado = true;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", alCambiar);
        };
    }, [prefs.intervaloSeg]);

    const ahora = Date.now();
    const visibles = tiposVisibles(prefs.tipos);
    const tipoValido = tipoActivo && visibles.includes(tipoActivo) ? tipoActivo : null;
    const procesos = datos?.procesos ?? [];
    const cuentas = contarPorTipo(procesos, visibles);
    const grupos = agruparVisibles(procesos, visibles, tipoValido);
    const total = filtrarProcesos(procesos, visibles, null).length;
    const hardware = datos?.hardware ?? [];
    const fuentes = datos?.fuentes ?? [];
    const hardwareVisible = hardware.filter((h) => !prefs.ocultos.includes(h.id));
    const avisos = avisosHardware(hardwareVisible, prefs.umbrales);

    const restaurar = (proceso: ProcesoActivo) => {
        const ventana = parsearVentana(proceso.id);
        if (!ventana) return;
        setWindowMinimized(ventana.desktopId, ventana.windowId, false);
        setDatos((prev) =>
            prev ? { ...prev, procesos: prev.procesos.filter((p) => p.id !== proceso.id) } : prev,
        );
        setAvisoAccion(`Ventana «${proceso.nombre}» restaurada en el escritorio.`);
    };

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white">Procesos activos</h2>
                    <p className="mt-1 text-xs text-white/55">
                        Lo que está vivo ahora mismo en la cuenta y en los servidores vinculados
                        {brainName ? ` · cerebro ${brainName}` : ""}. Cada medida lleva su fuente.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-white/50" aria-live="polite">
                        Última lectura: {horaDeLectura(ultima)}
                    </span>
                    <button
                        type="button"
                        onClick={() => void cargar()}
                        disabled={cargando}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:opacity-50 cursor-pointer whitespace-normal h-auto"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", cargando && "animate-spin")} aria-hidden />
                        {cargando ? "Actualizando…" : "Actualizar"}
                    </button>
                </div>
            </header>

            {error && (
                <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                    {error}
                </p>
            )}
            {avisoAccion && (
                <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                    {avisoAccion}
                </p>
            )}

            <section aria-label="Filtros por tipo de proceso" className="space-y-2">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setTipoActivo(null)}
                        aria-pressed={tipoValido === null}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer whitespace-normal h-auto",
                            tipoValido === null
                                ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                                : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
                        )}
                    >
                        Todos
                        <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[11px] tabular-nums">{total}</span>
                    </button>
                    {visibles.map((tipo) => (
                        <button
                            key={tipo}
                            type="button"
                            onClick={() => setTipoActivo(tipoValido === tipo ? null : tipo)}
                            aria-pressed={tipoValido === tipo}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer whitespace-normal h-auto",
                                tipoValido === tipo
                                    ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                                    : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
                            )}
                        >
                            {ETIQUETA_TIPO[tipo]}
                            <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[11px] tabular-nums">
                                {cuentas[tipo] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-white/45">
                    Las cuentas son reales: un 0 significa que esa fuente no informó de ningún proceso de ese tipo.
                </p>
            </section>

            <section aria-label="Lista de procesos activos" className="space-y-3">
                {datos === null ? (
                    <p className="text-sm text-white/60">
                        {cargando ? "Leyendo las fuentes de procesos…" : "Sin lectura todavía. Pulsa «Actualizar» cuando la pestaña esté visible."}
                    </p>
                ) : total === 0 ? (
                    <p className="text-sm text-white/60">
                        {tipoValido
                            ? `No hay procesos del tipo «${ETIQUETA_TIPO[tipoValido]}» ahora mismo.`
                            : "Ninguna fuente informó de procesos activos ahora mismo."}
                    </p>
                ) : (
                    TIPOS_PROCESO.map((tipo) => {
                        if (!visibles.includes(tipo)) return null;
                        const lista = grupos[tipo];
                        if (!lista?.length) return null;
                        return (
                            <div key={tipo} className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                                    {ETIQUETA_TIPO[tipo]} · {lista.length}
                                </h3>
                                <ul className="space-y-2">
                                    {lista.map((proceso) => (
                                        <FilaProceso
                                            key={proceso.id}
                                            proceso={proceso}
                                            ahora={ahora}
                                            onRestaurar={restaurar}
                                        />
                                    ))}
                                </ul>
                            </div>
                        );
                    })
                )}
            </section>

            <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Hardware de los servidores vinculados</h3>
                {datos === null ? (
                    <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
                ) : hardware.length === 0 ? (
                    <p className="text-sm text-white/60">
                        Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está
                        disponible en la propia Mac o con sesión de MetaGenesis.
                    </p>
                ) : hardwareVisible.length === 0 ? (
                    <p className="text-sm text-white/60">Todos los servidores están ocultos en los ajustes de procesos.</p>
                ) : (
                    <>
                        {avisos.length > 0 && (
                            <ul aria-label="Avisos de hardware" className="space-y-1.5">
                                {avisos.map((aviso) => (
                                    <li
                                        key={`${aviso.servidor}:${aviso.medida}`}
                                        className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-xs text-amber-100"
                                    >
                                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                                        <span>
                                            {aviso.servidor}: {ETIQUETA_MEDIDA[aviso.medida]} al {aviso.valor} % (umbral{" "}
                                            {aviso.umbral} %).
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <ProcesosHardware
                            hardware={hardwareVisible}
                            umbrales={prefs.umbrales}
                            ocultos={prefs.ocultos}
                        />
                    </>
                )}
            </section>

            <details className="rounded-xl border border-white/10 bg-black/20">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-white/80">
                    Ajustes de procesos
                </summary>
                <div className="border-t border-white/10 p-4">
                    <ProcesosAjustes brainId={brainId} />
                </div>
            </details>

            <footer aria-label="Fuentes consultadas" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">Fuentes consultadas</h3>
                    <span className="text-[11px] text-white/45">Última lectura: {horaDeLectura(ultima)}</span>
                </div>
                {fuentes.length === 0 ? (
                    <p className="text-sm text-white/60">Sin fuentes registradas todavía.</p>
                ) : (
                    <ul className="space-y-1">
                        {fuentes.map((fuente) => (
                            <li key={fuente.nombre} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px]">
                                <span aria-hidden className={fuente.ok ? "text-emerald-300" : "text-red-300"}>
                                    {fuente.ok ? "✓" : "✗"}
                                </span>
                                <span className="text-white/70">{fuente.nombre}</span>
                                <span className="text-white/45">
                                    {fuente.ok ? `${fuente.ms} ms` : motivoFuente(fuente)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </footer>
        </div>
    );
}
