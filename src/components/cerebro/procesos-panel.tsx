"use client";

/**
 * Pilar «Procesos activos» (CB1013N, §7 de architecture/cerebros-fusion-telepatia.md).
 * Lee de verdad con `leerProcesos()` al montarse y cada `intervaloSeg` de las
 * preferencias, SOLO con la pestaña visible. Cada número sale de una medida real:
 * lo que no se mide se dice «sin medida», nunca un 0 inventado.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    avisosHardware,
    ETIQUETA_TIPO,
    type HardwareServidor,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { textoHace } from "@/lib/metagenesis/remoto";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const ETIQUETA_ESTADO = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
} as const;

const ETIQUETA_MEDIDA = { cpu: "CPU", ram: "RAM", disco: "Disco", bateria: "Batería" } as const;

function avisoEnPalabras(medida: string, valor: number, umbral: number): string {
    const base = `${medida} en ${Math.round(valor * 10) / 10} %`;
    return medida === "Batería"
        ? `${base} (por debajo de ${umbral} % y sin cargar)`
        : `${base} (por encima de ${umbral} %)`;
}

/** `ventana:<escritorio>:<ventana>` → ids para desktop-store; null si no es restaurable. */
function idsRestauracion(id: string): { escritorio: string; ventana: string } | null {
    const partes = id.split(":");
    if (partes[0] !== "ventana" || partes.length < 3) return null;
    return { escritorio: partes[1], ventana: partes.slice(2).join(":") };
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

type LecturaProcesos = Awaited<ReturnType<typeof leerProcesos>>;

function AccionesProceso({ p, onAccion }: { p: ProcesoActivo; onAccion: (accion: string) => void }) {
    const ids = p.id.startsWith("ventana:") ? idsRestauracion(p.id) : null;
    if (p.tipo === "genesis") {
        return (
            <Link
                href="/genesis"
                className="text-xs underline-offset-2 hover:underline cursor-pointer whitespace-normal h-auto"
                onClick={() => onAccion("genesis")}
            >
                Abrir Genesis
            </Link>
        );
    }
    if (ids) {
        return (
            <button
                type="button"
                className="text-xs underline-offset-2 hover:underline cursor-pointer whitespace-normal h-auto"
                onClick={() => {
                    setWindowMinimized(ids.escritorio, ids.ventana, false);
                    onAccion("restaurar");
                }}
            >
                Restaurar ventana
            </button>
        );
    }
    return null;
}

function FilaProceso({ p, ahora, onAccion }: { p: ProcesoActivo; ahora: number; onAccion: (accion: string) => void }) {
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words text-white/85">{p.nombre}</p>
                    <p className="mt-1 text-sm break-words text-white/60">
                        En palabras: {ETIQUETA_ESTADO[p.estado]} · Corre en {p.donde}
                        {p.desde != null ? ` · Desde ${textoHace(ahora - p.desde)}` : ""}
                    </p>
                    {p.detalle ? <p className="text-xs break-words text-white/45">{p.detalle}</p> : null}
                    {p.progreso === null ? null : (
                        <div className="mt-2">
                            <div
                                className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-white/10"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(p.progreso * 1000) / 10}
                                aria-label={`Progreso de ${p.nombre}`}
                            >
                                <div
                                    className="h-full rounded-full bg-cyan-500/80 transition-[width,opacity] duration-200"
                                    style={{ width: `${Math.min(100, Math.max(0, p.progreso * 100))}%` }}
                                />
                            </div>
                            <p className="text-xs mt-1 text-white/50">{Math.round(p.progreso * 100)} % · medido</p>
                        </div>
                    )}
                </div>
                <div className="shrink-0 text-right">
                    <AccionesProceso p={p} onAccion={onAccion} />
                </div>
            </div>
        </li>
    );
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const [lectura, setLectura] = useState<LecturaProcesos | null>(null);
    const [ultimaLectura, setUltimaLectura] = useState<number | null>(null);
    const [leyendo, setLeyendo] = useState(false);
    const [filtro, setFiltro] = useState<TipoProceso[]>([]);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
    const { prefs } = usarPreferenciasProcesos();

    const leer = useCallback(() => {
        setLeyendo(true);
        return leerProcesos()
            .then((r) => {
                setLectura(r);
                setUltimaLectura(Date.now());
            })
            .catch(() => setLectura(null))
            .finally(() => setLeyendo(false));
    }, []);

    useEffect(() => { void leer(); }, [leer]);

    useEffect(() => {
        const id = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            void leer();
        }, prefs.intervaloSeg * 1000);
        return () => clearInterval(id);
    }, [leer, prefs.intervaloSeg]);

    const procesos = lectura?.procesos ?? [];
    const hardware = lectura?.hardware ?? [];
    const grupos = agruparPorTipo(procesos);
    const avisos = avisosHardware(hardware, prefs.umbrales);
    const ordenTipos = Object.keys(ETIQUETA_TIPO) as TipoProceso[];
    // Sin tipos elegidos en preferencias se ven todos; si hay lista, manda ella.
    const tiposVisibles = prefs.tipos.length === 0 ? ordenTipos : ordenTipos.filter((t) => prefs.tipos.includes(t));
    const gruposEnVista = tiposVisibles.filter((t) => filtro.length === 0 || filtro.includes(t));
    const horaLectura =
        ultimaLectura == null
            ? null
            : new Date(ultimaLectura).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const alternarFiltro = (t: TipoProceso) => {
        setFiltro((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    };
    const trasAccion = (accion: string) => {
        if (accion === "restaurar") void leer();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/60">
                    Última lectura: {horaLectura ?? "leyendo por primera vez"}
                    {lectura === null ? " · " : ""}
                </p>
                <button
                    type="button"
                    onClick={() => void leer()}
                    disabled={leyendo}
                    className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer whitespace-normal h-auto"
                >
                    {leyendo ? "Actualizando…" : "Actualizar"}
                </button>
            </div>

            {/* Cuentas reales por tipo, pulsables para filtrar la lista de abajo. */}
            <div role="group" aria-label="Cuentas por tipo de proceso" className="flex flex-wrap gap-2">
                {tiposVisibles.map((tipo) => {
                    const cuenta = grupos[tipo]?.length ?? 0;
                    if (cuenta === 0) return null;
                    const activo = filtro.includes(tipo);
                    return (
                        <button
                            key={tipo}
                            type="button"
                            aria-pressed={activo}
                            onClick={() => alternarFiltro(tipo)}
                            className={
                                (activo
                                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100 "
                                    : "border-white/15 bg-black/20 text-white/70 hover:bg-white/5 ") +
                                "rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer whitespace-normal break-words"
                            }
                        >
                            {ETIQUETA_TIPO[tipo]} · {cuenta}
                        </button>
                    );
                })}
                {leyendo ? <span className="self-center text-xs text-white/40">Leyendo fuentes…</span> : null}
            </div>

            {/* Lista agrupada por tipo: estado en palabras, dónde corre, desde cuándo y acción solo si existe. */}
            <section aria-label="Procesos activos" className="space-y-5">
                {lectura === null ? (
                    <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
                ) : procesos.length === 0 ? (
                    <p className="text-sm text-white/60">Ninguna fuente informó de procesos activos ahora mismo.</p>
                ) : (
                    gruposEnVista.map((tipo) => {
                        const delTipo = grupos[tipo];
                        if (!delTipo?.length) return null;
                        return (
                            <div key={tipo} className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                                    {ETIQUETA_TIPO[tipo]} · {delTipo.length}
                                </h3>
                                <ul className="space-y-3">
                                    {delTipo.map((p) => (
                                        <FilaProceso key={p.id} p={p} ahora={Date.now()} onAccion={trasAccion} />
                                    ))}
                                </ul>
                            </div>
                        );
                    })
                )}
            </section>

            {/* Hardware de los servidores vinculados, con los avisos por encima del umbral. */}
            <section aria-label="Hardware de los servidores vinculados" className="space-y-3">
                <h2 className="text-sm font-semibold text-white">Hardware de los servidores vinculados</h2>
                {hardware.length === 0 ? (
                    <p className="text-sm text-white/60">
                        Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está disponible en la propia Mac o con sesión de MetaGenesis.
                    </p>
                ) : (
                    <ProcesosHardware hardware={hardware} umbrales={prefs.umbrales} />
                )}
                {avisos.length > 0 ? (
                    <ul aria-label="Avisos por umbrales" className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
                        {avisos.map((a, i) => (
                            <li key={`${a.servidor}-${a.medida}-${i}`} className="text-sm break-words text-amber-100">
                                {avisoEnPalabras(`${ETIQUETA_MEDIDA[a.medida]} de ${a.servidor}`, a.valor, a.umbral)}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>

            {/* Ajustes (CB1013P), plegables para dejar el peso en los números. */}
            <section aria-label="Ajustes de procesos" className="space-y-3">
                <button
                    type="button"
                    aria-expanded={ajustesAbiertos}
                    onClick={() => setAjustesAbiertos((v) => !v)}
                    className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm transition-colors hover:bg-white/10 cursor-pointer whitespace-normal h-auto"
                >
                    {ajustesAbiertos ? "Ocultar ajustes" : "Mostrar ajustes"}
                </button>
                {ajustesAbiertos ? <ProcesosAjustes brainId={brainId} /> : null}
            </section>

            {/* Fuentes consultadas en esta lectura, con su resultado y motivo si falló. */}
            <section aria-label="Fuentes consultadas" className="space-y-2">
                <h2 className="text-sm font-semibold text-white">Fuentes consultadas</h2>
                {lectura === null || lectura.fuentes.length === 0 ? (
                    <p className="text-sm text-white/60">Ninguna fuente consultada todavía.</p>
                ) : (
                    <ul className="space-y-1">
                        {lectura.fuentes.map((f) => (
                            <li key={f.nombre} className="text-sm break-words text-white/60">
                                <span className={f.ok ? "text-emerald-300" : "text-rose-300"}>{f.ok ? "✓" : "✗"}</span> {f.nombre}
                                {" · "}
                                {f.ok ? `${Math.round(f.ms)} ms` : f.motivo?.trim() ? f.motivo.trim() : "fallo"}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
