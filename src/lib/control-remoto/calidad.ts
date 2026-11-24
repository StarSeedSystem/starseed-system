/**
 * CTL1119B · medidor activo de calidad del control: fps, retardo, kbps, resolución,
 * calidad/códec, pérdidas y medio en tiempo real.
 *
 * Módulo PURO (sin red, sin disco, sin reloj): funciones de entrada → salida que
 * calculan métricas a partir de los cuadros recibidos y los acuses de las órdenes.
 * Lo usan tanto el lado que manda (PantallaDestino) como el nativo
 * (control_pantalla_escritorio.rs, Android, macOS).
 */

export const VENTANA_FPS_MS = 3_000;
export const INTERVALO_REGISTRO_MS = 10_000;
export const VIDA_ORDEN_MS = 120_000;

export type TipoMedio =
    | "bluetooth"
    | "wifi-directo"
    | "red-local"
    | "internet"
    | "nodo"
    | "turn"
    | "servidor"
    | "lora"
    | "sin-determinar";

export type Lado = "controlador" | "aparato";

export interface CuadroRecibido {
    /** Momento en que llegó el cuadro (ms epoch). */
    t: number;
    /** Tamaño en bytes del cuadro (JPEG/VP8/H264…). */
    bytes: number;
    /** Ancho del cuadro en píxeles. */
    ancho: number;
    /** Alto del cuadro en píxeles. */
    alto: number;
    /** Código del códec si se sabe (vp8, vp9, h264, av1, jpeg…). */
    codec?: string;
    /** Calidad 1–100 si se sabe (JPEG/WebP). */
    calidad?: number;
    /** Si el cuadro llegó completo (false = se detectó pérdida en reensamblaje). */
    completo: boolean;
}

export interface AcuseOrden {
    /** Nonce de la orden que se acusa. */
    nonce: string;
    /** Momento en que se envió la orden (ms epoch). */
    tEnvio: number;
    /** Momento en que llegó el acuse (ms epoch). */
    tAcuse: number;
    /** Por qué medio viajó la orden (lo que dice el registro). */
    medio: TipoMedio;
    /** Si la orden se cumplió. */
    ok: boolean;
}

export interface MetricasCalidad {
    /** Cuadros por segundo en la última ventana de 3 s (una decimal). */
    fps: number;
    /** Retardo de ida y vuelta medio en ms (redondeado). */
    rttMs: number;
    /** Kilobits por segundo de vídeo en la última ventana (entero). */
    kbps: number;
    /** Resolución actual (ancho × alto). */
    resolucion: { ancho: number; alto: number } | null;
    /** Códec detectado (null = no se sabe). */
    codec: string | null;
    /** Calidad 1–100 si se sabe (null = no se sabe). */
    calidad: number | null;
    /** Porcentaje de cuadros con pérdida detectada (0–100, una decimal). */
    perdidaPct: number;
    /** Medio por el que viaja el vídeo ahora. */
    medio: TipoMedio;
    /** Lado que mide ("controlador" = quien manda, "aparato" = quien envía). */
    lado: Lado;
    /** Cuántos cuadros entraron en el cálculo del fps/kbps. */
    cuadrosEnVentana: number;
    /** Cuántos acuses entraron en el cálculo del rtt. */
    acusesEnVentana: number;
}

export interface EstadoCalidad {
    /** Cuadros recibidos (se podan los de más de VENTANA_FPS_MS). */
    cuadros: CuadroRecibido[];
    /** Acuses de órdenes (se podan los de más de VIDA_ORDEN_MS). */
    acuses: AcuseOrden[];
    /** Último registro emitido (ms epoch). */
    ultimoRegistro: number;
    /** Medio actual (lo que dice el estado vivo del control). */
    medioActual: TipoMedio;
    /** Lado que mide. */
    lado: Lado;
}

/** Crea un estado vacío. */
export function estadoInicial(lado: Lado, medio: TipoMedio = "sin-determinar"): EstadoCalidad {
    return {
        cuadros: [],
        acuses: [],
        ultimoRegistro: 0,
        medioActual: medio,
        lado,
    };
}

/** Añade un cuadro recibido y poda lo viejo. */
export function añadirCuadro(e: EstadoCalidad, c: CuadroRecibido): void {
    e.cuadros.push(c);
    const limite = c.t - VENTANA_FPS_MS;
    let i = 0;
    while (i < e.cuadros.length && e.cuadros[i].t < limite) i++;
    if (i > 0) e.cuadros.splice(0, i);
}

/** Añade un acuse de orden y poda lo viejo. */
export function añadirAcuse(e: EstadoCalidad, a: AcuseOrden): void {
    e.acuses.push(a);
    const limite = a.tAcuse - VIDA_ORDEN_MS;
    let i = 0;
    while (i < e.acuses.length && e.acuses[i].tAcuse < limite) i++;
    if (i > 0) e.acuses.splice(0, i);
}

/** Actualiza el medio actual (lo que dice el estado vivo). */
export function actualizarMedio(e: EstadoCalidad, medio: TipoMedio): void {
    e.medioActual = medio;
}

