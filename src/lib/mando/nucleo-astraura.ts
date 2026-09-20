/**
 * Lógica pura del Núcleo Astraura (BitNet 1.58, Needle 3 y renovación).
 */

export type EstadoTarjeta = "vivo" | "cargando" | "caido" | "sin_datos";

export interface EstadoRenovacion {
    paquete?: { instalado?: string; pypi?: string; t?: string | number };
    pesos?: { sha?: string; hf_modificado?: string; archivo?: string; rechazado?: boolean };
    siguiente_mayor?: { needle4?: boolean; hf_modificado?: string };
    cambios?: string[];
}

export interface BitnetStatus {
    disponible?: boolean;
    estado?: EstadoTarjeta;
    modelo?: string;
    puerto?: number;
    detalle?: string;
}

export interface NeedleStatus {
    needle3?: { disponible?: boolean; paquete?: string; pesos_mb?: number; pesos_fecha?: string; error?: string };
    needle2?: { disponible?: boolean; esp32?: boolean; estado?: EstadoTarjeta; detalle?: string };
}

export interface TarjetaNucleo {
    nombre: string;
    estado: EstadoTarjeta;
    detalle: string;
    tono: string;
}

const TONOS: Record<EstadoTarjeta, string> = {
    vivo: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    cargando: "border-trinity-azure/30 bg-trinity-azure/10 text-trinity-azure",
    caido: "border-red-400/30 bg-red-500/10 text-red-200",
    sin_datos: "border-white/10 bg-white/5 text-white/60",
};

export function leerEstadoRenovacion(json: string | unknown): EstadoRenovacion | null {
    if (!json) return null;
    let obj: unknown = json;
    if (typeof json === "string") {
        try {
            obj = JSON.parse(json);
        } catch {
            return null;
        }
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
    const r = obj as Record<string, unknown>;
    return {
        paquete: typeof r.paquete === "object" && r.paquete ? (r.paquete as EstadoRenovacion["paquete"]) : undefined,
        pesos: typeof r.pesos === "object" && r.pesos ? (r.pesos as EstadoRenovacion["pesos"]) : undefined,
        siguiente_mayor: typeof r.siguiente_mayor === "object" && r.siguiente_mayor ? (r.siguiente_mayor as EstadoRenovacion["siguiente_mayor"]) : undefined,
        cambios: Array.isArray(r.cambios) ? (r.cambios as string[]) : [],
    };
}

export function frescura(t: string | number | Date | null | undefined, ahora = new Date()): string {
    if (t === null || t === undefined || t === "") return "fecha desconocida";
    const fecha = t instanceof Date ? t : new Date(typeof t === "number" && t < 1e11 ? t * 1000 : t);
    if (isNaN(fecha.getTime())) return "fecha desconocida";
    const diffMs = ahora.getTime() - fecha.getTime();
    if (diffMs < 0) return "hace instantes";
    const segs = Math.floor(diffMs / 1000);
    if (segs < 60) return `hace ${segs} s`;
    const mins = Math.floor(segs / 60);
    if (mins < 60) return `hace ${mins} min`;
    const horas = Math.floor(mins / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.floor(horas / 24);
    return `hace ${dias} d`;
}

export function avisoVersionMayor(renovacion?: EstadoRenovacion | null): string | null {
    if (renovacion?.siguiente_mayor?.needle4) {
        return "Hay una versión mayor nueva: la decide Alex";
    }
    return null;
}

export function resumenNucleo(params: {
    bitnet?: BitnetStatus | null;
    needle?: NeedleStatus | null;
    renovacion?: EstadoRenovacion | null;
}): TarjetaNucleo[] {
    const { bitnet, needle, renovacion } = params;

    const estadoBitnet: EstadoTarjeta =
        bitnet?.estado ?? (bitnet?.disponible ? "vivo" : bitnet?.disponible === false ? "caido" : "sin_datos");
    const detalleBitnet =
        bitnet?.detalle ?? (bitnet?.disponible ? "BitNet b1.58 2B-4T · puerto 8790" : "Sin respuesta en puerto 8790");

    const estadoNeedle3: EstadoTarjeta = needle?.needle3?.disponible
        ? "vivo"
        : needle?.needle3?.error || needle?.needle3?.disponible === false
        ? "caido"
        : "sin_datos";
    const pkg = needle?.needle3?.paquete ?? renovacion?.paquete?.instalado ?? "3.0.2";
    const pesosMb = needle?.needle3?.pesos_mb ?? 35;
    const pesosFecha = needle?.needle3?.pesos_fecha ?? "19/09";
    const renovadoTxt = frescura(renovacion?.paquete?.t);
    const detalleNeedle3 = `paquete ${pkg} · pesos ${pesosMb} MB del ${pesosFecha} · renovado ${renovadoTxt}`;

    const estadoNeedle2: EstadoTarjeta = needle?.needle2?.disponible
        ? "vivo"
        : needle?.needle2?.disponible === false
        ? "caido"
        : "sin_datos";
    const detalleNeedle2 =
        needle?.needle2?.detalle ?? (needle?.needle2?.disponible ? "Needle 2 · ESP32 embebido activo" : "ESP32 no detectado");

    return [
        { nombre: "BitNet 1.58", estado: estadoBitnet, detalle: detalleBitnet, tono: TONOS[estadoBitnet] },
        { nombre: "Needle 3", estado: estadoNeedle3, detalle: detalleNeedle3, tono: TONOS[estadoNeedle3] },
        { nombre: "Needle 2 / ESP32", estado: estadoNeedle2, detalle: detalleNeedle2, tono: TONOS[estadoNeedle2] },
    ];
}
