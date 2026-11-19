/**
 * CTL1119B · Medidor activo de calidad del control: fps, retardo, kbps, resolución y medio en tiempo real.
 *
 * Módulo PURO (sin red, sin DOM, sin reloj real): recibe cuadros y acuses y devuelve métricas.
 * Se usa en ambos lados: el que manda (controlador) y el que recibe (aparato controlado).
 */

import type { MedioReal as MedioRealBase } from "./medio";

export type MedioReal = MedioRealBase;

export type LadoCalidad = "controlador" | "aparato";

export type MedioCalidad =
    | "red-local"
    | "wifi-directo"
    | "bluetooth"
    | "internet"
    | "turn"
    | "nodo"
    | "servidor"
    | "lora"
    | "sin-determinar";

export interface CalidadCodigo {
    codec: "h264" | "vp8" | "vp9" | "av1" | "jpeg" | "desconocido";
    perfil?: string;
    nivel?: string;
}

export interface MetricasCalidad {
    /** Cuadros por segundo (ventana de 3 s). */
    fps: number;
    /** Retardo de ida y vuelta en milisegundos. */
    rttMs: number | null;
    /** Kilobits por segundo estimados. */
    kbps: number | null;
    /** Resolución actual del vídeo. */
    resolucion: { ancho: number; alto: number } | null;
    /** Calidad/códec en uso. */
    calidad: CalidadCodigo | null;
    /** Porcentaje de cuadros/partes perdidos (0-100). */
    perdidas: number | null;
    /** Medio por el que viaja realmente. */
    medio: MedioCalidad;
    /** Lado que mide. */
    lado: LadoCalidad;
    /** Marca de tiempo de la medición (ms epoch). */
    timestamp: number;
}

/** Evento de cuadro recibido (desde el lado que recibe vídeo). */
export interface EventoCuadro {
    /** Número de secuencia del cuadro. */
    num: number;
    /** Tamaño en bytes del JPEG/frame. */
    bytes: number;
    /** Ancho del cuadro. */
    ancho: number;
    /** Alto del cuadro. */
    alto: number;
    /** Timestamp de recepción (ms epoch). */
    recibido: number;
    /** Timestamp de envío si viene en el cuadro (ms epoch), opcional. */
    enviado?: number;
    /** Si es una retransmisión. */
    retransmitido?: boolean;
}

/** Evento de acuse de orden (RTT medido). */
export interface EventoAcuse {
    /** Nonce de la orden. */
    nonce: string;
    /** RTT medido en ms. */
    rttMs: number;
    /** Timestamp del acuse (ms epoch). */
    recibido: number;
    /** Vía por la que volvió el acuse. */
    via: "datos" | "control";
}

/** Configuración del medidor. */
export interface ConfiguracionMedidor {
    /** Ventana para FPS (ms). Por defecto 3000. */
    ventanaFpsMs?: number;
    /** Ventana para KBPS (ms). Por defecto 5000. */
    ventanaKbpsMs?: number;
    /** Máximo de eventos a guardar. */
    maxEventos?: number;
    /** Intervalo de registro (ms). Por defecto 10000. */
    intervaloRegistroMs?: number;
}

/** Estado interno del medidor (no se expone directamente). */
interface EstadoMedidor {
    cuadros: EventoCuadro[];
    acuses: EventoAcuse[];
    ultimoRegistro: number;
    calidadActual: MetricasCalidad;
    lado: LadoCalidad;
    config: Required<ConfiguracionMedidor>;
}

/**
 * Crea un medidor de calidad para un lado concreto.
 * @param lado Quién mide: "controlador" (recibe vídeo) o "aparato" (envía vídeo y mide acuses).
 * @param config Configuración opcional.
 */
