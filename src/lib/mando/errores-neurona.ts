/**
 * Errores de neurona, cerebro, perfil, cuenta, página, proceso o contenido con el formato
 * del SDK de Sentry —sin red, sin disco y sin enviar nada a terceros—. Genesis los recoge,
 * `limpiarDatosPersonales` borra datos personales, `huella` agrupa por tipo + primer marco
 * propio + ámbito y `agrupar` resume para la autocuración que ya existe.
 */

export type AmbitoError = "neurona" | "cerebro" | "perfil" | "cuenta" | "pagina" | "proceso" | "contenido";
export type NivelError = "fatal" | "error" | "warning" | "info" | "debug";
export interface ContextoError { ambito: AmbitoError; neurona?: string; proceso?: string; level?: NivelError; ahora?: number; event_id?: string; }
export interface MarcoSentry { filename?: string; function?: string; lineno?: number; colno?: number; in_app?: boolean; raw?: string; }
export interface ExcepcionSentry { type: string; value: string; stacktrace: { frames: MarcoSentry[] }; }
export interface EventoSentry { event_id: string; timestamp: number; level: NivelError; platform: "javascript"; exception: { values: ExcepcionSentry[] }; tags: { ambito: AmbitoError; neurona: string; proceso: string }; fingerprint: string[]; }
export interface GrupoErrores { huella: string[]; veces: number; primero: number; ultimo: number; ejemplo: EventoSentry; }

const REGLAS: ReadonlyArray<[RegExp, string]> = [
    [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]"],
    [/\/(?:Users|home)\/[^/\s]+/g, "/[usuario]"],
    [/\bsk-[A-Za-z0-9._-]{8,}/g, "[token]"],
    [/\bgsk_[A-Za-z0-9._-]{8,}/g, "[token]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]"],
    [/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, "[token]"],
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
    [/\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}\b/g, "[ip]"],
];

/** Quita o enmascara correos, rutas de usuario, tokens, IP y teléfonos. */
export function limpiarTexto(texto: string): string {
    let salida = texto;
    for (const [patron, reemplazo] of REGLAS) salida = salida.replace(patron, reemplazo);
    return salida.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => {
        const digitos = m.replace(/\D/g, "").length;
        return digitos >= 9 && digitos <= 15 ? "[telefono]" : m;
    });
}

function leerError(e: unknown): { type: string; value: string; stack?: string } {
    if (e instanceof Error) return { type: e.name || "Error", value: e.message, stack: e.stack };
    if (typeof e === "string") return { type: "Error", value: e };
    if (typeof e !== "object" || e === null) return { type: "Error", value: String(e) };
    const o = e as Record<string, unknown>;
    let value = typeof o.message === "string" ? o.message : "";
    if (!value) { try { value = JSON.stringify(o) ?? ""; } catch { value = "[objeto no serializable]"; } }
    return { type: typeof o.name === "string" ? o.name : "Error", value, stack: typeof o.stack === "string" ? o.stack : undefined };
}

function marcoDeLinea(linea: string): MarcoSentry {
    const texto = linea.trim().replace(/^at\s+/, "");
    const m = /^(.*?) \((.*?):(\d+):(\d+)\)$/.exec(texto) ?? /^(.*?):(\d+):(\d+)$/.exec(texto);
    if (!m) return { function: texto, in_app: !/node_modules|node:/.test(texto), raw: linea.trim() };
    const conFuncion = m.length === 5;
    const archivo = m[conFuncion ? 2 : 1];
    const marco = { function: conFuncion ? m[1] : undefined, filename: archivo, lineno: Number(m[conFuncion ? 3 : 2]), colno: Number(m[conFuncion ? 4 : 3]), in_app: !/node_modules|node:/.test(archivo), raw: linea.trim() };
    return marco;
}

/** Huella estable: tipo + primer marco propio + ámbito (no usa el mensaje). */
export function huella(evento: EventoSentry): string[] {
    const primera = evento.exception.values[0];
    const marcos = primera?.stacktrace.frames ?? [];
    const marco = marcos.find((m) => m.in_app !== false) ?? marcos[0];
    const lugar = marco ? `${marco.filename ?? marco.raw ?? "?"}:${marco.function ?? "?"}` : "sin-marco";
    return [primera?.type ?? "Error", limpiarTexto(lugar), evento.tags.ambito];
}

/** Convierte cualquier error en un evento con el formato del SDK de Sentry. */
export function normalizarError(e: unknown, contexto: ContextoError): EventoSentry {
    const { type, value, stack } = leerError(e);
    const frames = (stack ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).map(marcoDeLinea);
    const evento: EventoSentry = {
        event_id: contexto.event_id ?? Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        timestamp: (contexto.ahora ?? Date.now()) / 1000,
        level: contexto.level ?? "error",
        platform: "javascript",
        exception: { values: [{ type, value, stacktrace: { frames } }] },
        tags: { ambito: contexto.ambito, neurona: contexto.neurona ?? "", proceso: contexto.proceso ?? "" },
        fingerprint: [],
    };
    evento.fingerprint = huella(evento);
    return evento;
}

function limpiarMarco(m: MarcoSentry): MarcoSentry {
    return { ...m, filename: m.filename && limpiarTexto(m.filename), function: m.function && limpiarTexto(m.function), raw: m.raw && limpiarTexto(m.raw) };
}

/** Copia del evento sin datos personales; recalcula la huella. */
export function limpiarDatosPersonales(evento: EventoSentry): EventoSentry {
    const limpio: EventoSentry = {
        ...evento,
        exception: { values: evento.exception.values.map((v) => ({ ...v, value: limpiarTexto(v.value), stacktrace: { frames: v.stacktrace.frames.map(limpiarMarco) } })) },
        tags: { ...evento.tags, neurona: limpiarTexto(evento.tags.neurona), proceso: limpiarTexto(evento.tags.proceso) },
    };
    limpio.fingerprint = huella(limpio);
    return limpio;
}

/** Agrupa por huella y resume veces, primer/último momento y un ejemplo. */
export function agrupar(eventos: EventoSentry[]): GrupoErrores[] {
    const grupos = new Map<string, GrupoErrores>();
    for (const evento of eventos) {
        const partes = huella(evento);
        const clave = partes.join("\u0000");
        const grupo = grupos.get(clave);
        if (grupo) {
            grupo.veces += 1;
            grupo.primero = Math.min(grupo.primero, evento.timestamp);
            grupo.ultimo = Math.max(grupo.ultimo, evento.timestamp);
        } else {
            grupos.set(clave, { huella: partes, veces: 1, primero: evento.timestamp, ultimo: evento.timestamp, ejemplo: evento });
        }
    }
    return [...grupos.values()].sort((a, b) => b.veces - a.veces || b.ultimo - a.ultimo);
}
