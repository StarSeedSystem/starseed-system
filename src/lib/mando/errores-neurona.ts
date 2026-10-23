/**
 * Errores con el FORMATO de evento del SDK de Sentry para la autocuración de Genesis
 * (Ola 1020S · RLB1020J): el servidor de Sentry no cabe autoalojado (16 GB + swap) y su
 * licencia FSL no es abierta, así que el OS usa su formato. 100 % puro: sin red, sin disco,
 * sin `node:*`; importable del cliente.
 */

export type AmbitoError = "neurona" | "cerebro" | "perfil" | "cuenta" | "pagina" | "proceso" | "contenido";
export interface MarcoPila { filename: string; function: string; lineno: number; colno: number; in_app: boolean }
export interface ValorExcepcion { type: string; value: string; stacktrace: { frames: MarcoPila[] } }
export interface ContextoError { ambito: string; neurona?: string; proceso?: string }
export interface GrupoErrores { huella: string; veces: number; primero: number; ultimo: number; ejemplo: EventoSentry }

export interface EventoSentry {
    event_id: string; timestamp: number; level: "error"; platform: "javascript";
    exception: { values: ValorExcepcion[] };
    tags: { ambito: AmbitoError; neurona: string; proceso: string };
    fingerprint: string[];
}
const AMBITOS = new Set<string>(["neurona", "cerebro", "perfil", "cuenta", "pagina", "proceso", "contenido"]);


/** Enmascara correos, teléfonos, IP, tokens (sk-, gsk_, Bearer, eyJ…) y rutas /Users/<nombre>. */
function limpiarTexto(texto: string): string {
    return texto
        .replace(/\/Users\/[^\s"'`,:;)\\]+/g, "/Users/[anonimo]")
        .replace(/\beyJ[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9_-]{8,}|\bgsk_[A-Za-z0-9_-]{8,}/g, "[token]")
        .replace(/\bBearer\s+\S+/gi, "Bearer [token]")
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[correo]")
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[ip]")
        .replace(/\+\d[\d ()-]{7,}\d|\b\d{9,}\b/g, "[teléfono]");
}

/** event_id estilo Sentry: 32 signos hexadecimales, sin recurrir a `node:crypto`. */
function nuevoId(): string {
    let id = "";
    for (let i = 0; i < 32; i++) id += "0123456789abcdef"[Math.floor(Math.random() * 16)];
    return id;
}

/** FNV-1a de 32 bits: huella estable entre aparatos, sin dependencias. */
function resumen(texto: string): string {
    let v = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) { v ^= texto.charCodeAt(i); v = Math.imul(v, 0x01000193) >>> 0; }
    return v.toString(16).padStart(8, "0");
}

function datosDeError(e: unknown): { type: string; value: string } {
    if (e instanceof Error) return { type: e.name || "Error", value: e.message || "(sin mensaje)" };
    if (typeof e === "string") return { type: "Error", value: e };
    if (typeof e === "object" && e !== null) {
        const c = e as Record<string, unknown>;
        return { type: typeof c.name === "string" && c.name ? c.name : "Object", value: String(c.message ?? "(sin mensaje)") };
    }
    return { type: "Error", value: String(e) };
}

/** Pila V8 «at función (archivo:línea:columna)»: node_modules y nativo no son propios. */
function marcosDe(stack?: string): MarcoPila[] {
    if (!stack) return [];
    const marcos: MarcoPila[] = [];
    for (const linea of stack.split("\n")) {
        const m = /at\s+(?:(\S+?)\s+\()?([^\s()]+?):(\d+):(\d+)\)?/.exec(linea);
        if (!m) continue;
        marcos.push({ function: m[1] ?? "", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|<anonymous>/.test(m[2]) });
    }
    return marcos;
}

/** Huella para agrupar: ámbito + tipo de excepción + primer marco propio (in_app). */
export function huella(evento: EventoSentry): string {
    const valor = evento.exception.values[0];
    const marco = valor?.stacktrace.frames.find((f) => f.in_app);
    const materia = `${evento.tags.ambito}|${valor?.type ?? "Error"}|${marco ? `${marco.filename}#${marco.function}` : "sin-marco"}`;
    return `h${resumen(materia)}`;
}

/** Quita o enmascara los datos personales del evento (mensaje, marcos y etiquetas); copia limpia. */
export function limpiarDatosPersonales(evento: EventoSentry): EventoSentry {
    const valores = evento.exception.values.map((v) => ({
        ...v, type: limpiarTexto(v.type), value: limpiarTexto(v.value),
        stacktrace: { frames: v.stacktrace.frames.map((f) => ({ ...f, filename: limpiarTexto(f.filename), function: limpiarTexto(f.function) })) },
    }));
    const etiquetas = { ...evento.tags, neurona: limpiarTexto(evento.tags.neurona), proceso: limpiarTexto(evento.tags.proceso) };
    return { ...evento, exception: { values: valores }, tags: etiquetas };
}

/** Normaliza cualquier-error → evento estilo Sentry {event_id, timestamp, level, platform, exception, tags, fingerprint}. */
export function normalizarError(e: unknown, contexto: ContextoError): EventoSentry {
    const { type, value } = datosDeError(e);
    const marcos = marcosDe(e instanceof Error && typeof e.stack === "string" ? e.stack : undefined);
    const evento: EventoSentry = {
        event_id: nuevoId(),
        timestamp: Math.floor(Date.now() / 1000),
        level: "error",
        platform: "javascript",
        exception: { values: [{ type, value, stacktrace: { frames: marcos } }] },
        tags: { ambito: (AMBITOS.has(contexto.ambito) ? contexto.ambito : "proceso") as AmbitoError, neurona: contexto.neurona ?? "", proceso: contexto.proceso ?? "" },
        fingerprint: [],
    };
    const limpio = limpiarDatosPersonales(evento);
    limpio.fingerprint = [huella(limpio)];
    return limpio;
}

/** Agrupa por huella: veces, ventana de tiempo y evento de ejemplo; primero los más repetidos. */
export function agrupar(eventos: EventoSentry[]): GrupoErrores[] {
    const grupos = new Map<string, GrupoErrores>();
    for (const evento of eventos) {
        const clave = evento.fingerprint[0] ?? huella(evento);
        const actual = grupos.get(clave);
        if (!actual) grupos.set(clave, { huella: clave, veces: 1, primero: evento.timestamp, ultimo: evento.timestamp, ejemplo: evento });
        else {
            actual.veces += 1;
            actual.primero = Math.min(actual.primero, evento.timestamp);
            actual.ultimo = Math.max(actual.ultimo, evento.timestamp);
        }
    }
    return [...grupos.values()].sort((a, b) => b.veces - a.veces || b.ultimo - a.ultimo);
}
