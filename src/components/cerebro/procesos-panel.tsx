"use client";

/**
 * Pilar «Procesos activos» (CB1013N, §7). Lee `leerProcesos()` al montar y cada
 * `intervaloSeg` de las preferencias (CB1013P), solo con la pestaña visible.
 * Arriba, cuentas reales por tipo como filtros pulsables (respetando los tipos
 * visibles de las preferencias); debajo, la lista agrupada por tipo con las
 * acciones que ya existen. Luego el hardware (CB1013O) y los ajustes (CB1013P)
 * plegados, y al pie las fuentes consultadas con su hora. Cada número sale de
 * una medida real: lo que no se mide dice «sin medida», nunca un 0.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import {
    ETIQUETA_TIPO,
    type HardwareServidor,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { textoHace } from "@/lib/metagenesis/remoto";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const ETIQUETA_ESTADO: Record<ProcesoActivo["estado"], string> = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
};

type Lectura = Awaited<ReturnType<typeof leerProcesos>>;

/** Ids de ventana del store: «ventana:<escritorio>:<ventana>». */
function ventanaDe(id: string): { escritorioId: string; ventanaId: string } | null {
    const partes = id.split(":");
    if (partes[0] !== "ventana" || partes.length < 3) return null;
    return { escritorioId: partes[1], ventanaId: partes.slice(2).join(":") };
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const { prefs } = usarPreferenciasProcesos();
    const [lectura, setLectura] = useState<Lectura | null>(null);
    const [cargando, setCargando] = useState(true);
    const [filtros, setFiltros] = useState<TipoProceso[]>([]);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
    const [actualizadoEn, setActualizadoEn] = useState<number | null>(null);

    const tiposVisibles = useMemo<TipoProceso[]>(
        () => (prefs.tipos.length > 0 ? prefs.tipos : (Object.keys(ETIQUETA_TIPO) as TipoProceso[])),
        [prefs.tipos],
    );

    const leer = useCallback(async () => {
        setCargando(true);
        const r = await leerProcesos();
        setLectura(r);
        setActualizadoEn(Date.now());
        setCargando(false);
    }, []);

    // Lectura al montar.
    useEffect(() => {
        void leer();
    }, [leer]);

    // Lectura periódica SOLO con la pestaña visible.
    useEffect(() => {
        const ms = Math.max(5, prefs.intervaloSeg) * 1000;
        const t = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "visible") void leer();
        }, ms);
        return () => clearInterval(t);
    }, [prefs.intervaloSeg, leer]);

    const filtrados = useMemo(() => {
        if (!lectura) return null;
        const activos: TipoProceso[] = filtros.length > 0 ? filtros : tiposVisibles;
        return lectura.procesos.filter((p) => activos.includes(p.tipo));
    }, [lectura, filtros, tiposVisibles]);

    if (!lectura) {
        return (
            <p className="flex items-center gap-2 text-sm text-white/60" aria-live="polite">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Leyendo los procesos activos…
            </p>
        );
    }
    return (
        <div className="space-y-6">
            <Cabecera cargando={cargando} actualizadoEn={actualizadoEn} onActualizar={leer} />
            <CuentasTipos
                procesos={lectura.procesos}
                visibles={tiposVisibles}
                filtros={filtros}
                alPulsar={(tipo) =>
                    setFiltros((f) => (f.includes(tipo) ? f.filter((x) => x !== tipo) : [...f, tipo]))
                }
            />
            <ListaProcesos procesos={filtrados ?? []} />
            <SeccionHardware hardware={lectura.hardware} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />
            <AjustesPlegados abiertos={ajustesAbiertos} alCambiar={setAjustesAbiertos} brainId={brainId} />
            <FuentesLista fuentes={lectura.fuentes} />
        </div>
    );
}

