/**
 * El adjunto «llamada» de un mensaje — PURO.
 *
 * Una llamada se anuncia en el chat como un mensaje con un `AdjuntoLlamada`. Todo lo que llega
 * de un adjunto es dato de otra persona: se valida y la ruta se RECALCULA desde el id de sesión
 * (nunca se usa la `route` que venga escrita).
 */
import type { DmMessage } from "@/lib/messages/dm";
import type { TipoLlamada } from "@/lib/mensajeria/formato-tipos";
import { describirDuracion, esTipoLlamada, TEXTO_TIPO, textoPersonas } from "@/lib/llamadas/formato";
import type { AdjuntoLlamadaRegistro, EstadoTarjeta } from "@/lib/llamadas/tipos";

/** Ventana en la que un anuncio de llamada todavía «suena». */
export const VENTANA_TIMBRE_MS = 60_000;
/** Tiempo que suena el timbre entrante antes de contar como perdida. */
export const DURACION_TIMBRE_MS = 45_000;
/** Tiempo que espera quien llama antes de colgar por falta de respuesta. */
export const ESPERA_RESPUESTA_MS = 50_000;

const RE_ID = /^[0-9a-zA-Z-]{8,64}$/;

export function esIdSesionValido(id: unknown): id is string {
    return typeof id === "string" && RE_ID.test(id);
}

export function rutaLlamada(sesionId: string, token?: string | null): string {
    const base = `/llamada/${encodeURIComponent(sesionId)}`;
    return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}

export function crearAdjuntoLlamada(tipo: TipoLlamada, sesionId: string, ahora: Date = new Date()): AdjuntoLlamadaRegistro {
    return {
        kind: "llamada",
        tipoLlamada: tipo,
        sesionId,
        route: rutaLlamada(sesionId),
        name: TEXTO_TIPO[tipo].nombre,
        iniciada: ahora.toISOString(),
    };
}

function fechaValida(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Valida y normaliza un adjunto de llamada; null si no lo es o viene roto. */
export function adjuntoLlamadaDe(a: unknown): AdjuntoLlamadaRegistro | null {
    if (!a || typeof a !== "object") return null;
    const o = a as Record<string, unknown>;
    if (o.kind !== "llamada") return null;
    if (!esIdSesionValido(o.sesionId)) return null;
    const tipo: TipoLlamada = esTipoLlamada(o.tipoLlamada) ? o.tipoLlamada : "audio";
    const out: AdjuntoLlamadaRegistro = {
        kind: "llamada",
        tipoLlamada: tipo,
        sesionId: o.sesionId,
        route: rutaLlamada(o.sesionId),
        name: TEXTO_TIPO[tipo].nombre,
    };
    const iniciada = fechaValida(o.iniciada);
    if (iniciada) out.iniciada = iniciada;
    const fin = fechaValida(o.fin);
    if (fin) out.fin = fin;
    if (typeof o.duracionMs === "number" && Number.isFinite(o.duracionMs) && o.duracionMs >= 0) out.duracionMs = Math.round(o.duracionMs);
    if (typeof o.contestada === "boolean") out.contestada = o.contestada;
    return out;
}

/**
 * ¿Este mensaje nuevo es una llamada que me está sonando? Sí si trae un adjunto de llamada, no
 * es mío, no está borrado y se creó hace menos de `ventanaMs`.
 */
export function esTimbreEntrante(
    msg: Pick<DmMessage, "sender" | "createdAt" | "attachments" | "deleted">,
    miUid: string | null,
    ahora: number = Date.now(),
    ventanaMs: number = VENTANA_TIMBRE_MS,
): AdjuntoLlamadaRegistro | null {
    if (!miUid || !msg || msg.deleted) return null;
    if (!msg.sender || msg.sender === miUid) return null;
    const creado = Date.parse(msg.createdAt);
    if (!Number.isFinite(creado)) return null;
    // Tolerancia de 5 s por relojes desajustados entre dispositivos.
    if (ahora - creado > ventanaMs || creado - ahora > 5_000) return null;
    for (const a of msg.attachments ?? []) {
        const adj = adjuntoLlamadaDe(a);
        if (adj && !adj.fin) return adj;
    }
    return null;
}

export interface VistaTarjeta {
    estado: EstadoTarjeta;
    etiqueta: string;
    puedeUnirse: boolean;
}

/**
 * Estado que enseña la tarjeta de una llamada en el chat.
 *  · Si hay gente dentro (presencia en vivo) → en curso, siempre (aunque el creador ya se fuera).
 *  · Si el creador dejó registro (`fin`) → terminada con su duración, perdida o sin respuesta.
 *  · Si aún está en la ventana de timbre → sonando.
 *  · Si no → finalizada (sin datos de duración).
 */
export function estadoTarjetaLlamada(e: {
    adjunto: AdjuntoLlamadaRegistro;
    mio: boolean;
    /** Personas dentro ahora mismo; null = aún no se sabe. */
    presentes: number | null;
    ahora?: number;
    sesionEstado?: "activa" | "terminada" | null;
}): VistaTarjeta {
    const ahora = e.ahora ?? Date.now();
    const { adjunto } = e;
    if (e.presentes && e.presentes > 0 && e.sesionEstado !== "terminada") {
        return { estado: "en-curso", etiqueta: `En curso · ${textoPersonas(e.presentes)}`, puedeUnirse: true };
    }
    if (adjunto.fin) {
        if (adjunto.contestada) {
            const d = adjunto.duracionMs && adjunto.duracionMs > 0 ? ` · ${describirDuracion(adjunto.duracionMs)}` : "";
            return { estado: "terminada", etiqueta: `Terminada${d}`, puedeUnirse: false };
        }
        return e.mio
            ? { estado: "sin-respuesta", etiqueta: "Sin respuesta", puedeUnirse: false }
            : { estado: "perdida", etiqueta: "Perdida", puedeUnirse: false };
    }
    const iniciada = adjunto.iniciada ? Date.parse(adjunto.iniciada) : NaN;
    const reciente = Number.isFinite(iniciada) && ahora - iniciada < VENTANA_TIMBRE_MS;
    if (reciente && e.sesionEstado !== "terminada") {
        return { estado: "sonando", etiqueta: e.mio ? "Llamando…" : "Sonando…", puedeUnirse: true };
    }
    return { estado: "finalizada", etiqueta: "Finalizada", puedeUnirse: false };
}
