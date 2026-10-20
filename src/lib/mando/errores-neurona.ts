/** Errores por neurona en formato de evento de Sentry. Puro; sin red. */
export type Ambito = "neuron" | "cerebro" | "perfil" | "cuenta" | "pagina" | "proceso" | "contenido";
export interface ContextoError { ambito: Ambito; neurona: string; proceso: string; }
export interface EventoSentry {
    event_id: string; timestamp: string; level: "fatal" | "error" | "warning" | "info" | "debug";
    platform: string;
    exception: { values: Array<{ type: string; value: string | null; stacktrace?: { frames: Array<{ filename?: string; function?: string; lineno?: number }> } }>; };
    tags: { ambito: Ambito; neurona: string; proceso: string };
    fingerprint: string[];
}

function id(): string {
    const h = () => Math.floor(Math.random() * 16).toString(16);
    return Array.from({ length: 32 }, () => h()).join("");
}
function extraerTipoYMensaje(e: unknown): { tipo: string; mensaje: string } {
    if (e instanceof Error) return { tipo: e.name || "Error", mensaje: e.message || String(e) };
    if (typeof e === "string") return { tipo: "String", mensaje: e };
    if (e && typeof e === "object" && (e as Record<string, unknown>).message) return { tipo: "ObjectError", mensaje: String((e as Record<string, unknown>).message) };
    return { tipo: typeof e, mensaje: String(e) };
}
function framesDesdeStack(stack: string): Array<{ filename?: string; function?: string; lineno?: number }> {
    const out: typeof out = [];
    for (const linea of stack.split("\n").slice(1)) {
        const m = linea.match(/at\s+(.+?)\s+\((.+?):(\d+):?(\d*)\)/) || linea.match(/at\s+(.+?):(\d+):(\d+)/);
        if (m) out.push({ filename: m[2] || m[1] || "<anon>", function: (m[1] || "").trim() || "<anon>", lineno: m[3] ? parseInt(m[3], 10) : undefined });
        else if (linea.trim() && !linea.startsWith("at ")) out.push({ filename: linea.trim() });
    }
    return out.length ? out : [{ filename: "desconocido", function: "desconocido", lineno: 1 }];
}

export function normalizarError(e: unknown, contexto: ContextoError): EventoSentry {
    const { tipo, mensaje } = extraerTipoYMensaje(e);
    const frames = (e instanceof Error && e.stack) ? framesDesdeStack(e.stack) : [{ filename: "neuron-" + contexto.neurona, function: contexto.proceso, lineno: 1 }];
    return { event_id: id(), timestamp: new Date().toISOString(), level: "error", platform: "node",
        exception: { values: [{ type: tipo, value: mensaje, stacktrace: { frames } }] },
        tags: { ambito: contexto.ambito, neurona: contexto.neurona, proceso: contexto.proceso },
        fingerprint: [contexto.ambito, contexto.neurona, contexto.proceso, tipo] };
}

function limpiarTexto(t: string): string {
    let s = t;
    s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");
    s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]");
    s = s.replace(/\b\+?[\d\s\-\.]{7,20}\b/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "[TELEFONO]" : m));
    s = s.replace(/sk-[A-Za-z0-9_\-]{10,}/g, "[TOKEN-sk]");
    s = s.replace(/gsk_[A-Za-z0-9_\-]{10,}/g, "[TOKEN-gsk]");
    s = s.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "[TOKEN-Bearer]");
    s = s.replace(/eyJ[A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+){1,2}/g, "[TOKEN-JWT]");
    s = s.replace(/\/Users\/[^\/\s]+/g, "/Users/[NOMBRE]");
    s = s.replace(/\/home\/[A-Za-z0-9_\-]+/g, "/home/[NOMBRE]");
    return s;
}

export function limpiarDatosPersonales(evento: EventoSentry): EventoSentry {
    return { ...evento,
        exception: { values: evento.exception.values.map(v => ({ ...v, value: v.value !== null ? limpiarTexto(v.value) : null,
            stacktrace: v.stacktrace ? { frames: v.stacktrace.frames.map(f => ({ ...f, filename: f.filename ? limpiarTexto(f.filename) : f.filename, function: f.function ? limpiarTexto(f.function) : f.function })) } : v.stacktrace })) },
        tags: { ambito: evento.tags.ambito, neurona: limpiarTexto(evento.tags.neurona), proceso: limpiarTexto(evento.tags.proceso) },
        fingerprint: evento.fingerprint.map(limpiarTexto) };
}

export function huella(evento: EventoSentry): string {
    const tipo = evento.exception.values[0]?.type || "desconocido";
    const ambito = evento.tags.ambito;
    const fs = evento.exception.values[0]?.stacktrace?.frames || [];
    const propio = fs.find(f => (f.function && f.function !== "<anon>" && f.function.length > 0) || (f.filename && f.filename !== "<anon>" && f.filename.length > 0));
    const primero = propio?.function || fs[0]?.function || propio?.filename || fs[0]?.filename || "desconocido";
    return `${tipo}|${ambito}|${primero}`;
}

export function agrupar(eventos: EventoSentry[]): Record<string, { huella: string; veces: number; primero: string; ultimo: string; ejemplo: EventoSentry }> {
    const mapa = new Map<string, EventoSentry[]>();
    for (const ev of eventos) { const h = huella(ev); const arr = mapa.get(h) || []; arr.push(ev); mapa.set(h, arr); }
    const res: Record<string, { huella: string; veces: number; primero: string; ultimo: string; ejemplo: EventoSentry }> = {};
    for (const [h, lista] of mapa.entries()) {
        const ord = lista.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        res[h] = { huella: h, veces: ord.length, primero: ord[0].timestamp, ultimo: ord[ord.length - 1].timestamp, ejemplo: ord[0] };
    }
    return res;
}