/** Calcula las métricas actuales a partir del estado. */
export function calcularMetricas(e: EstadoCalidad, ahora: number): MetricasCalidad {
    const limiteFps = ahora - VENTANA_FPS_MS;
    const enVentana = e.cuadros.filter((c) => c.t >= limiteFps);

    let fps = 0;
    let kbps = 0;
    let resolucion: { ancho: number; alto: number } | null = null;
    let codec: string | null = null;
    let calidad: number | null = null;
    let perdidaPct = 0;

    if (enVentana.length >= 2) {
        const tPrimero = enVentana[0].t;
        const tUltimo = enVentana[enVentana.length - 1].t;
        const dt = Math.max(1, tUltimo - tPrimero);
        fps = Math.round((enVentana.length * 1000) / dt * 10) / 10;

        const bytesTotales = enVentana.reduce((s, c) => s + c.bytes, 0);
        kbps = Math.round((bytesTotales * 8) / dt);

        const ult = enVentana[enVentana.length - 1];
        resolucion = { ancho: ult.ancho, alto: ult.alto };
        codec = ult.codec ?? null;
        calidad = ult.calidad ?? null;

        const conPerdida = enVentana.filter((c) => !c.completo).length;
        perdidaPct = Math.round((conPerdida / enVentana.length) * 1000) / 10;
    } else if (enVentana.length === 1) {
        const c = enVentana[0];
        fps = Math.round((1000 / VENTANA_FPS_MS) * 10) / 10;
        kbps = Math.round((c.bytes * 8) / VENTANA_FPS_MS);
        resolucion = { ancho: c.ancho, alto: c.alto };
        codec = c.codec ?? null;
        calidad = c.calidad ?? null;
    }

    let rttMs = 0;
    const acusesRecientes = e.acuses.filter((a) => a.ok && ahora - a.tAcuse <= 5_000);
    if (acusesRecientes.length > 0) {
        const suma = acusesRecientes.reduce((s, a) => s + (a.tAcuse - a.tEnvio), 0);
        rttMs = Math.round(suma / acusesRecientes.length);
    }

    return {
        fps,
        rttMs,
        kbps,
        resolucion,
        codec,
        calidad,
        perdidaPct,
        medio: e.medioActual,
        lado: e.lado,
        cuadrosEnVentana: enVentana.length,
        acusesEnVentana: acusesRecientes.length,
    };
}

/** Formatea la línea de registro `control-calidad fps=… rtt_ms=… kbps=… lado=… calidad=… medio=…`. */
export function lineaRegistro(m: MetricasCalidad): string {
    const res = m.resolucion ? `${m.resolucion.ancho}x${m.resolucion.alto}` : "desconocida";
    const cal = m.calidad !== null ? m.calidad : "desconocida";
    const cod = m.codec ?? "desconocido";
    return (
        `control-calidad fps=${m.fps} rtt_ms=${m.rttMs} kbps=${m.kbps} ` +
        `lado=${m.lado} resolucion=${res} calidad=${cal} codec=${cod} perdida_pct=${m.perdidaPct} medio=${m.medio}`
    );
}

/** Devuelve true si toca emitir registro (cada 10 s). */
export function tocaRegistro(e: EstadoCalidad, ahora: number): boolean {
    return ahora - e.ultimoRegistro >= INTERVALO_REGISTRO_MS;
}

/** Marca que se emitió el registro. */
export function marcarRegistro(e: EstadoCalidad, ahora: number): void {
    e.ultimoRegistro = ahora;
}

/** Texto corto para la UI ("24 fps · 45 ms · 1,2 Mbps · 1280×720 · Wi‑Fi directo"). */
export function textoUi(m: MetricasCalidad): string {
    const fps = m.fps > 0 ? `${m.fps.toFixed(1).replace(".", ",")} fps` : "— fps";
    const rtt = m.rttMs > 0 ? `${m.rttMs} ms` : "— ms";
    const kbps = m.kbps > 0 ? `${(m.kbps / 1000).toFixed(1).replace(".", ",")} Mbps` : "— Mbps";
    const res = m.resolucion ? `${m.resolucion.ancho}×${m.resolucion.alto}` : "—";
    const medio = nombreMedio(m.medio);
    return `${fps} · ${rtt} · ${kbps} · ${res} · ${medio}`;
}

/** Color del indicador según fps (verde ≥ 20, ámbar 10–19, rojo < 10). */
export function colorFps(fps: number): "verde" | "ambar" | "rojo" {
    if (fps >= 20) return "verde";
    if (fps >= 10) return "ambar";
    return "rojo";
}

function nombreMedio(m: TipoMedio): string {
    const nombres: Record<TipoMedio, string> = {
        bluetooth: "Bluetooth",
        "wifi-directo": "Wi‑Fi directo",
        "red-local": "Red local",
        internet: "Internet",
        nodo: "Nodo",
        turn: "TURN",
        servidor: "Servidor",
        lora: "LoRa",
        "sin-determinar": "desconocido",
    };
    return nombres[m];
}