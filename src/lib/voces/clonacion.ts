/**
 * CLONACIÓN DE VOCES CON POCO AUDIO (Ola 266 · Forja fase 4 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente del OS para el flujo de clonación del daemon de voz (I1A):
 *   POST /api/voz-local/clonar  (multipart: audio, texto, timbre, lang, consentimiento)
 *   GET  /api/voz-local/clones  (lista las referencias guardadas)
 *   DELETE /api/voz-local/clonar?timbre=&lang= (borra una referencia)
 *
 * Validamos ANTES del viaje de red (duración 3-20 s de la muestra, transcripción
 * 20-400 caracteres, timbre seguro) para que el editor responda al instante y
 * no despierte el motor para rechazar lo que ya sabíamos mal. El daemon repite
 * las mismas validaciones: es la autoridad final.
 *
 * La voz es identidad soberana de la persona: sin `consentimiento: true`
 * explícito este módulo NI SIQUIERA intenta la subida.
 */

/** Duración mínima y máxima de la muestra en segundos (idénticas al daemon). */
export const MUESTRA_MIN_S = 3;
export const MUESTRA_MAX_S = 20;
/** Longitud mínima y máxima de la transcripción en caracteres. */
export const TEXTO_MIN = 20;
export const TEXTO_MAX = 400;
/** El id de timbre viaja a nombres de fichero: solo [a-z0-9-], 2-40 caracteres. */
export const TIMBRE_RE = /^[a-z0-9-]{2,40}$/;

/** Referencia de clonación guardada en el daemon. */
export interface ClonVoz {
    /** Id del timbre (p. ej. una personalidad). */
    timbre: string;
    /** Idioma base en dos letras (es, en…). */
    lang: string;
    /** Duración de la muestra en segundos; `null` si el daemon no la calculó. */
    duracionS: number | null;
    /** True si ya existen los códigos .rvq precodificados (clonación rápida). */
    rvq: boolean;
    /** Marca ISO de creación. */
    creadaEn: string;
}

/** Entrada de una muestra para clonar. */
export interface MuestraClon {
    /** Audio de referencia (WAV, webm u otro que ffmpeg sepa leer). */
    audio: Blob;
    /** Transcripción EXACTA de lo que se dice en la muestra. */
    texto: string;
    /** Id del timbre destino ([a-z0-9-], 2-40). */
    timbreId: string;
    /** Idioma de la muestra (p. ej. "es-ES"); se reduce a su base. */
    lang?: string;
    /** Consentimiento explícito de la persona cuya voz se clona (obligatorio). */
    consentimiento: boolean;
}

/** Normaliza un idioma a su base en minúsculas de dos letras ("es-ES" → "es"). */
export function langBase(idioma: string | undefined): string {
    return (idioma || "es").split(/[-_]/)[0].trim().toLowerCase() || "es";
}

/** Valida la transcripción; devuelve el mensaje de error en español o `null`. */
export function validarTextoMuestra(texto: string): string | null {
    const limpio = (texto || "").trim();
    if (limpio.length < TEXTO_MIN || limpio.length > TEXTO_MAX) {
        return `La transcripción exacta debe tener entre ${TEXTO_MIN} y ${TEXTO_MAX} caracteres (ahora ${limpio.length}).`;
    }
    return null;
}

/** Valida el id de timbre; devuelve el mensaje de error en español o `null`. */
export function validarTimbreId(timbre: string): string | null {
    const limpio = (timbre || "").trim().toLowerCase();
    if (!TIMBRE_RE.test(limpio)) {
        return "El id del timbre debe tener entre 2 y 40 caracteres: letras minúsculas, números y guiones.";
    }
    return null;
}

/** Valida la duración de la muestra; devuelve el mensaje de error en español o `null`. */
export function validarDuracion(duracionS: number): string | null {
    if (!Number.isFinite(duracionS) || duracionS <= 0) {
        return "No se pudo leer la duración del audio de referencia.";
    }
    if (duracionS < MUESTRA_MIN_S || duracionS > MUESTRA_MAX_S) {
        return `La muestra debe durar entre ${MUESTRA_MIN_S} y ${MUESTRA_MAX_S} segundos (dura ${duracionS.toFixed(1)} s).`;
    }
    return null;
}

/** Valida las partes puras de una muestra; devuelve el primer error o `null`. */
export function validarMuestra(m: MuestraClon): string | null {
    if (!m.consentimiento) {
        return "Hace falta el consentimiento explícito de la persona cuya voz se va a clonar.";
    }
    if (!m.audio || m.audio.size === 0) return "Falta el audio de referencia.";
    return validarTimbreId(m.timbreId) ?? validarTextoMuestra(m.texto);
}

