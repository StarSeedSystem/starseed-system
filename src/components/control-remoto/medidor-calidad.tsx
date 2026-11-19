"use client";

/**
 * CTL1119B · medidor compacto de calidad del control remoto.
 * Se muestra en la ventana de control (lado controlador) y en el panel del punto
 * del aparato controlado (lado aparato: fps enviados y medio).
 * Diseño StarSeed: cristal líquido, colores por fps, no tapa la pantalla.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    añadirAcuse,
    añadirCuadro,
    actualizarMedio,
    calcularMetricas,
    colorFps,
    EstadoCalidad,
    lineaRegistro,
    marcarRegistro,
    estadoInicial,
    textoUi,
    tocaRegistro,
    type AcuseOrden,
    type CuadroRecibido,
    type MetricasCalidad,
    type TipoMedio,
    type Lado,
} from "@/lib/control-remoto/calidad";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";

export interface PropsMedidorCalidad {
    /** Lado que mide: "controlador" = quien manda (recibe cuadros), "aparato" = quien envía (envía cuadros). */
    lado: Lado;
    /** Sesión/neurona para el registro. */
    neurona: string;
    /** Medio actual (lo que dice el estado vivo del control). */
    medio: TipoMedio;
    /** Si está en vivo (recibiendo/enviando cuadros). */
    enVivo: boolean;
    /** Ranura opcional para contenido extra (ej. botón de detalle). */
    ranura?: ReactNode;
    /** Clase CSS adicional. */
    className?: string;
}

/** Componente presentacional: recibe métricas y las muestra. */
export interface PropsMedidorPresentacional {
    metricas: MetricasCalidad;
    ranura?: ReactNode;
    className?: string;
}

export function MedidorPresentacional({ metricas, ranura, className = "" }: PropsMedidorPresentacional) {
    const color = colorFps(metricas.fps);
    const colorClass =
        color === "verde"
            ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
            : color === "ambar"
            ? "bg-amber-400/20 text-amber-200 border-amber-400/30"
            : "bg-red-500/20 text-red-300 border-red-400/30";

    const fpsTexto = metricas.fps > 0 ? `${metricas.fps.toFixed(1).replace(".", ",")} fps` : "— fps";
    const rttTexto = metricas.rttMs > 0 ? `${metricas.rttMs} ms` : "— ms";
    const kbpsTexto = metricas.kbps > 0 ? `${(metricas.kbps / 1000).toFixed(1).replace(".", ",")} Mbps` : "— Mbps";
    const resTexto = metricas.resolucion ? `${metricas.resolucion.ancho}×${metricas.resolucion.alto}` : "—";
    const medioTexto = metricas.medio !== "sin-determinar" ? metricas.medio : "desconocido";

    return (
        <div
            data-testid="medidor-calidad"
            className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-mono transition-colors duration-200 ${colorClass} ${className}`}
            role="status"
            aria-live="polite"
            aria-label={`Calidad: ${fpsTexto}, latencia ${rttTexto}, ${kbpsTexto}, ${resTexto}, ${medioTexto}`}
        >
            <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                <span>{fpsTexto}</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-white/60">
                <span className="text-white/40">⏱</span>
                <span>{rttTexto}</span>
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-white/60">
                <span className="text-white/40">⚡</span>
                <span>{kbpsTexto}</span>
            </span>
            <span className="hidden lg:inline-flex items-center gap-1 text-white/60">
                <span className="text-white/40">📐</span>
                <span>{resTexto}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-white/60">
                <span className="text-white/40">📡</span>
                <span>{medioTexto}</span>
            </span>
            {ranura}
        </div>
    );
}

/** Hook que gestiona el estado de calidad y calcula métricas. */
function usarCalidad(lado: Lado, neurona: string, medio: TipoMedio, enVivo: boolean): MetricasCalidad | null {
    const estadoRef = useRef<EstadoCalidad | null>(null);
    const [metricas, setMetricas] = useState<MetricasCalidad | null>(null);
    const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const ultimoAhoraRef = useRef(0);

    // Inicializar estado
    if (!estadoRef.current) {
        estadoRef.current = estadoInicial(lado, medio);
    }

    // Actualizar medio cuando cambie
    useEffect(() => {
        if (estadoRef.current) {
            actualizarMedio(estadoRef.current, medio);
        }
    }, [medio]);

    // Bucle de cálculo cada 500 ms mientras está en vivo
    useEffect(() => {
        if (!enVivo) {
            if (intervaloRef.current) {
                clearInterval(intervaloRef.current);
                intervaloRef.current = null;
            }
            return;
        }

        const calcular = () => {
            const ahora = Date.now();
            ultimoAhoraRef.current = ahora;
            if (!estadoRef.current) return;

            const m = calcularMetricas(estadoRef.current, ahora);
            setMetricas(m);

            // Registro cada 10 s
            if (tocaRegistro(estadoRef.current, ahora)) {
                const linea = lineaRegistro(m);
                anotarLlamada("banco", neurona, linea).catch(() => undefined);
                try {
                    console.info(`[control-calidad] ${linea}`);
                } catch {
                    /* nada */
                }
                marcarRegistro(estadoRef.current, ahora);
            }
        };

        calcular();
        intervaloRef.current = setInterval(calcular, 500);
        return () => {
            if (intervaloRef.current) clearInterval(intervaloRef.current);
        };
    }, [enVivo, neurona]);

    return metricas;
}

/** Componente principal conectado al estado vivo. */
export function MedidorCalidad({ lado, neurona, medio, enVivo, ranura, className = "" }: PropsMedidorCalidad) {
    const metricas = usarCalidad(lado, neurona, medio, enVivo);

    if (!metricas || !enVivo) return null;

    return <MedidorPresentacional metricas={metricas} ranura={ranura} className={className} />;
}

/**
 * Funciones para que el lado controlador (PantallaDestino) alimente el medidor.
 * Se usan desde fuera del componente (no son hooks).
 */
export function alimentarCuadro(estado: EstadoCalidad, cuadro: CuadroRecibido): void {
    añadirCuadro(estado, cuadro);
}

export function alimentarAcuse(estado: EstadoCalidad, acuse: AcuseOrden): void {
    añadirAcuse(estado, acuse);
}

export function actualizarMedioEstado(estado: EstadoCalidad, medio: TipoMedio): void {
    actualizarMedio(estado, medio);
}

export function crearEstadoCalidad(lado: Lado, medio: TipoMedio): EstadoCalidad {
    return estadoInicial(lado, medio);
}

/** Versión para el panel del punto del aparato controlado (solo fps enviados y medio). */
export function MedidorPuntoAparato({
    metricas,
    className = "",
}: {
    metricas: MetricasCalidad;
    className?: string;
}) {
    const color = colorFps(metricas.fps);
    const colorClass =
        color === "verde"
            ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
            : color === "ambar"
            ? "bg-amber-400/20 text-amber-200 border-amber-400/30"
            : "bg-red-500/20 text-red-300 border-red-400/30";

    const fpsTexto = metricas.fps > 0 ? `${metricas.fps.toFixed(1).replace(".", ",")} fps` : "— fps";
    const medioTexto = metricas.medio !== "sin-determinar" ? metricas.medio : "desconocido";

    return (
        <div
            data-testid="medidor-punto-aparato"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-mono ${colorClass} ${className}`}
            role="status"
            aria-live="polite"
            aria-label={`Enviando: ${fpsTexto} por ${medioTexto}`}
        >
            <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                <span>{fpsTexto}</span>
            </span>
            <span className="text-white/60">·</span>
            <span className="text-white/60">{medioTexto}</span>
        </div>
    );
}