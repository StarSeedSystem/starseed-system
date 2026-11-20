"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Cpu, Loader2, RefreshCw, RotateCcw, Settings2, Terminal, Zap } from "lucide-react";
import type {
    AccionHeadlessPresidente,
    EstadoPresidenteRespuesta,
} from "@/lib/mando/presidente-config";

export interface BarraEstadoPresidenteProps {
    alAbrirAjustes?: () => void;
    alRecargarChat?: () => void;
}

const TONO_ESTADO: Record<string, string> = {
    listo: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    activo: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    ocupado: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    pausado: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    revision: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    agotado: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    apagado: "border-white/10 bg-white/5 text-white/45",
    desconocido: "border-white/15 bg-white/5 text-white/60",
};

/**
 * Franja compacta del Director presidente encima del chat: disponibilidad real de Claude,
 * Hermes, Antigravity (agy), ChatGPT/Codex, flota gratuita HTTP y controles headless.
 */
export function BarraEstadoPresidente({ alAbrirAjustes, alRecargarChat }: BarraEstadoPresidenteProps) {
    const [estado, setEstado] = useState<EstadoPresidenteRespuesta | null>(null);
    const [ocupado, setOcupado] = useState<AccionHeadlessPresidente | null>(null);
    const [resultado, setResultado] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch("/api/mando/director/presidente", { cache: "no-store" });
            if (!r.ok) return;
            const datos = (await r.json()) as Partial<EstadoPresidenteRespuesta> | null;
            if (
                datos &&
                Array.isArray(datos.proveedores) &&
                Array.isArray(datos.canales) &&
                datos.flotaGratis &&
                Array.isArray(datos.flotaGratis.pasarelas)
            ) {
                setEstado(datos as EstadoPresidenteRespuesta);
            }
        } catch {
            // La franja nunca bloquea el chat si aún está reiniciando.
        }
    }, []);

    useEffect(() => {
        void cargar();
        const id = window.setInterval(() => void cargar(), 25_000);
        return () => window.clearInterval(id);
    }, [cargar]);

    const ejecutar = async (accion: AccionHeadlessPresidente) => {
        setOcupado(accion);
        setResultado(null);
        try {
            const r = await fetch("/api/mando/director/presidente", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion }),
            });
            const datos = (await r.json()) as { ok?: boolean; salida?: string; error?: string };
            setResultado(datos.salida ?? datos.error ?? "Completado.");
            await cargar();
            alRecargarChat?.();
        } catch {
            setResultado("No se pudo ejecutar la operación headless en este momento.");
        } finally {
            setOcupado(null);
        }
    };

    return (
        <div
            data-testid="barra-estado-presidente"
            className="flex flex-col gap-2 rounded-xl border border-sky-400/20 bg-[#0A0F1D]/85 p-2.5 text-xs"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200">
                        <Activity className="h-3 w-3" aria-hidden />
                        Director presidente
                    </span>

                    {estado ? (
                        <>
                            {estado.proveedores.map((p) => (
                                <span
                                    key={p.id}
                                    title={p.detalle}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                                        TONO_ESTADO[p.estado] ?? TONO_ESTADO.desconocido
                                    }`}
                                >
                                    <span className="font-medium">{p.id === "agy" ? "Antigravity" : p.nombre.split(" ")[0]}</span>
                                    <span className="opacity-75">· {p.estado}</span>
                                </span>
                            ))}
                            <span
                                title="Pasarelas HTTP gratuitas activas"
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                                    estado.flotaGratis.vivos > 0
                                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                                        : "border-amber-400/40 bg-amber-500/10 text-amber-200"
                                }`}
                            >
                                <Zap className="h-2.5 w-2.5" aria-hidden />
                                Flota gratis {estado.flotaGratis.vivos}/{estado.flotaGratis.total}
                            </span>
                            {estado.enCola > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100">
                                    {estado.enCola} en cola
                                </span>
                            ) : null}
                        </>
                    ) : (
                        <span className="text-[10px] text-slate-400">
                            Modo autónomo headless activo (terminal + flota gratuita + canales unificados)
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void ejecutar("reintentar-cola")}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                        {ocupado === "reintentar-cola" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RotateCcw className="h-3 w-3" aria-hidden />}
                        Reintentar cola
                    </button>
                    <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void ejecutar("enrutar-hermes")}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-400/35 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
                    >
                        {ocupado === "enrutar-hermes" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
                        Enrutar Hermes
                    </button>
                    <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void ejecutar("buscar-capacidad")}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                        {ocupado === "buscar-capacidad" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Cpu className="h-3 w-3" aria-hidden />}
                        Capacidad
                    </button>
                    {alAbrirAjustes ? (
                        <button
                            type="button"
                            onClick={alAbrirAjustes}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-slate-200 hover:border-white/30"
                        >
                            <Settings2 className="h-3 w-3" aria-hidden />
                            Ajustes y registros
                        </button>
                    ) : null}
                </div>
            </div>

            {estado ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-1.5 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1 text-slate-300">
                        <Terminal className="h-3 w-3 text-sky-400" aria-hidden />
                        Canales sincronizados:
                    </span>
                    {estado.canales.map((c) => (
                        <span
                            key={c.id}
                            title={c.detalle}
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                                c.sincronizado
                                    ? "border-sky-400/25 bg-sky-500/10 text-sky-100"
                                    : "border-white/10 text-white/45"
                            }`}
                        >
                            {c.nombre.split(" (")[0]}
                        </span>
                    ))}
                </div>
            ) : null}

            {resultado ? (
                <p
                    role="status"
                    className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 font-mono text-[10px] text-sky-100 whitespace-pre-wrap"
                >
                    {resultado}
                </p>
            ) : null}
        </div>
    );
}