function Cabecera({ cargando, actualizadoEn, onActualizar }: {
    cargando: boolean;
    actualizadoEn: number | null;
    onActualizar: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-white/60" aria-live="polite">
                Última lectura:{" "}
                {actualizadoEn == null
                    ? "sin medida"
                    : new Date(actualizadoEn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <button
                type="button"
                onClick={onActualizar}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-normal rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10"
            >
                <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                Actualizar
            </button>
        </div>
    );
}

function CuentasTipos({ procesos, visibles, filtros, alPulsar }: {
    procesos: ProcesoActivo[];
    visibles: TipoProceso[];
    filtros: TipoProceso[];
    alPulsar: (tipo: TipoProceso) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de proceso">
            {visibles.map((tipo) => {
                const cuenta = procesos.filter((p) => p.tipo === tipo).length;
                const activo = filtros.includes(tipo);
                return (
                    <button
                        key={tipo}
                        type="button"
                        onClick={() => alPulsar(tipo)}
                        aria-pressed={activo}
                        title={`Filtrar por ${ETIQUETA_TIPO[tipo]}`}
                        className={`cursor-pointer whitespace-normal rounded-full border px-3 py-1 text-xs transition-colors ${
                            activo
                                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                                : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                        }`}
                    >
                        {ETIQUETA_TIPO[tipo]}
                        <span className="ml-1.5 font-mono">{cuenta}</span>
                    </button>
                );
            })}
        </div>
    );
}

function AccionesProceso({ p }: { p: ProcesoActivo }) {
    const ventana = p.fuente === "readDesktopsSnapshot()" ? ventanaDe(p.id) : null;
    if (p.tipo === "genesis") {
        return (
            <Link
                href="/genesis"
                className="inline-flex cursor-pointer items-center gap-1 whitespace-normal rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80 transition-colors hover:bg-white/10"
            >
                Abrir Genesis
            </Link>
        );
    }
    if (ventana) {
        return (
            <button
                type="button"
                onClick={() => setWindowMinimized(ventana.escritorioId, ventana.ventanaId, false)}
                className="cursor-pointer whitespace-normal rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80 transition-colors hover:bg-white/10"
            >
                Restaurar ventana
            </button>
        );
    }
    return null;
}

function FilaProceso({ p, ahora }: { p: ProcesoActivo; ahora: number }) {
    const desdeTexto = p.desde == null || p.desde > ahora
        ? "desde: sin medida"
        : `desde ${textoHace(ahora - p.desde)}`;
    return (
        <li className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-white/90">{p.nombre}</p>
            <p className="text-xs text-white/65">
                <span>{ETIQUETA_ESTADO[p.estado]}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span>Corre en {p.donde}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span>{desdeTexto}</span>
                {p.detalle ? (
                    <>
                        <span className="mx-1.5 text-white/30">·</span>
                        <span>{p.detalle}</span>
                    </>
                ) : null}
            </p>
            {p.progreso != null && (
                <div
                    role="progressbar"
                    aria-label={`Progreso de ${p.nombre}`}
                    aria-valuenow={Math.round(p.progreso * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                >
                    <div
                        className="h-full rounded-full bg-cyan-400/80"
                        style={{ width: `${Math.max(1, Math.min(100, Math.round(p.progreso * 100)))}%` }}
                    />
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-white/45">Fuente: {p.fuente}</span>
                <AccionesProceso p={p} />
            </div>
        </li>
    );
}

function ListaProcesos({ procesos }: { procesos: ProcesoActivo[] }) {
    const ahora = Date.now();
    const porTipo = new Map<TipoProceso, ProcesoActivo[]>();
    for (const p of procesos) {
        const grupo = porTipo.get(p.tipo);
        if (grupo) grupo.push(p);
        else porTipo.set(p.tipo, [p]);
    }
    const tiposOrden = (Object.keys(ETIQUETA_TIPO) as TipoProceso[]).filter((t) => porTipo.has(t));
    if (tiposOrden.length === 0) {
        return <p className="text-sm text-white/60">Ningún proceso activo en este filtro.</p>;
    }
    return (
        <div className="space-y-4">
            {tiposOrden.map((tipo) => (
                <section key={tipo} aria-label={ETIQUETA_TIPO[tipo]} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        {ETIQUETA_TIPO[tipo]}
                        <span className="ml-2 font-mono normal-case">{porTipo.get(tipo)!.length}</span>
                    </h4>
                    <ul className="space-y-2">
                        {porTipo.get(tipo)!.map((p) => <FilaProceso key={p.id} p={p} ahora={ahora} />)}
                    </ul>
                </section>
            ))}
        </div>
    );
}

function SeccionHardware({ hardware, umbrales, ocultos }: {
    hardware: HardwareServidor[];
    umbrales: { cpu: number; ram: number; disco: number; bateria: number };
    ocultos: string[];
}) {
    return (
        <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
            <h3 className="text-sm font-semibold text-white/90">Hardware de los servidores vinculados</h3>
            {hardware.length === 0 ? (
                <p className="text-sm text-white/60">
                    Sin medida en este aparato: ninguna respuesta de hardware llegó a esta lectura.
                </p>
            ) : (
                <ProcesosHardware hardware={hardware} umbrales={umbrales} ocultos={ocultos} />
            )}
        </section>
    );
}

function AjustesPlegados({ abiertos, alCambiar, brainId }: {
    abiertos: boolean;
    alCambiar: (v: boolean) => void;
    brainId: string | null;
}) {
    return (
        <section aria-label="Ajustes de procesos" className="space-y-2">
            <button
                type="button"
                onClick={() => alCambiar(!abiertos)}
                aria-expanded={abiertos}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-normal rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10"
            >
                <SlidersHorizontal className="size-4" aria-hidden />
                Ajustes {abiertos ? "↑" : "↓"}
            </button>
            {abiertos && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <ProcesosAjustes brainId={brainId} />
                </div>
            )}
        </section>
    );
}

function FuentesLista({ fuentes }: {
    fuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }>;
}) {
    return (
        <section aria-label="Fuentes consultadas" className="rounded-xl border border-white/10 bg-black/20 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Fuentes consultadas</h3>
            <ul className="mt-2 space-y-1">
                {fuentes.map((f) => (
                    <li key={f.nombre} className="text-xs text-white/65" title={f.motivo ?? f.nombre}>
                        <span aria-hidden>{f.ok ? "✓" : "✗"}</span> {f.nombre}
                        <span className="mx-1 text-white/30">·</span>
                        <span className="font-mono">{f.ms} ms</span>
                        {f.motivo ? <span className="ml-1 text-white/50">·{f.motivo}</span> : null}
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[11px] text-white/45">
                Las fuentes de Genesis solo responden en la Mac o con sesión de MetaGenesis: en otro
                aparato dicen «no disponible aquí».
            </p>
        </section>
    );
}
