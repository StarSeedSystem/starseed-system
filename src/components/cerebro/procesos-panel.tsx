"use client";

/** Pilar «Procesos activos» (CB1013N, §7): medida real con fuente, o «sin medida». */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";
import { setWindowMinimized } from "@/components/desktop/desktop-store";
import { ProcesosHardware } from "./procesos-hardware";
import { ProcesosAjustes } from "./procesos-ajustes";
import { avisosHardware, ETIQUETA_TIPO, type ProcesoActivo, type TipoProceso } from "@/lib/cerebros/procesos";
import { agruparPorTipo } from "@/lib/cerebros/procesos-normalizar";
import { leerProcesos } from "@/lib/cerebros/procesos-fuentes";
import { usarPreferenciasProcesos } from "@/lib/cerebros/procesos-preferencias";
import { escritorioYVentana, ETIQUETA_ESTADO, NOMBRE_MEDIDA, tiposVisibles } from "@/lib/cerebros/procesos-filtros";
import { textoHace } from "@/lib/metagenesis/remoto";

export interface ProcesosPanelProps { brainId: string | null; brainName?: string; }
type DatosProcesos = Awaited<ReturnType<typeof leerProcesos>>; const HORA = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

function FilaProceso({ p, ahora }: { p: ProcesoActivo; ahora: number }) {
    const ventana = p.tipo === "app-fondo" ? escritorioYVentana(p.id) : null;
    const pct = p.progreso == null ? null : Math.round(p.progreso * 100);
    return (
        <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-white/90">{p.nombre}
                <span className={cn("ml-2 text-xs", p.estado === "fallando" ? "text-red-300" : "text-white/55")}>{ETIQUETA_ESTADO[p.estado]}</span>
            </p>
            <p className="mt-1 text-xs text-white/60">
                {`Fuente: ${p.fuente} · ${p.donde}${p.desde != null ? ` · desde ${textoHace(Math.max(0, ahora - p.desde))}` : ""}${p.detalle ? ` · ${p.detalle}` : ""}`}
            </p>
            {pct != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progreso de ${p.nombre}`}>
                    <div className="h-full rounded-full bg-cyan-400 transition-all duration-200" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                </div>
            )}
            {(p.tipo === "genesis" || ventana) && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {p.tipo === "genesis" && <Button asChild variant="outline" size="sm" className="whitespace-normal h-auto cursor-pointer"><Link href="/genesis">Abrir Genesis</Link></Button>}
                    {ventana && <Button variant="outline" size="sm" className="whitespace-normal h-auto cursor-pointer" onClick={() => setWindowMinimized(ventana.escritorio, ventana.ventana, false)}>Restaurar ventana</Button>}
                </div>
            )}
        </li>
    );
}

export default function ProcesosPanel({ brainId }: ProcesosPanelProps) {
    const { prefs } = usarPreferenciasProcesos();
    const [datos, setDatos] = useState<DatosProcesos | null>(null);
    const [ultimaLectura, setUltimaLectura] = useState<number | null>(null);
    const [cargando, setCargando] = useState(false);
    const [apagados, setApagados] = useState<TipoProceso[]>([]);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
    const cargar = useCallback(async () => {
        setCargando(true);
        try { setDatos(await leerProcesos()); setUltimaLectura(Date.now()); } finally { setCargando(false); }
    }, []);
    useEffect(() => {
        void cargar();
        const relevo = setInterval(() => { if (document.visibilityState === "visible") void cargar(); }, Math.max(5, prefs.intervaloSeg) * 1000);
        return () => clearInterval(relevo);
    }, [cargar, prefs.intervaloSeg]);
    const visibles = tiposVisibles(prefs.tipos);
    const encendidos = visibles.filter((t) => !apagados.includes(t));
    const grupos = datos ? agruparPorTipo(datos.procesos) : {};
    const avisos = datos ? avisosHardware(datos.hardware, prefs.umbrales) : [];
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Procesos activos</h3>
                <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando} className="whitespace-normal h-auto cursor-pointer">
                    {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                    {`${ultimaLectura == null ? "" : `${HORA.format(ultimaLectura)} · `}Actualizar`}
                </Button>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Cuentas de procesos por tipo">
                {visibles.map((t) => (
                    <button key={t} type="button" aria-pressed={!apagados.includes(t)} onClick={() => setApagados((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]))}
                        className={cn("cursor-pointer whitespace-normal rounded-full border px-3 py-1 text-xs transition-colors duration-200",
                            encendidos.includes(t) ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25" : "border-white/15 bg-white/5 text-white/45 hover:bg-white/10")}>
                        {`${ETIQUETA_TIPO[t]}${datos == null ? "" : ` · ${grupos[t]?.length ?? 0}`}`}
                    </button>
                ))}
            </div>
            <div className="space-y-3" aria-label="Lista de procesos activos">
                {datos === null ? <p className="text-sm text-white/60">Leyendo los procesos activos de todas las fuentes…</p>
                    : datos.procesos.length === 0 || encendidos.length === 0 ? <p className="text-sm text-white/60">Ningún proceso visible ahora mismo: los filtros y los tipos elegidos en los ajustes deciden lo que se enseña.</p>
                    : encendidos.map((tipo) => !grupos[tipo]?.length ? null : (
                        <div key={tipo} className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">{ETIQUETA_TIPO[tipo]}</h4>
                            <ul className="space-y-2">
                                {grupos[tipo]!.map((p) => <FilaProceso key={p.id} p={p} ahora={ultimaLectura ?? 0} />)}
                            </ul>
                        </div>
                    ))}
            </div>
            <section aria-label="Hardware de los servidores vinculados" className="space-y-2">
                {avisos.length > 0 && <p className="text-xs text-amber-300">{avisos.map((a) => `${NOMBRE_MEDIDA[a.medida]} ${a.medida === "bateria" ? "baja" : "alta"} en «${a.servidor}» (${a.valor} %; umbral ${a.umbral} %)`).join(" · ")}</p>}
                {datos === null ? <p className="text-sm text-white/60">Midiendo el hardware de los servidores vinculados…</p>
                    : datos.hardware.length === 0 ? <p className="text-sm text-white/60">Sin medida: ningún servidor vinculado respondió; la de esta Mac solo se puede leer en la propia Mac o con sesión de MetaGenesis.</p>
                    : <ProcesosHardware hardware={datos.hardware} umbrales={prefs.umbrales} ocultos={prefs.ocultos} />}
            </section>
            <section aria-label="Ajustes de procesos" className="rounded-lg border border-white/10 bg-black/20 p-3">
                <button type="button" onClick={() => setAjustesAbiertos((v) => !v)} aria-expanded={ajustesAbiertos}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-sm font-medium text-white/85">
                    Ajustes de procesos
                    <Settings2 className={cn("size-4 shrink-0 text-white/50 transition-transform duration-200", ajustesAbiertos && "rotate-180")} aria-hidden />
                </button>
                {ajustesAbiertos && <div className="mt-3"><ProcesosAjustes brainId={brainId} /></div>}
            </section>
            <section aria-label="Fuentes consultadas">
                {datos === null ? <p className="text-sm text-white/60">Midendo las fuentes…</p> : (
                    <p className="text-[11px] leading-5 text-white/55">{datos.fuentes.map((f) => `${f.ok ? "✓" : "✗"} ${f.nombre}${f.ok ? "" : f.motivo?.trim() ? ` (${f.motivo.trim()})` : " (sin respuesta)"}`).join(" · ")}</p>
                )}
            </section>
        </div>
    );
}
