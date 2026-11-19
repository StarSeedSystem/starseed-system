/**
 * CTL1119B · medidor de calidad del control: fps, retardo, kbps, resolución, pérdidas, medio en uso.
 * Módulo puro (sin red, sin disco, sin procesos lanzados).
 */

export interface MedicionCuadro {
    readonly ancho: number;
    readonly alto: number;
    readonly bytes: number;
    readonly timestamp: number;
    readonly retrasoMs?: number;
    readonly perdido?: boolean;
}

export interface AcuseOrden {
    readonly nonce: string;
    readonly timestampEnvio: number;
    readonly timestampRespuesta?: number;
    readonly exitoso: boolean;
}

export interface MedioUso {
    readonly tipo: "local" | "wifi" | "bluetooth" | "relé";
    readonly activo: boolean;
}

export interface ResultadoCalidad {
    readonly fps: number;
    readonly rttMs: number | null;
    readonly kbps: number;
    readonly resolucion: { ancho: number; alto: number } | null;
    readonly calidad: "excelente" | "buena" | "regular" | "mala";
    readonly perdidos: number;
    readonly medio: MedioUso | null;
}

export interface MedidorCalidadEstado {
    private cuadros: MedicionCuadro[];
    private acuses: AcuseOrden[];
    private ventanaMs: number;
    private ultimoEstado: ResultadoCalidad | null;
}

const VENTANA_POR_DEFECTO = 3000;
const LIMITE_PERDIDOS = 0.1;

export function crearMedidorCalidad(ventanaMs = VENTANA_POR_DEFECTO): MedidorCalidadEstado {
    return {
        cuadros: [],
        acuses: [],
        ventanaMs,
        ultimoEstado: null,
    };
}

export function anadirCuadro(m: MedicionCuadro, estado: MedidorCalidadEstado): MedidorCalidadEstado {
    const cuadros = [...estado.cuadros, m].filter((c) => m.timestamp - c.timestamp <= estado.ventanaMs);
    return { ...estado, cuadros };
}

export function anadirAcuse(a: AcuseOrden, estado: MedidorCalidadEstado): MedidorCalidadEstado {
    const acuses = [...estado.acuses, a].filter((c) => a.timestampRespuesta ?? a.timestampEnvio - c.timestampEnvio <= estado.ventanaMs);
    return { ...estado, acuses };
}

function calcularFps(cuadros: MedicionCuadro[], ventanaMs: number): number {
    if (cuadros.length < 2) return 0;
    const ahora = cuadros[cuadros.length - 1].timestamp;
    const primerCuadro = cuadros.find((c) => ahora - c.timestamp <= ventanaMs);
    if (!primerCuadro) return 0;
    const segundos = (ahora - primerCuadro.timestamp) / 1000;
    const cuenta = cuadros.filter((c) => c.timestamp >= primerCuadro.timestamp).length;
    if (segundos <= 0) return 0;
    // FPS basado en intervalos entre cuadros consecutivos
    return Math.round(((cuenta - 1) / segundos) * 10) / 10;
}

function calcularRtt(acuses: AcuseOrden[]): number | null {
    const exitosos = acuses.filter((a) => a.exitoso && a.timestampRespuesta !== undefined);
    if (exitosos.length < 1) return null;
    const ultimos = exitosos.slice(-10);
    const suma = ultimos.reduce((a, c) => a + (c.timestampRespuesta! - c.timestampEnvio), 0);
    return Math.round(suma / ultimos.length);
}

function calcularKbps(cuadros: MedicionCuadro[], ventanaMs: number): number {
    if (cuadros.length < 2) return 0;
    const ahora = cuadros[cuadros.length - 1].timestamp;
    const enVentana = cuadros.filter((c) => ahora - c.timestamp <= ventanaMs);
    if (enVentana.length < 2) return 0;
    const primer = enVentana[0];
    const bytesTotal = enVentana.reduce((a, c) => a + c.bytes, 0);
    const cuenta = enVentana.length;
    const segundos = (ahora - primer.timestamp) / 1000;
    if (segundos <= 0) return 0;
    // KBPS: bytes promedio por segundo * 8 bits / 1000
    const bytesPromedio = bytesTotal / cuenta;
    return Math.round(bytesPromedio * 8 / segundos / 1000 * 10) / 10;
}

function calcularResolucion(cuadros: MedicionCuadro[]): { ancho: number; alto: number } | null {
    if (cuadros.length === 0) return null;
    const ultimos = cuadros.slice(-5);
    const ancho = Math.round(ultimos.reduce((a, c) => a + c.ancho, 0) / ultimos.length);
    const alto = Math.round(ultimos.reduce((a, c) => a + c.alto, 0) / ultimos.length);
    return { ancho, alto };
}

function calcularPerdidos(cuadros: MedicionCuadro[]): number {
    if (cuadros.length === 0) return 0;
    const perdidos = cuadros.filter((c) => c.perdido).length;
    return perdidos / cuadros.length;
}

function determinarCalidad(fps: number, rttMs: number | null, perdidos: number, kbps: number): "excelente" | "buena" | "regular" | "mala" {
    if (fps >= 25 && (rttMs === null || rttMs <= 50) && perdidos < 0.05 && kbps >= 500) return "excelente";
    if (fps >= 15 && (rttMs === null || rttMs <= 100) && perdidos < 0.1 && kbps >= 200) return "buena";
    if (fps >= 5 && (rttMs === null || rttMs <= 200) && perdidos < 0.2) return "regular";
    return "mala";
}

export function medir(estado: MedidorCalidadEstado, medio?: MedioUso): ResultadoCalidad {
    const fps = calcularFps(estado.cuadros, estado.ventanaMs);
    const rttMs = calcularRtt(estado.acuses);
    const kbps = calcularKbps(estado.cuadros, estado.ventanaMs);
    const resolucion = calcularResolucion(estado.cuadros);
    const perdidos = calcularPerdidos(estado.cuadros);
    const calidad = determinarCalidad(fps, rttMs, perdidos, kbps);
    return { fps, rttMs, kbps, resolucion, calidad, perdidos, medio: medio ?? null };
}

export function reiniciar(estado: MedidorCalidadEstado): MedidorCalidadEstado {
    return {
        cuadros: [],
        acuses: [],
        ventanaMs: estado.ventanaMs,
        ultimoEstado: null,
    };
}