export function crearMedidor(lado: LadoCalidad, config: ConfiguracionMedidor = {}): {
    /** Registra un cuadro recibido. */
    registrarCuadro: (e: EventoCuadro) => void;
    /** Registra un acuse de orden (para RTT). */
    registrarAcuse: (e: EventoAcuse) => void;
    /** Actualiza el medio real en uso. */
    actualizarMedio: (medio: MedioReal) => void;
    /** Actualiza la info de códec/calidad si se sabe. */
    actualizarCalidad: (calidad: CalidadCodigo) => void;
    /** Obtiene las métricas actuales (calculadas al vuelo). */
    obtenerMetricas: (ahora?: number) => MetricasCalidad | null;
    /** Fuerza una línea de registro si toca por intervalo. */
    registrarSiToca: (anotar: (linea: string) => void, ahora?: number) => void;
    /** Reinicia el medidor. */
    reiniciar: () => void;
} {
    const estado: EstadoMedidor = {
        cuadros: [],
        acuses: [],
        ultimoRegistro: 0,
        calidadActual: { medio: "sin-determinar" } as MetricasCalidad,
        lado,
        config: {
            ventanaFpsMs: config.ventanaFpsMs ?? 3000,
            ventanaKbpsMs: config.ventanaKbpsMs ?? 5000,
            maxEventos: config.maxEventos ?? 500,
            intervaloRegistroMs: config.intervaloRegistroMs ?? 10000,
        },
    };

    function podar(ahora: number): void {
        const corteFps = ahora - estado.config.ventanaFpsMs;
        const corteKbps = ahora - estado.config.ventanaKbpsMs;
        estado.cuadros = estado.cuadros.filter((c) => c.recibido >= corteFps || c.recibido >= corteKbps);
        estado.acuses = estado.acuses.filter((a) => a.recibido >= corteFps);
        if (estado.cuadros.length > estado.config.maxEventos) {
            estado.cuadros = estado.cuadros.slice(-estado.config.maxEventos);
        }
        if (estado.acuses.length > estado.config.maxEventos) {
            estado.acuses = estado.acuses.slice(-estado.config.maxEventos);
        }
    }

    function calcularFps(ahora: number): number {
        const corte = ahora - estado.config.ventanaFpsMs;
        const enVentana = estado.cuadros.filter((c) => c.recibido >= corte && !c.retransmitido);
        if (enVentana.length < 2) return 0;
        const primero = enVentana[0];
        const ultimo = enVentana[enVentana.length - 1];
        const duracion = (ultimo.recibido - primero.recibido) / 1000;
        if (duracion <= 0) return 0;
        // FPS = (n-1) / duración en segundos: el primer cuadro marca el inicio, no cuenta como intervalo
        return Math.round(((enVentana.length - 1) / duracion) * 10) / 10;
    }

    function calcularKbps(ahora: number): number | null {
        const corte = ahora - estado.config.ventanaKbpsMs;
        const enVentana = estado.cuadros.filter((c) => c.recibido >= corte && !c.retransmitido);
        if (enVentana.length === 0) return null;
        const bytes = enVentana.reduce((s, c) => s + c.bytes, 0);
        const duracion = Math.max(1, (enVentana[enVentana.length - 1].recibido - enVentana[0].recibido) / 1000);
        return Math.round((bytes * 8) / duracion / 1000 * 10) / 10;
    }

    function calcularRtt(): number | null {
        if (estado.acuses.length === 0) return null;
        const recientes = estado.acuses.slice(-10);
        const suma = recientes.reduce((s, a) => s + a.rttMs, 0);
        return Math.round(suma / recientes.length);
    }

    function calcularPerdidas(): number | null {
        if (estado.cuadros.length < 2) return null;
        const nums = estado.cuadros.map((c) => c.num).sort((a, b) => a - b);
        let huecos = 0;
        for (let i = 1; i < nums.length; i++) {
            const diff = nums[i] - nums[i - 1];
            if (diff > 1) huecos += diff - 1;
        }
        const totalEsperado = nums[nums.length - 1] - nums[0] + 1;
        if (totalEsperado <= 0) return null;
        return Math.round((huecos / totalEsperado) * 1000) / 10;
    }

    function medioAString(m: MedioReal): MedioCalidad {
        if (m.camino === "sin-determinar" || m.medio === null) return "sin-determinar";
        switch (m.medio) {
            case "bluetooth": return "bluetooth";
            case "wifi-directo": return "wifi-directo";
            case "red-local": return "red-local";
            case "internet": return "internet";
            case "turn": return "turn";
            case "nodo": return "nodo";
            case "servidor": return "servidor";
            case "lora": return "lora";
            default: return "sin-determinar";
        }
    }

    function calidadACadena(c: CalidadCodigo | null): string {
        if (!c) return "desconocido";
        const partes: string[] = [c.codec];
        if (c.perfil) partes.push(c.perfil);
        if (c.nivel) partes.push(c.nivel);
        return partes.join(":");
    }

    function resolucionACadena(r: { ancho: number; alto: number } | null): string {
        if (!r) return "desconocida";
        return `${r.ancho}x${r.alto}`;
    }

    return {
        registrarCuadro(e) {
            const ahora = e.recibido;
            podar(ahora);
            estado.cuadros.push(e);
            if (!estado.calidadActual.resolucion || estado.calidadActual.resolucion.ancho !== e.ancho || estado.calidadActual.resolucion.alto !== e.alto) {
                estado.calidadActual = { ...estado.calidadActual, resolucion: { ancho: e.ancho, alto: e.alto } } as MetricasCalidad;
            }
        },
        registrarAcuse(e) {
            const ahora = e.recibido;
            podar(ahora);
            estado.acuses.push(e);
        },
        actualizarMedio(medio) {
            estado.calidadActual.medio = medioAString(medio);
        },
        actualizarCalidad(calidad) {
            estado.calidadActual.calidad = calidad;
        },
        obtenerMetricas(ahora = Date.now()) {
            podar(ahora);
            const fps = calcularFps(ahora);
            const kbps = calcularKbps(ahora);
            const rttMs = calcularRtt();
            const perdidas = calcularPerdidas();
            const resolucion = estado.calidadActual.resolucion ?? null;
            const calidad = estado.calidadActual.calidad ?? null;
            const medio = estado.calidadActual.medio ?? "sin-determinar";

            const metricas: MetricasCalidad = {
                fps,
                rttMs,
                kbps,
                resolucion,
                calidad,
                perdidas,
                medio,
                lado: estado.lado,
                timestamp: ahora,
            };
            estado.calidadActual = metricas;
            return metricas;
        },
        registrarSiToca(anotar, ahora = Date.now()) {
            if (ahora - estado.ultimoRegistro < estado.config.intervaloRegistroMs) return;
            const m = this.obtenerMetricas(ahora);
            if (!m) return;
            const linea = `control-calidad fps=${m.fps} rtt_ms=${m.rttMs ?? "sin-medir"} kbps=${m.kbps ?? "sin-medir"} lado=${m.lado} calidad=${calidadACadena(m.calidad)} medio=${m.medio} resolucion=${resolucionACadena(m.resolucion)} perdidas=${m.perdidas ?? "sin-medir"}`;
            anotar(linea);
            estado.ultimoRegistro = ahora;
        },
        reiniciar() {
            estado.cuadros = [];
            estado.acuses = [];
            estado.ultimoRegistro = 0;
            estado.calidadActual = { medio: "sin-determinar" } as MetricasCalidad;
        },
    };
}

