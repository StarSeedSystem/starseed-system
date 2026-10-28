"use client";

/**
 * Pilar «Procesos activos» (CB1013N, §7). Lee `leerProcesos()` al montarse y
 * cada `intervaloSeg` de las preferencias solo con la pestaña visible.
 * Arriba, los filtros por tipo con sus cuentas reales; debajo, la lista
 * agrupada; luego `<ProcesosHardware />` (CB1013O) y `<ProcesosAjustes />`
 * (CB1013P) plegables; al pie, las fuentes con ✓/✗ y su motivo. Cada número
 * sale de una medida real: lo que no se midió dice «sin medida», nunca un 0.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    ETIQUETA_TIPO,
    hardwareDesdeNodo,
    type HardwareServidor,
    type ProcesoActivo,
    type TipoProceso,
} from "@/lib/cerebros/procesos";
import { filtrarProcesos, tiposVisibles, ventanaDeProceso } from "@/lib/cerebros/procesos-filtros";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEstadoActualizaciones } from "@/components/actualizaciones/use-estado-actualizaciones";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const ETIQUETA_ESTADO = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
} as const;

type Lectura = Awaited<ReturnType<typeof leerProcesos>>;

function FilaProceso({ p }: { p: ProcesoActivo }) {
    const desdeMs = p.desde;
    const desde = desdeMs == null ? null : new Date(desdeMs);
    const ventana = ventanaDeProceso(p.id);
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="break-normal hyphens-none text-sm font-medium text-white/85">{p.nombre}</p>
            <p className="mt-1 text-xs text-white/60">
                {ETIQUETA_ESTADO[p.estado]} · corre en {p.donde}
                {p.detalle ? ` · ${p.detalle}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
                Fuente: {p.fuente}
                {p.progreso == null
                    ? " · progreso sin medida"
                    : ` · ${Math.round(p.progreso * 100)} %`}
                {desdeMs != null
                    ? ` · desde hace ${textoHace(Date.now() - desdeMs)}`
                    : ""}
            </p>
            {p.progreso != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full rounded-full bg-cyan-500"
                        style={{ width: `${Math.round(p.progreso * 100)} %` }}
                    />
                </div>
            )}
            <AccionesProceso p={p} ventana={ventana} />
        </li>
    );
}

export interface ProcesosPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const [lectura, setLectura] = useState<Lectura | null>(null);
    const [hardware, setHardware] = useState<HardwareServidor[]>([]);
    const [ultima, setUltima] = useState<number | null>(null);
    const [activos, setActivos] = useState<TipoProceso[]>([]);
    const { prefs } = usarPreferenciasProcesos();
    const presencia = usePresenciaNeuronas();
    const actualizaciones = useEstadoActualizaciones();

    const leer = useCallback(async () => {
        if (document.visibilityState !== "visible") return;
        const ini = Date.now();
        const r = await leerProcesos({ atrasos: actualizaciones.atrasos, presencia });
        const estado = await leerEstadoAutonomo(ini).catch(() => null);
        const extra: HardwareServidor[] = [];
        if (estado?.ok) {
            for (const nodo of estado.estado.nodos) {
                const h = hardwareDesdeNodo(nodo, ini);
                if (h) extra.push(h);
            }
        }
        setLectura(r);
        setHardware([...r.hardware, ...extra]);
        setUltima(Date.now());
    }, [actualizaciones.atrasos, presencia]);

    const leerRef = useRef(leer);
    leerRef.current = leer;

    useEffect(() => {
        const ir = setInterval(() => {
            if (document.visibilityState === "visible") void leerRef.current();
        }, Math.max(5, prefs.intervaloSeg) * 1000);
        return () => clearInterval(ir);
    }, [prefs.intervaloSeg]);

    useEffect(() => {
        void leerRef.current();
    }, [actualizaciones.atrasos, presencia, prefs.tipos]);

    const tipos = tiposVisibles(prefs.tipos, Object.keys(ETIQUETA_TIPO) as TipoProceso[]);
    const procesos = lectura ? filtrarProcesos(lectura.procesos, activos) : [];

    return (
        <div className="space-y-5">
            <section aria-label="Filtros por tipo" className="flex flex-wrap gap-2">
                {tipos.map((tipo) => {
                    const cuenta = lectura?.procesos.filter((p) => p.tipo === tipo).length ?? 0;
                    const pulsado = activos.includes(tipo);
                    return (
                        <button
                            key={tipo}
                            type="button"
                            aria-pressed={pulsado}
                            title="Filtrar la lista por este tipo"
                            onClick={() =>
                                setActivos((v) =>
                                    v.includes(tipo) ? v.filter((x) => x !== tipo) : [...v, tipo],
                                )
                            }
                            className="cursor-pointer whitespace-normal h-auto rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 aria-pressed:bg-cyan-500/25 aria-pressed:text-cyan-200"
                        >
                            {ETIQUETA_TIPO[tipo]} · {cuenta}
                        </button>
                    );
                })}
            </section>

            <section aria-label="Procesos activos" className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Procesos activos</h3>
                {procesos.length === 0 ? (
                    <p className="text-sm text-white/60">
                        {lectura === null
                            ? "Leyendo los procesos activos de todas las fuentes…"
                            : "Ninguna fuente informó de procesos activos ahora mismo."}
                    </p>
                ) : (
                    tipos.map((tipo) => {
                        const delTipo = procesos.filter((p) => p.tipo === tipo);
                        if (!delTipo.length) return null;
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

            <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-white">Hardware de los servidores vinculados</h3>
                    <span className="text-[11px] text-white/45">
                        {ultima == null ? "sin lectura" : `última lectura hace ${textoHace(Date.now() - ultima)}`}
                    </span>
                </div>
                {hardware.length === 0 ? (
                    <p className="text-sm text-white/60">
                        Sin medida: ningún servidor o neurona respondió. La medida de esta Mac solo está
                        disponible en la propia Mac o con sesión de MetaGenesis.
                    </p>
                ) : (
                    <ProcesosHardware
                        hardware={hardware}
                        umbrales={prefs.umbrales}
                        ocultos={prefs.ocultos}
                    />
                )}
            </section>

            <details className="rounded-lg border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white">Ajustes del panel</summary>
                <div className="mt-3 space-y-2">
                    <ProcesosAjustes brainId={brainId} />
                </div>
            </details>

            <details className="rounded-lg border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white">Fuentes consultadas</summary>
                <ul className="mt-3 space-y-1 text-xs text-white/60">
                    {lectura?.fuentes.map((f) => (
                        <li key={f.nombre}>
                            {f.ok ? "✓" : "✗"} {f.nombre} · {f.ms} ms
                            {!f.ok && f.motivo ? ` · ${f.motivo}` : ""}
                        </li>
                    ))}
                </ul>
            </details>

            <p>
                <button
                    type="button"
                    onClick={() => void leerRef.current()}
                    className="cursor-pointer whitespace-normal h-auto rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/25"
                >
                    Actualizar
                </button>
            </p>
        </div>
    );
}

function AccionesProceso({
    p,
    ventana,
}: {
    p: ProcesoActivo;
    ventana: ReturnType<typeof ventanaDeProceso>;
}) {
    if (p.tipo === "genesis") {
        return (
            <p className="mt-2">
                <a
                    href="/genesis"
                    className="cursor-pointer text-xs font-medium text-cyan-300 underline-offset-2 hover:underline"
                >
                    Abrir en Genesis
                </a>
                <span className="ml-2 text-[11px] text-white/40">se abre en esta Mac</span>
            </p>
        );
    }
    if (p.tipo === "app-fondo" && ventana) {
        return (
            <p className="mt-2">
                <button
                    type="button"
                    onClick={() => setWindowMinimized(ventana.escritorio, ventana.ventana, false)}
                    className="cursor-pointer whitespace-normal h-auto text-xs font-medium text-cyan-300 underline-offset-2 hover:underline"
                >
                    Restaurar ventana
                </button>
            </p>
        );
    }
    return null;
}
