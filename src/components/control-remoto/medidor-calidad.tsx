"use client";

import { useEffect, useState } from "react";
import { useConversor } from "@/hooks/useConversor";
import { usePeersMalla } from "@/lib/network/malla-neuronas";
import { PALABRAS_MOTIVO } from "@/lib/control-remoto/palabras";
import { useTodo } from "@/hooks/useTodo";

/**
 * UNI1119B · medidor de calidad del control: fps, retardo, kbps, resolución, pérdidas, medio en uso.
 * Componente compacto que muestra métricas en la ventana de control y en el panel del aparato.
 * Diseño StarSeed: geometría áurea, tokens Trinity, cristal líquido.
 */

interface PropsCalidadMedidor {
    neurona: string;
    nombre: string;
}

export function MedidorCalidad({ neurona, nombre }: PropsCalidadMedidor) {
    const [calidad, actualizarCalidad] = useState<{
        fps: number | null;
        rttMs: number | null;
        kbps: number | null;
        resolucion: { ancho: number | null; alto: number } | null;
        perdidos: number | null;
        calidad: "excelente" | "buena" | "regular" | "mala" | null;
        medio: { tipo: string; activo: boolean } | null;
    } | null>(null);

    const { estado: mallaEstado, peers } = usePeersMalla(neurona);

    useEffect(() => {
        const cleanup = useTodo({
            neurona,
            nombre,
            onUpdate: (medicion: {
                fps: number | null;
                rttMs: number | null;
                kbps: number | null;
                resolucion: { ancho: number | null; alto: number } | null;
                perdidos: number | null;
            }) => {
                actualizarCalidad({
                    fps: medicion.fps,
                    rttMs: medicion.rttMs,
                    kbps: medicion.kbps,
                    resolucion: medicion.resolucion,
                    perdidos: medicion.perdidos,
                    calidad: determinarCalidad(
                        medicion.fps ?? 0,
                        medicion.rttMs,
                        medicion.perdidos ?? 1,
                        medicion.kbps ?? 0,
                    ),
                    medio: mallaEstado?.medio ?? null,
                });
            },
        });

        return () => cleanup();
    }, [neurona, nombre]);

    if (!calidad) return null;

    const calidadTexto = calidad.calidad === "excelente"
        ? "Excelente"
        : calidad.calidad === "buena"
        ? "Buena"
        : calidad.calidad === "regular"
        ? "Regular"
        : "Mala";

    const medioTexto = calidad.medio
        ? calidad.medio.activo
            ? "Red local"
            : calidad.medio.tipo === "wifi"
            ? "WiFi"
            : calidad.medio.tipo === "bluetooth"
            ? "Bluetooth"
            : "Relé"
        : "–";

    const fpsTexto = calidad.fps !== null ? `${Math.round(calidad.fps)} fps` : "–";
    const kbpsTexto = calidad.kbps !== null ? `${calidad.kbps} kbps` : "–";
    const perdidosTexto = calidad.perdidos !== null ? `${(calidad.perdidos * 100).toFixed(1)} %` : "–";

    return (
        <div
            className="fixed top-4 right-4 bg-[var(--radius)] backdrop-blur-[var(--radius)] border border-white/10 shadow-2xl z-50 max-w-sm w-full"
            style={{
                "--radius": "20px",
            }}
        >
            <div className="p-4 space-y-2 text-white">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-white/60">Control: {nombre}</span>
                    <span className="text-[10px] text-white/40">StarSeed</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                        <span className="block text-[var(--primary)] mb-1">FPS</span>
                        <span className="font-mono">{fpsTexto}</span>
                    </div>
                    <div>
                        <span className="block text-[var(--primary)] mb-1">RTT</span>
                        <span className="font-mono">{calidad.rttMs !== null ? `${calidad.rttMs} ms` : "–"}</span>
                    </div>
                    <div>
                        <span className="block text-[var(--primary)] mb-1">KB/s</span>
                        <span className="font-mono">{kbpsTexto}</span>
                    </div>
                    <div>
                        <span className="block text-[var(--primary)] mb-1">Resolución</span>
                        <span className="font-mono">
                            {calidad.resolucion
                                ? `${calidad.resolucion.ancho}x${calidad.resolucion.alto}`
                                : "–"}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                        <span className="block text-[var(--primary)] mb-1">Pérdidas</span>
                        <span className="font-mono text-red-400">{perdidosTexto}</span>
                    </div>
                    <div>
                        <span className="block text-[var(--primary)] mb-1">Calidad</span>
                        <span className="font-medium {calidad.calidad === 'excelente' ? 'text-green-400' : calidad.calidad === 'buena' ? 'text-lime-400' : calidad.calidad === 'regular' ? 'text-amber-400' : 'text-crimson-400'}">
                            {calidadTexto}
                        </span>
                    </div>
                    <div>
                        <span className="block text-[var(--primary)] mb-1">Medio</span>
                        <span className="font-mono">{medioTexto}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Determina el nivel de calidad basado en las métricas */
function determinarCalidad(
    fps: number,
    rttMs: number | null,
    perdidos: number,
    kbps: number,
): "excelente" | "buena" | "regular" | "mala" {
    if (fps >= 25 && (rttMs === null || rttMs <= 50) && perdidos < 0.05 && kbps >= 500)
        return "excelente";
    if (fps >= 15 && (rttMs === null || rttMs <= 100) && perdidos < 0.1 && kbps >= 200)
        return "buena";
    if (fps >= 5 && (rttMs === null || rttMs <= 200) && perdidos < 0.2) return "regular";
    return "mala";
}