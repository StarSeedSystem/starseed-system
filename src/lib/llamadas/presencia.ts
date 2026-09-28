/**
 * Presencia del canal de una llamada — PURO.
 *
 * Lo que publica cada participante es DATO DE OTRA PERSONA (puede ser un invitado anónimo):
 * se sanea antes de pintarlo. Nunca da privilegios: solo nombre, foto y estado de sus medios.
 */
import type { MetaPresencia } from "@/lib/llamadas/tipos";

const LARGO_NOMBRE = 40;

/** Solo https/http, rutas propias («/…») o imágenes data: pequeñas. Nada de javascript:, etc. */
export function urlAvatarSegura(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s) && s.length <= 2048) return s;
    if (s.startsWith("/") && !s.startsWith("//") && s.length <= 2048) return s;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(s) && s.length <= 200_000) return s;
    return null;
}

export function sanearNombre(v: unknown, respaldo = "Persona"): string {
    if (typeof v !== "string") return respaldo;
    // Sin caracteres de control ni saltos; espacios colapsados.
    const limpio = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!limpio) return respaldo;
    return limpio.length > LARGO_NOMBRE ? `${limpio.slice(0, LARGO_NOMBRE - 1)}…` : limpio;
}

/** Convierte una entrada de presencia en `MetaPresencia` válida (o null si no sirve). */
export function sanearMeta(v: unknown, clave: string): MetaPresencia | null {
    if (!v || typeof v !== "object" || !clave) return null;
    const o = v as Record<string, unknown>;
    // La clave de presencia manda: nadie puede hacerse pasar por otro id de par.
    const invitado = o.invitado === true || typeof o.uid !== "string";
    return {
        id: clave,
        uid: !invitado && typeof o.uid === "string" && o.uid ? o.uid : null,
        nombre: sanearNombre(o.nombre, invitado ? "Invitado" : "Persona"),
        avatar: urlAvatarSegura(o.avatar),
        invitado,
        micro: o.micro === true,
        camara: o.camara === true,
        pantalla: o.pantalla === true,
        unido: typeof o.unido === "number" && Number.isFinite(o.unido) ? o.unido : Number.MAX_SAFE_INTEGER,
    };
}

/**
 * Lista de participantes desde `channel.presenceState()`: una entrada por clave (la última
 * meta publicada), saneada y ordenada por llegada.
 */
export function participantesDePresencia(estado: Record<string, unknown> | null | undefined): MetaPresencia[] {
    if (!estado || typeof estado !== "object") return [];
    const out: MetaPresencia[] = [];
    for (const [clave, metas] of Object.entries(estado)) {
        if (!Array.isArray(metas) || metas.length === 0) continue;
        const meta = sanearMeta(metas[metas.length - 1], clave);
        if (meta) out.push(meta);
    }
    return out.sort((a, b) => a.unido - b.unido || (a.id < b.id ? -1 : 1));
}

/** Uid de una clave de presencia `<uid>:<pestaña>` (null para invitados «inv-…»). */
export function uidDeClave(clave: string): string | null {
    const base = clave.split(":")[0] ?? "";
    return base && !base.startsWith("inv-") ? base : null;
}