/**
 * Mide la duración de un Blob de audio con un `<audio>` efímero anclado a una
 * URL de objeto (navegador). Devuelve null si el medio no se puede decodificar.
 * El elemento no llega a insertarse en el documento: solo carga metadatos.
 */
export function medirDuracionAudio(audio: Blob): Promise<number | null> {
    return new Promise((resolve) => {
        if (typeof URL === "undefined" || typeof document === "undefined") return resolve(null);
        const url = URL.createObjectURL(audio);
        const el = document.createElement("audio");
        el.preload = "metadata";
        el.onloadedmetadata = () => {
            const d = el.duration;
            URL.revokeObjectURL(url);
            resolve(Number.isFinite(d) ? d : null);
        };
        el.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        el.src = url;
    });
}

/** Respuesta del daemon tras guardar una referencia (`POST /clonar`). */
export interface ResultadoClonacion {
    ok: boolean;
    timbre?: string;
    lang?: string;
    duracionS?: number;
    rvq?: boolean;
    error?: string;
}

/**
 * Sube una muestra de clonación al daemon local a través del proxy del OS.
 * Valida localmente antes de la red (duración incluida, midiendo el audio con
 * un `<audio>` efímero). Nunca lanza: devuelve el error como texto en español.
 */
export async function subirMuestraClon(m: MuestraClon): Promise<ResultadoClonacion> {
    const errorLocal = validarMuestra(m);
    if (errorLocal) return { ok: false, error: errorLocal };
    const duracion = await medirDuracionAudio(m.audio);
    if (duracion !== null) {
        // No poder medir el medio no bloquea (el daemon lo mide tras ffmpeg);
        // poder medirlo y estar fuera de rango sí, porque sabemos que fallará.
        const errorDuracion = validarDuracion(duracion);
        if (errorDuracion) return { ok: false, error: errorDuracion };
    }
    const cuerpo = new FormData();
    cuerpo.append("audio", m.audio, "muestra");
    cuerpo.append("texto", m.texto.trim());
    cuerpo.append("timbre", m.timbreId.trim().toLowerCase());
    cuerpo.append("lang", langBase(m.lang));
    cuerpo.append("consentimiento", "sí");
    try {
        const r = await fetch("/api/voz-local/clonar", { method: "POST", body: cuerpo });
        const j = (await r.json().catch(() => ({}))) as Partial<ResultadoClonacion> & { error?: string };
        if (!r.ok || !j.ok) {
            return { ok: false, error: j.error || `El daemon rechazó la muestra (HTTP ${r.status}).` };
        }
        return { ok: true, timbre: j.timbre, lang: j.lang, duracionS: j.duracionS, rvq: j.rvq };
    } catch (e) {
        return { ok: false, error: `No se pudo hablar con el daemon de voz: ${(e as Error)?.message ?? "error"}` };
    }
}

/** Lista las referencias de clonación guardadas en el daemon; `[]` si no responde. */
export async function listarClones(): Promise<ClonVoz[]> {
    try {
        const r = await fetch("/api/voz-local/clones", { cache: "no-store" });
        if (!r.ok) return [];
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; clones?: unknown };
        if (!j.ok || !Array.isArray(j.clones)) return [];
        return j.clones.filter((c): c is ClonVoz => typeof c === "object" && c !== null).map((c) => ({
            timbre: String(c.timbre ?? ""),
            lang: String(c.lang ?? "es"),
            duracionS: typeof c.duracionS === "number" ? c.duracionS : null,
            rvq: c.rvq === true,
            creadaEn: String(c.creadaEn ?? ""),
        }));
    } catch {
        return [];
    }
}

/** Borra una referencia de clonación del daemon. Nunca lanza. */
export async function borrarClon(timbreId: string, lang?: string): Promise<ResultadoClonacion> {
    const errorTimbre = validarTimbreId(timbreId);
    if (errorTimbre) return { ok: false, error: errorTimbre };
    const p = new URLSearchParams({ timbre: timbreId.trim().toLowerCase(), lang: langBase(lang) });
    try {
        const r = await fetch(`/api/voz-local/clonar?${p}`, { method: "DELETE" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!r.ok || !j.ok) {
            return { ok: false, error: j.error || `El daemon no pudo borrar la referencia (HTTP ${r.status}).` };
        }
        return { ok: true, timbre: timbreId, lang: p.get("lang") ?? undefined };
    } catch (e) {
        return { ok: false, error: `No se pudo hablar con el daemon de voz: ${(e as Error)?.message ?? "error"}` };
    }
}
