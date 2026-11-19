/**
 * CTL1119B · Medidor activo de calidad del control.
 * Módulo PURO (sin red, sin disco, sin reloj): a partir de los cuadros recibidos y de los acuses de las órdenes
 * calcula fps (ventana de 3 s), retardo de ida y vuelta, kbps, resolución, calidad/códec, pérdidas y medio en uso.
 * Una línea de registro cada 10 s: `control-calidad fps= rtt_ms= kbps= lado= calidad= medio=`
 */

export type Lado = "controlador" | "aparato";

export type Medio =
    | "red-local"
    | "wifi-directo"
    | "bluetooth"
    | "relevo"
    | "turn"
    | "servidor"
    | "malla"
    | "desconocido";

export interface MedidaCuadro {
    /** Número de secuencia del cuadro (monotónico). */
    num: number;
    /** Timestamp de llegada (ms epoch, proporcionado por quien mide). */
    t: number;
    /** Tamaño en bytes del cuadro JPEG. */
    bytes: number;
    /** Ancho en píxeles. */
    ancho: number;
    /** Alto en píxeles. */
    alto: number;
    /** Nivel de calidad (0 = mejor, según NIVELES_CUADRO de ritmo-pantalla). */
    nivelCalidad: number;
    /** Si se detectó pérdida de partes de este cuadro. */
    perdido: boolean;
}

export interface MedidaOrden {
    /** Timestamp de envío de la orden (ms epoch). */
    enviado: number;
    /** Timestamp de respuesta (ms epoch). */
    respondido: number;
    /** Tipo de orden (para saber si es de entrada o lectura). */
    tipo: string;
    /** Vía por la que volvió la respuesta. */
    via: "datos" | "control";
}

export interface CalidadCalculada {
    /** Cuadros por segundo (ventana de 3 s, una decimal). */
    fps: number;
    /** Retardo de ida y vuelta en ms (media móvil exponencial). */
    rttMs: number;
    /** Kilobits por segundo (media de la ventana de 3 s). */
    kbps: number;
    /** Resolución actual. */
    resolucion: { ancho: number; alto: number } | null;
    /** Nivel de calidad actual (0 = mejor). */
    nivelCalidad: number;
    /** Códec inferido. */
    codec: "jpeg" | "h264" | "vp8" | "vp9" | "desconocido";
    /** Porcentaje de cuadros perdidos en la ventana (0-100, una decimal). */
    perdidasPct: number;
    /** Medio detectado. */
    medio: Medio;
    /** Lado que mide. */
    lado: Lado;
    /** Timestamp del cálculo (ms epoch). */
    timestamp: number;
}

/** Ventana de 3 s para fps y kbps. */
export const VENTANA_MS = 3000;
/** Intervalo de la línea de registro (10 s). */
export const INTERVALO_REGISTRO_MS = 10000;
/** Factor de suavizado para RTT (EMA). */
const ALFA_RTT = 0.3;
/** Umbral de KBPS para distinguir medios (heurística). */
const UMBRALES_MEDIO = {
    "bluetooth": 2000,
    "wifi-directo": 10000,
    "red-local": 50000,
} as const;

/** Estado interno del medidor (no se exporta, lo usa la clase). */
interface EstadoMedidor {
    cuadros: MedidaCuadro[];
    ordenes: MedidaOrden[];
    rttEma: number | null;
    ultimaLinea: number;
    medioActual: Medio;
    lado: Lado;
}

/** Crea un estado inicial vacío. */
function estadoInicial(lado: Lado): EstadoMedidor {
    return {
        cuadros: [],
        ordenes: [],
        rttEma: null,
        ultimaLinea: 0,
        medioActual: "desconocido",
        lado,
    };
}

/** Limpia mediciones fuera de la ventana de 3 s. */
function podarVentana(estado: EstadoMedidor, ahora: number): void {
    const corte = ahora - VENTANA_MS;
    estado.cuadros = estado.cuadros.filter((c) => c.t >= corte);
    estado.ordenes = estado.ordenes.filter((o) => o.respondido >= corte);
}

