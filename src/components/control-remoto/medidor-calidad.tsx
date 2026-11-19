"use client";

/**
 * CTL1119B · Medidor compacto de calidad del control remoto.
 * Se muestra en la ventana de control (y en el panel del punto del aparato controlado)
 * con fps enviados y medio, sin tapar la pantalla.
 */

import { useEffect, useRef, useState } from "react";
import { MetricasCalidad, MedioControl, crearMedidorCalidad } from "@/lib/control-remoto/calidad";

type PropsBase = {
    /** Métricas calculadas externamente (lado controlador) o nulas si vienen del lado controlado. */
    metricas?: MetricasCalidad | null;
    /** Lado de donde se muestra: "controlador" (ventana de control) o "controlado" (panel del punto). */
    lado: "controlador" | "controlado";
    /** Color de la neurona para el punto de color. */
    color?: string;
    /** Nombre de la neurona/usuario. */
    nombre?: string;
    /** Callback cuando el medidor tiene métricas nuevas (para registrar en el log nativo). */
    alActualizar?: (m: MetricasCalidad) => void;
};

type PropsControlador = PropsBase & {
    lado: "controlador";
    /** Función para registrar cuadros recibidos. */
    registrarCuadro: (m: { timestamp: number; bytes: number; ancho: number; alto: number; calidad: number; codec: string }) => void;
    /** Función para registrar órdenes enviadas y sus respuestas. */
    registrarOrden: (m: { timestampEnvio: number; timestampRespuesta: number; medio: MedioControl }) => void;
    /** Función para actualizar el medio en uso. */
    establecerMedio: (medio: MedioControl) => void;
};

type PropsControlado = PropsBase & {
    lado: "controlado";
    /** Métricas ya calculadas (vienen del lado nativo). */
    metricas: MetricasCalidad;
};

export type PropsMedidorCalidad = PropsControlador | PropsControlado;

const COLORES_MEDIO: Record<MedioControl, string> = {
    "red-local": "#10B981",
    bluetooth: "#8B5CF6",
    rele: "#F59E0B",
    internet: "#3B82F6",
    "wifi-directo": "#06B6D4",
    malla: "#A855F7",
    desconocido: "#6B7280",
};

const NOMBRES_MEDIO: Record<MedioControl, string> = {
    "red-local": "Red local",
    bluetooth: "Bluetooth",
    rele: "Relé",
    internet: "Internet",
    "wifi-directo": "Wi-Fi directo",
    malla: "Malla",
    desconocido: "Desconocido",
};

function formatearKbps(kbps: number): string {
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
    return `${Math.round(kbps)} kbps`;
}

function IndicadorMetrica({ etiqueta, valor, unidad = "", color = "text-white/85" }: { etiqueta: string; valor: string | number; unidad?: string; color?: string }) {
    return (
        <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-[10px] text-white/55">{etiqueta}</span>
            <span className={`tabular-nums font-mono text-[11px] font-medium ${color}`}>
                {valor}
                {unidad && <span className="text-white/55 font-normal">{unidad}</span>}
            </span>
        </span>
    );
}

function PuntoMedio({ medio }: { medio: MedioControl }) {
    const color = COLORES_MEDIO[medio];
    return (
        <span className="flex items-center gap-1" title={NOMBRES_MEDIO[medio]}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
            <span className="text-[10px] text-white/70">{NOMBRES_MEDIO[medio]}</span>
        </span>
    );
}

