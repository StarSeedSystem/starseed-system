"use client";

/**
 * CTL1119B · Medidor compacto de calidad del control remoto.
 *
 * Dos modos:
 * - `controlador`: en la ventana de control, muestra FPS recibidos, RTT, kbps, medio.
 * - `aparato`: en el panel del punto del aparato controlado, muestra FPS enviados y medio.
 *
 * Diseño StarSeed: cristal líquido translúcido, esquinas redondeadas, semáforos de color,
 * texto en español neutro, `cursor-pointer` en lo clicable, no tapa la pantalla.
 */

import { useEffect, useRef, useState } from "react";
import { crearMedidor, formatearMetricas, colorFps, colorRtt, colorPerdidas, type EventoCuadro, type EventoAcuse, type MetricasCalidad, type MedioReal, type CalidadCodigo, type LadoCalidad } from "@/lib/control-remoto/calidad";

type Modo = "controlador" | "aparato";

interface Props {
    /** Quién usa el medidor. */
    modo: Modo;
    /** Sesión activa (para saber si hay conexión). */
    sesionActiva?: boolean;
    /** Callback cuando el controlador registra un cuadro (lado que recibe vídeo). */
    onCuadro?: (e: EventoCuadro) => void;
    /** Callback cuando el controlador registra un acuse (para RTT). */
    onAcuse?: (e: EventoAcuse) => void;
    /** Callback cuando el aparato registra un cuadro enviado. */
    onCuadroEnviado?: (e: EventoCuadro) => void;
    /** Callback cuando el aparato registra un acuse de orden recibida. */
    onAcuseRecibido?: (e: EventoAcuse) => void;
    /** Medio real actual (viene de `medio-estado`). */
    medioReal?: MedioReal;
    /** Info de códec/calidad si se sabe. */
    calidadCodigo?: CalidadCodigo;
    /** Si está expandido (click para alternar). */
    expandido?: boolean;
    onToggleExpandir?: () => void;
    /** Clase extra. */
    className?: string;
}

const COLORES_SEMAFORO = {
    verde: "text-emerald-400",
    ambar: "text-amber-400",
    rojo: "text-rose-400",
    desconocido: "text-white/40",
} as const;

const COLORES_FONDO_SEMAFORO = {
    verde: "bg-emerald-400/20",
    ambar: "bg-amber-400/20",
    rojo: "bg-rose-400/20",
    desconocido: "bg-white/5",
} as const;

type ColorSemafoto = keyof typeof COLORES_SEMAFORO;

function PuntoSemafoto({ color, size = 6 }: { color: ColorSemafoto; size?: number }) {
    return (
        <span
            className={`inline-block rounded-full ${COLORES_SEMAFORO[color]} ${COLORES_FONDO_SEMAFORO[color]}`}
            style={{ width: size, height: size, boxShadow: `0 0 ${size * 1.5}px ${color !== "desconocido" ? "currentColor" : "transparent"}` }}
            aria-hidden="true"
        />
    );
}

function EtiquetaMetrica({ icono, valor, etiqueta, colorPunto }: { icono: React.ReactNode; valor: string; etiqueta: string; colorPunto?: ColorSemafoto }) {
    return (
        <div className="flex items-center gap-1.5" title={etiqueta}>
            <span className="text-white/60 text-[10px]">{icono}</span>
            {colorPunto && <PuntoSemafoto color={colorPunto} size={5} />}
            <span className="font-mono text-[11px] tabular-nums text-white/90">{valor}</span>
            <span className="text-white/40 text-[9px] uppercase tracking-wider">{etiqueta}</span>
        </div>
    );
}

