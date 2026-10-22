// Eventos de error estilo Sentry (formato del SDK) para la autocuración de Genesis (Ola 1020S).
// Módulo puro: sin red, sin disco, sin envíos a terceros.

export type AmbitoError = "neurona" | "cerebro" | "perfil" | "cuenta" | "pagina" | "proceso" | "contenido";

export interface MarcoError { filename: string; function: string; lineno: number; colno: number; in_app: boolean }

export interface ExcepcionError { type: string; value: string; stacktrace: { frames: MarcoError[] } }

export interface EventoError {
    event_id: string;
    timestamp: number;
    level: string;
    platform: string;
    exception: { values: ExcepcionError[] };
    tags: { ambito: AmbitoError; neurona: string; proceso: string };
    fingerprint: string[];
}
export interface ContextoError { ambito: AmbitoError; neurona?: string; proceso?: string }
export interface GrupoErrores { huella: string[]; veces: number; primero: number; ultimo: number; ejemplo: EventoError }

function extraer(error: unknown): { type: string; value: string; stack: string } {
    if (error instanceof Error) {
        return { type: error.name || "Error", value: error.message || "", stack: error.stack || "" };
    }
    if (typeof error === "string") return { type: "Error", value: error, stack: "" };
    if (error && typeof error === "object" && "stack" in error) {
        const como = error as { name?: string; message?: string; stack?: string };
        return { type: como.name || "Error", value: como.message || "", stack: como.stack || "" };
    }
    return { type: "Error", value: JSON.stringify(error) ?? String(error), stack: "" };
}

const MARCO_RX = /^\s*at\s+(?:(.+?)\s+\()?([^()]+?):(\d+):(\d+)\)?\s*$/;

export function marcos(pila: string): MarcoError[] {
    return pila.split("\n").flatMap((linea) => {
        const m = MARCO_RX.exec(linea);
        if (!m) return [];
        const filename = (m[2] ?? "").trim();
        return [{ filename, function: (m[1] ?? "").trim(), lineno: Number(m[3]), colno: Number(m[4]), in_app: !filename.includes("node_modules") }];
    }).slice(0, 30);
}

// El orden importa: primero los Bearer y JWT completos, al final IP y teléfono.
const MASCARAS: Array<[RegExp, string]> = [
    [/Bearer\s+eyJ[A-Za-z0-9._-]{5,}\.[A-Za-z0-9._-]{5,}\.[A-Za-z0-9._-]{3,}/g, "Bearer [token]"],
    [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [token]"],
    [/eyJ[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{3,}/g, "[jwt]"],
    [/\bsk-[A-Za-z0-9_-]{8,}/g, "[token]"],
    [/\bgsk_[A-Za-z0-9_-]{8,}/g, "[token]"],
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[correo]"],
    [/Users\/[^/\s:,]+/g, "Users/<usuario>"],
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
];

export function limpiarTexto(texto: string): string {
    let limpio = texto;
    for (const [patron, sustitucion] of MASCARAS) limpio = limpio.replace(patron, sustitucion);
    // Un teléfono lleva separadores o «+»; un identificador numérico sin ellos no se toca.
    return limpio.replace(/\+?\d[\d\s().-]{7,}\d/g, (trozo) => (/[\s().-]/.test(trozo) ? "[teléfono]" : trozo));
}
function generarId(): string {
    let hex = "";
    for (let i = 0; i < 32; i++) hex += i === 12 ? "4" : i === 16 ? "89ab"[Math.floor(Math.random() * 4)] : "0123456789abcdef"[Math.floor(Math.random() * 16)];
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Convierte cualquier fallo del OS en un evento con el formato del SDK de Sentry. */
export function normalizarError(error: unknown, contexto: ContextoError): EventoError {
    const e = extraer(error);
    return {
        event_id: generarId(),
        timestamp: Math.floor(Date.now() / 1000),
        level: "error",
        platform: "javascript",
        exception: { values: [{ type: e.type, value: e.value, stacktrace: { frames: marcos(e.stack) } }] },
        tags: { ambito: contexto.ambito, neurona: contexto.neurona ?? "local", proceso: contexto.proceso ?? "genesis" },
        fingerprint: [],
    };
}

/** Quita o enmascara correos, teléfonos, IP, tokens y rutas de usuario de un evento. */
export function limpiarDatosPersonales(evento: EventoError): EventoError {
    for (const valor of evento.exception.values) {
        valor.value = limpiarTexto(valor.value);
        for (const marco of valor.stacktrace.frames) {
            marco.filename = limpiarTexto(marco.filename);
            marco.function = limpiarTexto(marco.function);
        }
    }
    return evento;
}

/** Agrupa por tipo + primer marco propio (archivo:línea) + ámbito, y fija la huella del evento. */
export function huella(evento: EventoError): string[] {
    const valor = evento.exception.values[0];
    const propios = (valor?.stacktrace.frames ?? []).filter((m) => m.in_app);
    const elegido = propios[0] ?? valor?.stacktrace.frames[0];
    const piezas = [valor?.type || "Error", elegido ? `${elegido.filename}:${elegido.lineno}` : "", evento.tags.ambito];
    evento.fingerprint = piezas;
    return piezas;
}

/** Reúne eventos por huella: cuántas veces, primera y última vez, y un ejemplo. */
export function agrupar(eventos: EventoError[]): GrupoErrores[] {
    const grupos = new Map<string, GrupoErrores>();
    for (const evento of eventos) {
        const clave = evento.fingerprint.join(" · ");
        const actual = grupos.get(clave);
        if (!actual) {
            grupos.set(clave, { huella: [...evento.fingerprint], veces: 1, primero: evento.timestamp, ultimo: evento.timestamp, ejemplo: evento });
            continue;
        }
        actual.veces += 1;
        actual.primero = Math.min(actual.primero, evento.timestamp);
        if (evento.timestamp >= actual.ultimo) { actual.ultimo = evento.timestamp; actual.ejemplo = evento; }
    }
    return Array.from(grupos.values()).sort((a, b) => b.ultimo - a.ultimo);
}