/** Calcula fps en la ventana actual. */
function calcularFps(estado: EstadoMedidor, ahora: number): number {
    const corte = ahora - VENTANA_MS;
    const enVentana = estado.cuadros.filter((c) => c.t >= corte && !c.perdido);
    if (enVentana.length < 2) return 0;
    const dt = (enVentana[enVentana.length - 1].t - enVentana[0].t) / 1000;
    if (dt <= 0) return 0;
    return Math.round((enVentana.length / dt) * 10) / 10;
}

/** Calcula KBPS en la ventana actual. */
function calcularKbps(estado: EstadoMedidor, ahora: number): number {
    const corte = ahora - VENTANA_MS;
    const enVentana = estado.cuadros.filter((c) => c.t >= corte && !c.perdido);
    if (enVentana.length < 2) return 0;
    const bytes = enVentana.reduce((s, c) => s + c.bytes, 0);
    const dt = Math.max(0.001, (enVentana[enVentana.length - 1].t - enVentana[0].t) / 1000);
    return Math.round((bytes * 8) / dt / 1000);
}

/** Calcula RTT EMA a partir de las órdenes respondidas. */
function calcularRtt(estado: EstadoMedidor): number {
    if (estado.ordenes.length === 0) return estado.rttEma ?? 0;
    const rtts = estado.ordenes
        .map((o) => o.respondido - o.enviado)
        .filter((x) => x > 0 && x < 5000);
    if (rtts.length === 0) return estado.rttEma ?? 0;
    const media = rtts.reduce((s, x) => s + x, 0) / rtts.length;
    if (estado.rttEma === null) return media;
    return Math.round(estado.rttEma * (1 - ALFA_RTT) + media * ALFA_RTT);
}

/** Inferir el medio a partir de KBPS y RTT. */
function inferirMedio(kbps: number, rttMs: number): Medio {
    if (kbps === 0) return "desconocido";
    if (rttMs > 150) return "relevo";
    if (rttMs > 100 && kbps < UMBRALES_MEDIO.bluetooth) return "bluetooth";
    if (rttMs > 50 && kbps < UMBRALES_MEDIO["wifi-directo"]) return "wifi-directo";
    if (kbps >= UMBRALES_MEDIO["red-local"]) return "red-local";
    return "red-local";
}

/** Resolución más reciente. */
function resolucionActual(estado: EstadoMedidor): { ancho: number; alto: number } | null {
    if (estado.cuadros.length === 0) return null;
    const u = estado.cuadros[estado.cuadros.length - 1];
    return { ancho: u.ancho, alto: u.alto };
}

/** Nivel de calidad más reciente. */
function nivelCalidadActual(estado: EstadoMedidor): number {
    if (estado.cuadros.length === 0) return 0;
    return estado.cuadros[estado.cuadros.length - 1].nivelCalidad;
}

/** Porcentaje de cuadros perdidos en la ventana. */
function perdidasPct(estado: EstadoMedidor, ahora: number): number {
    const corte = ahora - VENTANA_MS;
    const enVentana = estado.cuadros.filter((c) => c.t >= corte);
    if (enVentana.length === 0) return 0;
    const perdidos = enVentana.filter((c) => c.perdido).length;
    return Math.round((perdidos / enVentana.length) * 1000) / 10;
}

/** Códec inferido (por ahora siempre JPEG en este sistema). */
function codecInferido(_estado: EstadoMedidor): "jpeg" | "h264" | "vp8" | "vp9" | "desconocido" {
    return "jpeg";
}

