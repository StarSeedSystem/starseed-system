"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Loader2, RefreshCw, X } from "lucide-react";
import type { EstadoMedio, MedioComputo, ResumenMedios } from "@/lib/mando/medios-computo";

function chipTone(estado: EstadoMedio): { bg: string; label: string } {
    switch (estado) {
        case "listo":
            return { bg: "border-emerald-500/40 bg-emerald-500/20 text-emerald-300", label: "Listo" };
        case "usable":
            return { bg: "border-cyan-500/40 bg-cyan-500/20 text-cyan-300", label: "Usable" };
        case "requiere_alex":
            return { bg: "border-amber-500/40 bg-amber-500/20 text-amber-300", label: "Requiere Alex" };
        case "no_disponible":
        default:
            return { bg: "border-zinc-500/40 bg-zinc-500/20 text-zinc-400", label: "No disponible" };
    }
}

function horaFormateada(iso?: string): string {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return iso ?? "—";
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function BotonMedios() {
    const [abierto, setAbierto] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [resumen, setResumen] = useState<ResumenMedios | null>(null);
    const [horaSondeo, setHoraSondeo] = useState<string | null>(null);

    const cargarMedios = useCallback(async (forzar = false) => {
        setCargando(true);
        try {
            const url = forzar ? "/api/mando/medios?forzar=1" : "/api/mando/medios";
            const res = await fetch(url);
            if (!res.ok) {
                setResumen({
                    medios: [],
                    resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
                    error: `Error al consultar los medios de cómputo (HTTP ${res.status}).`,
                });
            } else {
                const data = (await res.json()) as ResumenMedios;
                setResumen(data);
                setHoraSondeo(horaFormateada(data.generado));
            }
        } catch (err) {
            const msj = err instanceof Error ? err.message : String(err);
            setResumen({
                medios: [],
                resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
                error: `No se pudo conectar con el servidor: ${msj}`,
            });
        } finally {
            setCargando(false);
        }
    }, []);

    const abrir = () => {
        setAbierto(true);
        void cargarMedios(false);
    };

    const cerrar = () => setAbierto(false);

    useEffect(() => {
        if (!abierto) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") cerrar();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [abierto]);

    const listos = resumen?.resumen.listos ?? 0;
    const usables = resumen?.resumen.usables ?? 0;
    const porHacer = resumen?.resumen.porHacer ?? 0;

    return (
        <div className="relative inline-block">
            <button
                type="button"
                onClick={abrir}
                className="mc-alzar cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
            >
                <Cpu className="h-3.5 w-3.5" aria-hidden />
                <span>Comprobar medios</span>
            </button>

            {abierto && (
                <section
                    role="dialog"
                    aria-label="Medios de cómputo disponibles"
                    className="mc-cristal mc-desplegar absolute right-0 top-full z-40 mt-2 w-[min(38rem,94vw)] border border-white/20 p-4 shadow-2xl backdrop-blur-xl"
                >
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <div>
                            <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
                                <Cpu className="h-4 w-4 text-cyan-300" aria-hidden />
                                Medios de cómputo
                            </h4>
                            <p className="mt-0.5 text-xs text-white/70">
                                {listos} listos · {usables} usables · {porHacer} por preparar
                                {horaSondeo ? <span className="ml-2 text-white/40">· Sondeo {horaSondeo}</span> : null}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void cargarMedios(true)}
                                disabled={cargando}
                                className="mc-alzar cursor-pointer inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                                <span>Volver a comprobar</span>
                            </button>
                            <button
                                type="button"
                                onClick={cerrar}
                                className="cursor-pointer rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
                                title="Cerrar"
                            >
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                    </header>

                    {cargando && !resumen ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-xs text-white/60">
                            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden />
                            Comprobando medios de cómputo…
                        </div>
                    ) : resumen?.error ? (
                        <div className="my-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                            <p className="font-medium">{resumen.error}</p>
                        </div>
                    ) : (
                        <div className="mt-3 space-y-2.5 max-h-[28rem] overflow-y-auto pr-1">
                            {resumen?.medios.map((m) => {
                                const chip = chipTone(m.estado);
                                return (
                                    <article
                                        key={m.id || m.nombre}
                                        className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white">{m.nombre}</span>
                                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${chip.bg}`}>
                                                    {chip.label}
                                                </span>
                                            </div>
                                            {m.capacidad && (
                                                <span className="font-mono text-white/70">{m.capacidad}</span>
                                            )}
                                        </div>
                                        {m.detalle && (
                                            <p className="mt-1 text-white/60 text-[11px]">{m.detalle}</p>
                                        )}
                                        {m.siguiente_paso && (
                                            <div className="mt-2 rounded bg-black/50 border border-white/10 p-2 font-mono text-[11px] text-cyan-200">
                                                <span className="text-[10px] uppercase text-white/40 block mb-0.5 font-sans">
                                                    Siguiente paso (copia y pega en la terminal):
                                                </span>
                                                <code className="select-all block break-all text-emerald-300 font-mono">
                                                    {m.siguiente_paso}
                                                </code>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