export function MedidorCalidad({
    modo,
    sesionActiva,
    onCuadro,
    onAcuse,
    onCuadroEnviado,
    onAcuseRecibido,
    medioReal,
    calidadCodigo,
    expandido = false,
    onToggleExpandir,
    className = "",
}: Props) {
    const lado: LadoCalidad = modo === "controlador" ? "controlador" : "aparato";
    const medidorRef = useRef(crearMedidor(lado));
    const [metricas, setMetricas] = useState<MetricasCalidad | null>(null);
    const [hover, setHover] = useState(false);
    const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Exponer funciones de registro para que las use el lado correspondiente
    useEffect(() => {
        const m = medidorRef.current;
        if (modo === "controlador") {
            if (onCuadro) onCuadro = (e) => { m.registrarCuadro(e); };
            if (onAcuse) onAcuse = (e) => { m.registrarAcuse(e); };
        } else {
            if (onCuadroEnviado) onCuadroEnviado = (e) => { m.registrarCuadro(e); };
            if (onAcuseRecibido) onAcuseRecibido = (e) => { m.registrarAcuse(e); };
        }
    }, [modo, onCuadro, onAcuse, onCuadroEnviado, onAcuseRecibido]);

    // Actualizar medio y calidad cuando cambian
    useEffect(() => {
        const m = medidorRef.current;
        if (medioReal) m.actualizarMedio(medioReal);
        if (calidadCodigo) m.actualizarCalidad(calidadCodigo);
    }, [medioReal, calidadCodigo]);

    // Bucle de actualización de métricas (cada 500 ms)
    useEffect(() => {
        const m = medidorRef.current;
        const actualizar = () => {
            if (!sesionActiva) {
                setMetricas(null);
                return;
            }
            setMetricas(m.obtenerMetricas());
        };
        actualizar();
        intervaloRef.current = setInterval(actualizar, 500);
        return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
    }, [sesionActiva]);

    if (!sesionActiva) return null;

    const f = metricas ? formatearMetricas(metricas) : null;
    const fpsColor = metricas ? colorFps(metricas.fps) : "desconocido";
    const rttColor = metricas ? colorRtt(metricas.rttMs) : "desconocido";
    const perdidasColor = metricas ? colorPerdidas(metricas.perdidas) : "desconocido";

    const esControlador = modo === "controlador";

    return (
        <div
            className={`
                pointer-events-auto fixed bottom-4 left-4 z-[2147483000]
                flex flex-col items-start gap-1.5
                rounded-xl border border-white/10 bg-[#10131a]/95 backdrop-blur-sm p-2.5
                shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-200
                ${expandido ? "w-[220px]" : "w-auto"}
                ${hover ? "border-white/20 shadow-[0_4px_32px_rgba(0,0,0,0.5)]" : ""}
                ${className}
            `}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={onToggleExpandir}
            role={onToggleExpandir ? "button" : undefined}
            tabIndex={onToggleExpandir ? 0 : undefined}
            aria-label={expandido ? "Contraer medidor de calidad" : "Expandir medidor de calidad"}
            aria-expanded={expandido}
        >
            {/* Línea principal: siempre visible */}
            <div className="flex items-center gap-2 min-w-0">
                <PuntoSemafoto color={fpsColor} size={8} />
                <span className="font-mono text-[12px] tabular-nums text-white/90 font-medium">{f?.fps ?? "—"}</span>
                <span className="text-white/40 text-[10px] uppercase tracking-wider">fps</span>
                {esControlador && (
                    <>
                        <PuntoSemafoto color={rttColor} size={6} />
                        <span className="font-mono text-[11px] tabular-nums text-white/80">{f?.rtt ?? "—"}</span>
                        <span className="text-white/40 text-[9px]">rtt</span>
                    </>
                )}
                <PuntoSemafoto color={perdidasColor} size={5} />
                <span className="font-mono text-[10px] tabular-nums text-white/70">{f?.perdidas ?? "—"}</span>
                <span className="text-white/40 text-[9px]">loss</span>
            </div>

            {/* Detalles expandidos */}
            {expandido && f && metricas && (
                <div className="w-full space-y-1 border-t border-white/10 pt-1.5">
                    {esControlador && (
                        <>
                            <EtiquetaMetrica
                                icono="↕"
                                valor={f.kbps}
                                etiqueta="kbps"
                                colorPunto={metricas.kbps !== null && metricas.kbps > 2000 ? "verde" : metricas.kbps !== null && metricas.kbps > 500 ? "ambar" : "rojo"}
                            />
                            <EtiquetaMetrica
                                icono="📐"
                                valor={f.resolucion}
                                etiqueta="res"
                            />
                            <EtiquetaMetrica
                                icono="🎞"
                                valor={f.calidad}
                                etiqueta="codec"
                            />
                        </>
                    )}
                    <EtiquetaMetrica
                        icono="📡"
                        valor={f.medio}
                        etiqueta="medio"
                        colorPunto={
                            f.medio === "wifi-directo" || f.medio === "red-local" ? "verde" :
                            f.medio === "bluetooth" || f.medio === "internet" ? "ambar" :
                            f.medio === "nodo" || f.medio === "servidor" || f.medio === "turn" ? "rojo" :
                            "desconocido"
                        }
                    />
                    <div className="flex items-center justify-between text-[10px] text-white/40 border-t border-white/5 pt-1">
                        <span>{esControlador ? "Controlador" : "Aparato"}</span>
                        <span className="font-mono">{new Date(metricas.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    </div>
                </div>
            )}

            {/* Indicador de click para expandir */}
            {onToggleExpandir && !expandido && (
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </div>
            )}
        </div>
    );
}

// Alias para compatibilidad con el nombre que usa la tarea
export const medidorCalidad = MedidorCalidad;
export default MedidorCalidad;