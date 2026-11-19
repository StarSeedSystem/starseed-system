"use client";

/**
 * CTL1119B · Medidor compacto de calidad del control.
 * Se usa en la ventana de control (lado controlador) y en el panel del punto del aparato controlado.
 * Muestra: fps, retardo (RTT), kbps, resolución, calidad/códec, pérdidas y medio en uso.
 * Diseño StarSeed: cristal líquido, no tapa la pantalla.
 */

import { useEffect, useState } from "react";
import { PuntoColor } from "./punto-control";
import type { CalidadCalculada, Medio, Lado } from "@/lib/control-remoto/calidad";

export interface PropsMedidorCalidad {
    /** Datos de calidad calculados (lado controlador o aparato). */
    calidad: CalidadCalculada | null;
    /** Lado que mide: "controlador" = quien manda, "aparato" = el controlado. */
    lado: Lado;
    /** Color de la neurona (para el punto de color). */
    color?: string;
    /** Nombre de la neurona (para accesibilidad). */
    nombre?: string;
    /** Modo compacto: solo fps y medio (para el panel del punto). */
    compacto?: boolean;
    /** Etiqueta adicional (ej. "Enviados:" en el panel del aparato). */
    etiqueta?: string;
}

function textoMedio(medio: Medio): string {
    const map: Record<Medio, string> = {
        "red-local": "Red local",
        "wifi-directo": "Wi‑Fi directo",
        "bluetooth": "Bluetooth",
        "relevo": "Relevo",
        "turn": "TURN",
        "servidor": "Servidor",
        "malla": "Malla",
        "desconocido": "Desconocido",
    };
    return map[medio];
}

function colorMedio(medio: Medio): string {
    switch (medio) {
        case "red-local":
            return "text-emerald-300";
        case "wifi-directo":
            return "text-sky-300";
        case "bluetooth":
            return "text-violet-300";
        case "relevo":
        case "turn":
        case "servidor":
            return "text-amber-300";
        case "malla":
            return "text-cyan-300";
        default:
            return "text-white/50";
    }
}

function colorFps(fps: number): string {
    if (fps >= 20) return "text-emerald-300";
    if (fps >= 10) return "text-amber-300";
    if (fps > 0) return "text-orange-300";
    return "text-white/40";
}

function colorRtt(rtt: number): string {
    if (rtt <= 50) return "text-emerald-300";
    if (rtt <= 100) return "text-amber-300";
    if (rtt <= 200) return "text-orange-300";
    return "text-red-300";
}

function colorPerdidas(pct: number): string {
    if (pct === 0) return "text-emerald-300";
    if (pct <= 1) return "text-amber-300";
    if (pct <= 5) return "text-orange-300";
    return "text-red-300";
}

function formatearKbps(kbps: number): string {
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
    return `${kbps} kbps`;
}

export function MedidorCalidad({
    calidad,
    lado,
    color,
    nombre,
    compacto = false,
    etiqueta,
}: PropsMedidorCalidad) {
    const esControlador = lado === "controlador";

    const fps = calidad?.fps ?? 0;
    const rttMs = calidad?.rttMs ?? 0;
    const kbps = calidad?.kbps ?? 0;
    const resolucion = calidad?.resolucion;
    const nivelCalidad = calidad?.nivelCalidad ?? 0;
    const codec = calidad?.codec ?? "desconocido";
    const perdidasPct = calidad?.perdidasPct ?? 0;
    const medio = calidad?.medio ?? "desconocido";

    const tituloBase = esControlador ? "Calidad del control" : "Calidad del envío";
    const titulo = etiqueta ? `${etiqueta} ${tituloBase}` : tituloBase;

    // En modo compacto solo mostramos fps y medio
    if (compacto) {
        return (
            <div
                data-testid="medidor-calidad-compacto"
                className="pointer-events-none flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b0f1a]/80 px-2 py-1 text-[11px] text-white/70"
                role="status"
                aria-label={`${titulo}: ${fps.toFixed(1)} fps, ${textoMedio(medio)}`}
            >
                {color && <PuntoColor color={color} className="h-2 w-2" />}
                <span className={`tabular-nums ${colorFps(fps)}`}>{fps.toFixed(1)}</span>
                <span className="text-white/40">fps</span>
                <span className="hidden sm:inline-flex items-center gap-1">
                    <span className={`whitespace-nowrap ${colorMedio(medio)}`}>{textoMedio(medio)}</span>
                </span>
            </div>
        );
    }

    // Modo completo
    return (
        <div
            data-testid="medidor-calidad"
            className="pointer-events-none rounded-xl border border-white/10 bg-[#0b0f1a]/95 px-3 py-2 text-[11px] text-white/70 shadow-lg backdrop-blur-xl"
            role="region"
            aria-label={titulo}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* FPS */}
                <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-white/50">FPS:</span>
                    <span className={`tabular-nums font-medium ${colorFps(fps)}`}>{fps.toFixed(1)}</span>
                </div>

                {/* RTT */}
                <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-white/50">RTT:</span>
                    <span className={`tabular-nums font-medium ${colorRtt(rttMs)}`}>{rttMs} ms</span>
                </div>

                {/* KBPS */}
                <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-white/50">Velocidad:</span>
                    <span className="tabular-nums font-medium text-white/80">{formatearKbps(kbps)}</span>
                </div>

                {/* Medio */}
                <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-white/50">Medio:</span>
                    {color && <PuntoColor color={color} className="h-2 w-2" />}
                    <span className={`whitespace-nowrap ${colorMedio(medio)}`}>{textoMedio(medio)}</span>
                </div>

                {/* Resolución y calidad (solo si hay datos) */}
                {resolucion && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="text-white/50">Res:</span>
                        <span className="tabular-nums text-white/80">{resolucion.ancho}×{resolucion.alto}</span>
                        <span className="text-white/40">·</span>
                        <span className="text-white/50">Q:</span>
                        <span className="tabular-nums text-white/80">{nivelCalidad}</span>
                        <span className="text-white/40">({codec.toUpperCase()})</span>
                    </div>
                )}

                {/* Pérdidas */}
                {perdidasPct > 0 && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="text-white/50">Pérdidas:</span>
                        <span className={`tabular-nums font-medium ${colorPerdidas(perdidasPct)}`}>{perdidasPct.toFixed(1)}%</span>
                    </div>
                )}

                {/* Indicador visual de calidad general */}
                <div
                    className="ml-auto flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5"
                    aria-hidden="true"
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${
                            fps >= 20 && rttMs <= 100 && perdidasPct <= 1
                                ? "bg-emerald-400"
                                : fps >= 10 && rttMs <= 200 && perdidasPct <= 5
                                ? "bg-amber-400"
                                : "bg-red-400"
                        }`}
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * Hook para usar el medidor desde un componente que tiene acceso al MedidorCalidad del lib.
 * Se suscribe a los cambios y devuelve la calidad actual.
 */
export function useMedidorCalidad(medidor: import("@/lib/control-remoto/calidad").MedidorCalidad | null) {
    const [calidad, setCalidad] = useState<CalidadCalculada | null>(null);

    useEffect(() => {
        if (!medidor) return;
        const off = medidor.suscribir(setCalidad);
        // Valor inicial
        setCalidad(medidor.calcular(Date.now()));
        return off;
    }, [medidor]);

    return calidad;
}

// Re-export types for convenience
export type { CalidadCalculada, Medio, Lado } from "@/lib/control-remoto/calidad";