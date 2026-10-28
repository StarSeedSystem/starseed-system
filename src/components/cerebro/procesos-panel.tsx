"use client";

/**
 * Pilar «Procesos activos» (CB1013N, §7). Lee `leerProcesos()` al montar y luego
 * cada `intervaloSeg` de las preferencias (CB1013P) SOLO con la pestaña visible.
 * Arriba, cuentas reales por tipo como filtros pulsables; debajo la lista
 * agrupada con acciones existentes (abrir Genesis y restaurar ventana); luego
 * el hardware con avisos (CB1013O) y los ajustes plegados (CB1013P). Al pie,
 * las fuentes consultadas con ✓/✗ y su motivo; sin medida, nunca un 0.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ETIQUETA_TIPO, type HardwareServidor, type ProcesoActivo, type TipoProceso } from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { focusWindow, setWindowMinimized } from "@/components/desktop/desktop-store";
import { textoHace } from "@/lib/metagenesis/remoto";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";

const ETIQUETA_ESTADO = { "en-marcha": "en marcha", esperando: "esperando", pausado: "pausado", fallando: "fallando" } as const;
const TODOS_TIPOS = Object.keys(ETIQUETA_TIPO) as TipoProceso[];

export interface FuentesLeidas { nombre: string; ok: boolean; ms: number; motivo?: string }
export interface DatosProcesos { procesos: ProcesoActivo[]; hardware: HardwareServidor[]; fuentes: FuentesLeidas[] }
export interface ProcesosPanelProps { brainId: string | null; brainName?: string }

/** Saca `{escritorio, ventana}` de un proceso con id `ventana:<escritorio>:<ventana>`. */
export function partesVentana(id: string): { escritorio: string; ventana: string } | null {
    if (!id.startsWith("ventana:")) return null;
    const resto = id.slice("ventana:".length);
    const i = resto.lastIndexOf(":");
    if (i <= 0 || resto.slice(0, i).trim() === "") return null;
    return { escritorio: resto.slice(0, i), ventana: resto.slice(i + 1) };
}

function controlarVentana(parsed: { escritorio: string; ventana: string }): void {
    setWindowMinimized(parsed.escritorio, parsed.ventana, false);
    focusWindow(parsed.escritorio, parsed.ventana);
}