/** Formatea la línea de registro. */
function formatearLinea(c: CalidadCalculada): string {
    const n = (v: number | null | undefined) =>
        v === null || v === undefined || !Number.isFinite(v) ? "sin-medir" : String(Math.round(v * 10) / 10);
    return `control-calidad fps=${n(c.fps)} rtt_ms=${n(c.rttMs)} kbps=${n(c.kbps)} lado=${c.lado} calidad=${c.nivelCalidad} medio=${c.medio}`;
}

/**
 * Medidor de calidad para un lado (controlador o aparato).
 * Recibe cuadros y acuses de órdenes, y calcula métricas en tiempo real.
 */
export class MedidorCalidad {
    private estado: EstadoMedidor;
    private callbacks: Set<(c: CalidadCalculada) => void> = new Set();
    private callbackLinea: ((linea: string) => void) | null = null;

    constructor(lado: Lado) {
        this.estado = estadoInicial(lado);
    }

    /** Registra la llegada de un cuadro. */
    registrarCuadro(c: MedidaCuadro): void {
        this.estado.cuadros.push(c);
    }

    /** Registra el envío y respuesta de una orden. */
    registrarOrden(o: MedidaOrden): void {
        this.estado.ordenes.push(o);
    }

    /** Calcula la calidad actual y opcionalmente emite la línea de registro si toca (cada 10 s). */
    calcular(ahora: number, emitirLinea = false): CalidadCalculada {
        podarVentana(this.estado, ahora);

        const fps = calcularFps(this.estado, ahora);
        const kbps = calcularKbps(this.estado, ahora);
        const rttMs = calcularRtt(this.estado);
        const resolucion = resolucionActual(this.estado);
        const nivelCalidad = nivelCalidadActual(this.estado);
        const perdidas = perdidasPct(this.estado, ahora);
        const codec = codecInferido(this.estado);
        const medio = inferirMedio(kbps, rttMs);

        this.estado.medioActual = medio;

        const resultado: CalidadCalculada = {
            fps,
            rttMs,
            kbps,
            resolucion,
            nivelCalidad,
            codec,
            perdidasPct: perdidas,
            medio,
            lado: this.estado.lado,
            timestamp: ahora,
        };

        for (const cb of this.callbacks) cb(resultado);

        if (emitirLinea && this.estado.ultimaLinea > 0 && ahora - this.estado.ultimaLinea >= INTERVALO_REGISTRO_MS) {
            this.estado.ultimaLinea = ahora;
            const linea = formatearLinea(resultado);
            this.callbackLinea?.(linea);
        }
        if (emitirLinea && this.estado.ultimaLinea === 0) {
            this.estado.ultimaLinea = ahora;
        }

        return resultado;
    }

    /** Suscribe a cambios de calidad calculada. */
    suscribir(cb: (c: CalidadCalculada) => void): () => void {
        this.callbacks.add(cb);
        return () => this.callbacks.delete(cb);
    }

    /** Establece callback para la línea de registro periódica. */
    alRegistrar(cb: (linea: string) => void): void {
        this.callbackLinea = cb;
    }

    /** Obtiene el medio actual detectado. */
    medio(): Medio {
        return this.estado.medioActual;
    }

    /** Reinicia el medidor (para nueva sesión). */
    reiniciar(): void {
        this.estado = estadoInicial(this.estado.lado);
    }
}

/** Crea un medidor para el lado controlador. */
export function crearMedidorControlador(): MedidorCalidad {
    return new MedidorCalidad("controlador");
}

/** Crea un medidor para el lado aparato. */
export function crearMedidorAparato(): MedidorCalidad {
    return new MedidorCalidad("aparato");
}

/** Funciones puras exportadas para tests. */
export const _internals = {
    podarVentana,
    calcularFps,
    calcularKbps,
    calcularRtt,
    inferirMedio,
    resolucionActual,
    nivelCalidadActual,
    perdidasPct,
    codecInferido,
    formatearLinea,
    estadoInicial,
    VENTANA_MS,
    INTERVALO_REGISTRO_MS,
    ALFA_RTT,
    UMBRALES_MEDIO,
};