export function MedidorCalidad(props: PropsMedidorCalidad) {
    const { lado, metricas: metricasExternas, color, nombre, alActualizar } = props;

    const [metricas, setMetricas] = useState<MetricasCalidad | null>(metricasExternas ?? null);
    const medidorRef = useRef<ReturnType<typeof crearMedidorCalidad> | null>(null);
    const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Lado controlador: crear medidor interno y suscribirse a actualizaciones
    useEffect(() => {
        if (lado !== "controlador") return;

        const config = {
            ahora: () => Date.now(),
            anotar: (linea: string) => {
                console.debug(linea);
            },
            ventanaFpsMs: 3000,
            intervaloRegistroMs: 10000,
        };

        medidorRef.current = crearMedidorCalidad(config);
        const detener = medidorRef.current.iniciar();

        intervaloRef.current = setInterval(() => {
            const m = medidorRef.current?.obtenerMetricas();
            if (m) {
                setMetricas(m);
                alActualizar?.(m);
            }
        }, 1000);

        return () => {
            detener();
            if (intervaloRef.current) clearInterval(intervaloRef.current);
        };
    }, [lado, alActualizar]);

    // Lado controlado: usar métricas externas directamente
    useEffect(() => {
        if (lado === "controlado" && metricasExternas) {
            setMetricas(metricasExternas);
            alActualizar?.(metricasExternas);
        }
    }, [lado, metricasExternas, alActualizar]);

    // Exponer funciones de registro para el lado controlador (se llaman desde fuera)
    // Estas se pasan como props y el padre las usa para alimentar el medidor
    // El medidor interno es solo para la UI; el registro real lo hace el padre

    if (!metricas) return null;

    const { fps, rttMs, kbps, ancho, alto, calidad, codec, perdidas, medio } = metricas;

    const esBueno = fps >= 20 && rttMs <= 100 && perdidas < 5;
    const esRegular = fps >= 10 && rttMs <= 200 && perdidas < 15;
    const colorEstado = esBueno ? "#10B981" : esRegular ? "#F59E0B" : "#EF4444";

    const mostrarDetalle = lado === "controlador";

    return (
        <div
            data-testid="medidor-calidad"
            className="pointer-events-none fixed left-2 bottom-2 z-40 flex max-w-[calc(100vw-16px)] flex-col gap-1.5"
            style={{ maxWidth: mostrarDetalle ? 280 : 200 }}
        >
            <div
                className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b0f1a]/95 px-3 py-2 shadow-lg backdrop-blur-xl"
                style={{ minWidth: mostrarDetalle ? 260 : 180 }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {color && (
                        <span
                            className="h-2 w-2 shrink-0 rounded-full border border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                        />
                    )}
                    {nombre && <span className="truncate text-[11px] font-medium text-white">{nombre}</span>}
                    <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorEstado, boxShadow: `0 0 6px ${colorEstado}` }}
                        aria-label={esBueno ? "Calidad buena" : esRegular ? "Calidad regular" : "Calidad mala"}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                    <IndicadorMetrica etiqueta="FPS" valor={fps.toFixed(1)} color={fps >= 20 ? "text-emerald-300" : fps >= 10 ? "text-amber-300" : "text-red-300"} />
                    <IndicadorMetrica etiqueta="RTT" valor={Math.round(rttMs)} unidad="ms" color={rttMs <= 100 ? "text-emerald-300" : rttMs <= 200 ? "text-amber-300" : "text-red-300"} />
                    {mostrarDetalle && (
                        <>
                            <IndicadorMetrica etiqueta="↑" valor={formatearKbps(kbps)} color="text-cyan-300" />
                            <IndicadorMetrica etiqueta="Res" valor={`${ancho}x${alto}`} color="text-white/70" />
                            <IndicadorMetrica etiqueta="Cal" valor={calidad} unidad="%" color="text-white/70" />
                            <IndicadorMetrica etiqueta="Codec" valor={codec} color="text-white/60" />
                            <IndicadorMetrica etiqueta="Pérd" valor={perdidas.toFixed(1)} unidad="%" color={perdidas < 5 ? "text-emerald-300" : perdidas < 15 ? "text-amber-300" : "text-red-300"} />
                        </>
                    )}
                    <PuntoMedio medio={medio} />
                </div>
            </div>

            {mostrarDetalle && (
                <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b0f1a]/95 px-3 py-1.5 shadow-lg backdrop-blur-xl text-[10px] text-white/60">
                    <span className="text-white/40">Lado:</span>
                    <span className="font-mono tabular-nums text-white/80">{lado === "controlador" ? "Controlador" : "Controlado"}</span>
                    <span className="text-white/40">·</span>
                    <span className="text-white/40">Ventana:</span>
                    <span className="font-mono tabular-nums text-white/80">3 s</span>
                    <span className="text-white/40">·</span>
                    <span className="text-white/40">Registro:</span>
                    <span className="font-mono tabular-nums text-white/80">10 s</span>
                </div>
            )}
        </div>
    );
}

// Hook para usar el medidor desde el lado controlador (ventana de control)
export function useMedidorControlador() {
    const medidorRef = useRef<ReturnType<typeof crearMedidorCalidad> | null>(null);
    const [metricas, setMetricas] = useState<MetricasCalidad | null>(null);

    useEffect(() => {
        const m = crearMedidorCalidad({
            ahora: () => Date.now(),
            anotar: (linea: string) => console.debug(linea),
        });
        medidorRef.current = m;
        const detener = m.iniciar();
        const intervalo = setInterval(() => {
            const met = m.obtenerMetricas();
            if (met) setMetricas(met);
        }, 1000);
        return () => {
            detener();
            clearInterval(intervalo);
        };
    }, []);

    const registrarCuadro = (muestra: Parameters<ReturnType<typeof crearMedidorCalidad>["registrarCuadro"]>[0]) => {
        medidorRef.current?.registrarCuadro(muestra);
    };
    const registrarOrden = (muestra: Parameters<ReturnType<typeof crearMedidorCalidad>["registrarOrden"]>[0]) => {
        medidorRef.current?.registrarOrden(muestra);
    };
    const establecerMedio = (medio: MedioControl) => {
        medidorRef.current?.establecerMedio(medio);
    };

    return { metricas, registrarCuadro, registrarOrden, establecerMedio };
}