function FilaProceso({ p }: { p: ProcesoActivo }) {
    const ventana = partesVentana(p.id);
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-white/85">{p.nombre}</p>
            <p className="mt-1 text-xs text-white/60">
                {ETIQUETA_ESTADO[p.estado]} · {p.donde || "sin medida"}
                {p.detalle ? ` · ${p.detalle}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
                Fuente: {p.fuente} · progreso {p.progreso == null ? "sin medida" : `${Math.round(p.progreso * 100)} %`}
                {p.desde != null ? ` · desde ${textoHace(Date.now() - p.desde)}` : ""}
            </p>
            {p.progreso != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
                    <div className="h-full rounded bg-cyan-400/70" style={{ width: `${Math.min(100, Math.max(0, Math.round(p.progreso * 100)))}%` }} />
                </div>
            )}
            {p.tipo === "genesis" && (
                <Link href="/genesis" className="mt-2 inline-block text-xs text-cyan-300 underline cursor-pointer whitespace-normal h-auto">
                    Abrir Genesis
                </Link>
            )}
            {ventana && (
                <button
                    type="button"
                    onClick={() => controlarVentana(ventana)}
                    className="mt-2 inline-block text-xs text-cyan-300 underline cursor-pointer whitespace-normal h-auto"
                >
                    Restaurar ventana
                </button>
            )}
        </li>
    );
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const { prefs } = usarPreferenciasProcesos();
    const [datos, setDatos] = useState<DatosProcesos | null>(null);
    const [ultima, setUltima] = useState<number | null>(null);
    const [filtro, setFiltro] = useState<TipoProceso | null>(null);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

    // Solo hay una lectura en curso a la vez; si la pestaña oculta, no se lee.
    const leer = useCallback(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        let vivo = true;
        void leerProcesos().then((r) => { if (vivo) { setDatos(r); setUltima(Date.now()); } }).catch(() => {});
        return () => { vivo = false; };
    }, []);
    useEffect(() => { const c = leer(); return () => c?.(); }, [leer]);
    useEffect(() => {
        const t = setInterval(() => { if (document.visibilityState === "visible") leer(); }, Math.max(5, prefs.intervaloSeg) * 1000);
        document.addEventListener("visibilitychange", alVolver);
        function alVolver(): void { if (document.visibilityState === "visible") leer(); }
        return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
    }, [leer, prefs.intervaloSeg]);

    const visibles = prefs.tipos.length > 0 ? prefs.tipos : TODOS_TIPOS;
    const procesos = datos?.procesos ?? null;
    const grupos = procesos ? agruparPorTipo(procesos) : {};
    const cuentas = new Map<TipoProceso, number>();
    if (procesos) for (const p of procesos) cuentas.set(p.tipo, (cuentas.get(p.tipo) ?? 0) + 1);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Procesos activos</h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-white/55">Última lectura: {ultima ? textoHace(ultima) : "leyendo…"}</span>
                    <button type="button" onClick={leer} className="rounded border border-cyan-400/40 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-500/15 cursor-pointer whitespace-normal h-auto">Actualizar</button>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {visibles.map((tipo) => (
                    <button key={tipo} type="button" onClick={() => setFiltro(filtro === tipo ? null : tipo)} className={`rounded-full border px-3 py-1 text-xs cursor-pointer whitespace-normal h-auto ${filtro === tipo ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}>
                        {ETIQUETA_TIPO[tipo]} · {cuentas.get(tipo) ?? 0}
                    </button>
                ))}
            </div>
            {procesos === null ? (
                <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
            ) : procesos.length === 0 ? (
                <p className="text-sm text-white/60">Ninguna fuente informó de procesos activos ahora mismo.</p>
            ) : (
                visibles.map((tipo) => {
                    const delTipo = filtro ? (filtro === tipo ? grupos[filtro] ?? [] : []) : grupos[tipo] ?? [];
                    if (delTipo.length === 0) return null;
                    return (
                        <div key={tipo} className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">{ETIQUETA_TIPO[tipo]} · {delTipo.length}</h4>
                            <ul className="space-y-2">{delTipo.map((p) => <FilaProceso key={p.id} p={p} />)}</ul>
                        </div>
                    );
                })
            )}
            <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                {datos === null || datos.hardware.length === 0 ? (
                    <p className="text-sm text-white/60">
                        Sin medida: ningún servidor o neurona vinculado respondió. La medida de esta Mac solo está disponible en la propia Mac o con sesión de MetaGenesis.
                    </p>
                ) : (
                    <ProcesosHardware hardware={datos.hardware} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />
                )}
            </section>
            <section aria-label="Ajustes de procesos" className="space-y-2">
                <button type="button" onClick={() => setAjustesAbiertos((a) => !a)} className="rounded border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/5 cursor-pointer whitespace-normal h-auto">
                    {ajustesAbiertos ? "Ocultar ajustes" : "Ajustes (intervalo, umbrales y tipos)"}
                </button>
                {ajustesAbiertos && <ProcesosAjustes brainId={brainId} />}
            </section>
            <section aria-label="Fuentes consultadas" className="space-y-1 border-t border-white/10 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Fuentes consultadas</p>
                <p className="text-[11px] text-white/55">
                    Última lectura: {ultima ? new Date(ultima).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "en curso"}
                </p>
                {datos === null ? (
                    <p className="text-xs text-white/60">Consultando cada fuente (tope de 4 s por fuente)…</p>
                ) : (
                    <ul className="space-y-1">
                        {datos.fuentes.map((f) => (
                            <li key={f.nombre} className="text-[11px] text-white/60">
                                {f.ok ? "✓" : "✗"} {f.nombre} · {f.ms} ms
                                {f.motivo ? ` ·${f.motivo.trim()}${f.motivo.includes("no disponible aquí") ? " en este aparato" : ""}` : ""}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
