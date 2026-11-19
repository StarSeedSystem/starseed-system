/**
 * CTL1119B · Medidor activo de calidad del control remoto.
 * Calcula fps (ventana 3 s), retardo de ida y vuelta, kbps, resolución, calidad/códec,
 * pérdidas y medio en uso. Emite una línea de registro cada 10 s.
 */

export type MedioControl =
    | "red-local"
    | "bluetooth"
    | "rele"
    | "internet"
    | "wifi-directo"
    | "malla"
    | "desconocido";

export interface MetricasCalidad {
    fps: number;
    rttMs: number;
    kbps: number;
    ancho: number;
    alto: number;
    calidad: number;
    codec: string;
    perdidas: number;
    medio: MedioControl;
}

export interface MuestraCuadro {
    timestamp: number;
    bytes: number;
    ancho: number;
    alto: number;
    calidad: number;
    codec: string;
}

export interface MuestraOrden {
    timestampEnvio: number;
    timestampRespuesta: number;
    medio: MedioControl;
}

export interface ConfigCalidad {
    ventanaFpsMs: number;
    intervaloRegistroMs: number;
    ahora: () => number;
    anotar: (linea: string) => void;
}

const VENTANA_FPS_MS_DEFECTO = 3000;
const INTERVALO_REGISTRO_MS_DEFECTO = 10000;

export function crearMedidorCalidad(
    config: Partial<ConfigCalidad> = {}
): {
    registrarCuadro: (m: MuestraCuadro) => void;
    registrarOrden: (m: MuestraOrden) => void;
    establecerMedio: (medio: MedioControl) => void;
    obtenerMetricas: () => MetricasCalidad | null;
    iniciar: () => () => void;
} {
    const ahora = config.ahora ?? (() => Date.now());
    const anotar = config.anotar ?? (() => {});
    const ventanaFpsMs = config.ventanaFpsMs ?? VENTANA_FPS_MS_DEFECTO;
    const intervaloRegistroMs = config.intervaloRegistroMs ?? INTERVALO_REGISTRO_MS_DEFECTO;

    let cuadros: MuestraCuadro[] = [];
    let ordenes: MuestraOrden[] = [];
    let medioActual: MedioControl = "desconocido";
    let intervaloId: ReturnType<typeof setInterval> | null = null;

    function limpiarAntiguos<T extends { timestamp: number } | { timestampEnvio: number }>(cola: T[], desde: number): void {
        while (cola.length) {
            const item = cola[0];
            const ts = "timestamp" in item ? item.timestamp : item.timestampEnvio;
            if (ts < desde) cola.shift();
            else break;
        }
    }

    function registrarCuadro(m: MuestraCuadro): void {
        cuadros.push(m);
        limpiarAntiguos(cuadros, ahora() - ventanaFpsMs);
    }

    function registrarOrden(m: MuestraOrden): void {
        ordenes.push(m);
        limpiarAntiguos(ordenes, ahora() - ventanaFpsMs);
    }

    function establecerMedio(medio: MedioControl): void {
        medioActual = medio;
    }

    function calcularMetricas(): MetricasCalidad | null {
        const t = ahora();
        const desde = t - ventanaFpsMs;
        const cuadrosVentana = cuadros.filter((c) => c.timestamp >= desde);
        const ordenesVentana = ordenes.filter((o) => o.timestampEnvio >= desde);

        if (cuadrosVentana.length === 0 && ordenesVentana.length === 0) return null;

        const fps = cuadrosVentana.length / (ventanaFpsMs / 1000);

        let rttMs = 0;
        const ordenesConRespuesta = ordenesVentana.filter((o) => o.timestampRespuesta > o.timestampEnvio);
        if (ordenesConRespuesta.length > 0) {
            const sum = ordenesConRespuesta.reduce((s, o) => s + (o.timestampRespuesta - o.timestampEnvio), 0);
            rttMs = sum / ordenesConRespuesta.length;
        }

        const bytesTotal = cuadrosVentana.reduce((s, c) => s + c.bytes, 0);
        const kbps = (bytesTotal * 8) / Math.max(1, ventanaFpsMs);

        const ultimoCuadro = cuadrosVentana[cuadrosVentana.length - 1];
        const ancho = ultimoCuadro?.ancho ?? 0;
        const alto = ultimoCuadro?.alto ?? 0;
        const calidad = ultimoCuadro?.calidad ?? 0;
        const codec = ultimoCuadro?.codec ?? "desconocido";

        let perdidas = 0;
        if (ordenesVentana.length > 0) {
            const conRespuesta = ordenesVentana.filter((o) => o.timestampRespuesta > o.timestampEnvio).length;
            perdidas = ((ordenesVentana.length - conRespuesta) / ordenesVentana.length) * 100;
        }

        return { fps, rttMs, kbps, ancho, alto, calidad, codec, perdidas, medio: medioActual };
    }

    function emitirRegistro(): void {
        const m = calcularMetricas();
        if (!m) return;
        const linea = `control-calidad fps=${m.fps.toFixed(1)} rtt_ms=${Math.round(m.rttMs)} kbps=${Math.round(m.kbps)} lado=${m.ancho}x${m.alto} calidad=${m.calidad} codec=${m.codec} perdidas=${m.perdidas.toFixed(1)}% medio=${m.medio}`;
        anotar(linea);
    }

    function iniciar(): () => void {
        if (intervaloId) return () => {};
        intervaloId = setInterval(emitirRegistro, intervaloRegistroMs);
        return () => {
            if (intervaloId) {
                clearInterval(intervaloId);
                intervaloId = null;
            }
        };
    }

    function obtenerMetricas(): MetricasCalidad | null {
        return calcularMetricas();
    }

    return { registrarCuadro, registrarOrden, establecerMedio, obtenerMetricas, iniciar };
}