/** Formatea las métricas para mostrar en UI compacta. */
export function formatearMetricas(m: MetricasCalidad): {
    fps: string;
    rtt: string;
    kbps: string;
    resolucion: string;
    calidad: string;
    medio: string;
    perdidas: string;
} {
    return {
        fps: m.fps > 0 ? `${m.fps}` : "—",
        rtt: m.rttMs !== null ? `${m.rttMs} ms` : "—",
        kbps: m.kbps !== null ? `${m.kbps}` : "—",
        resolucion: m.resolucion ? `${m.resolucion.ancho}x${m.resolucion.alto}` : "—",
        calidad: m.calidad ? `${m.calidad.codec}${m.calidad.perfil ? ` ${m.calidad.perfil}` : ""}${m.calidad.nivel ? ` L${m.calidad.nivel}` : ""}` : "—",
        medio: m.medio,
        perdidas: m.perdidas !== null ? `${m.perdidas}%` : "—",
    };
}

/** Color semáforo según FPS (verde ≥ 15, ámbar 5-15, rojo < 5). */
export function colorFps(fps: number): "verde" | "ambar" | "rojo" {
    if (fps >= 15) return "verde";
    if (fps >= 5) return "ambar";
    return "rojo";
}

/** Color semáforo según RTT (verde ≤ 80, ámbar 80-200, rojo > 200). */
export function colorRtt(rtt: number | null): "verde" | "ambar" | "rojo" | "desconocido" {
    if (rtt === null) return "desconocido";
    if (rtt <= 80) return "verde";
    if (rtt <= 200) return "ambar";
    return "rojo";
}

/** Color semáforo según pérdidas (verde ≤ 1%, ámbar 1-5%, rojo > 5%). */
export function colorPerdidas(p: number | null): "verde" | "ambar" | "rojo" | "desconocido" {
    if (p === null) return "desconocido";
    if (p <= 1) return "verde";
    if (p <= 5) return "ambar";
    return "rojo";
}