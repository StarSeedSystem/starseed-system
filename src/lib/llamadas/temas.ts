/**
 * Temas (nombres de canal) de Supabase Realtime para llamadas y apps en vivo — PURO.
 *
 * Desde 2026-09-28 (L1) los canales son PRIVADOS (Realtime Authorization): el servidor decide
 * quién entra con las políticas de `realtime.messages` de la migración
 * `supabase/migrations/20260928130000_l1-llamadas.sql`.
 *
 *   · `llamada:<id>` / `vivo:<id>`                 — creador, invitados y miembros del chat de la
 *                                                     sesión (SQL: `topic_sesion_permitido` →
 *                                                     `puede_entrar_sesion`).
 *   · `llamada:<id>:<token>` / `vivo:<id>:<token>` — quien tenga el enlace público vigente, con o
 *                                                     sin cuenta (SQL: `topic_publico_valido`).
 *
 * En una sesión con enlace público TODOS usan el tema con token (también los miembros, que lo
 * leen de la fila por RLS): si no, invitados y miembros quedarían en salas distintas.
 *
 * Aquí solo se construyen, validan y analizan los nombres, y se clasifican los errores de
 * suscripción. Sin red, sin DOM.
 */

export type PrefijoTema = "llamada" | "vivo";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** base64url como el de `generarTokenPublico` (43 caracteres), con margen. */
const RE_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const RE_TEMA = /^(llamada|vivo):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::([A-Za-z0-9_-]{16,128}))?$/i;

export function esUuidSesion(v: unknown): v is string {
    return typeof v === "string" && RE_UUID.test(v);
}

export function esTokenPublico(v: unknown): v is string {
    return typeof v === "string" && RE_TOKEN.test(v);
}

/**
 * Tema de una sesión. Con token válido → tema público; sin él → tema de miembros.
 * null si el id no es un uuid (nada de meter «:» u otras cosas en el nombre del canal).
 */
export function temaSesion(prefijo: PrefijoTema, sesionId: string | null | undefined, token?: string | null): string | null {
    if (!esUuidSesion(sesionId)) return null;
    const id = sesionId.toLowerCase();
    return esTokenPublico(token) ? `${prefijo}:${id}:${token}` : `${prefijo}:${id}`;
}

export function temaLlamada(sesionId: string | null | undefined, token?: string | null): string | null {
    return temaSesion("llamada", sesionId, token);
}

export function temaVivo(sesionId: string | null | undefined, token?: string | null): string | null {
    return temaSesion("vivo", sesionId, token);
}

export interface PartesTema {
    prefijo: PrefijoTema;
    sesionId: string;
    token: string | null;
}

/** Descompone un tema (acepta el prefijo `realtime:` que añade realtime-js). */
export function analizarTema(tema: string | null | undefined): PartesTema | null {
    if (typeof tema !== "string") return null;
    const limpio = tema.startsWith("realtime:") ? tema.slice("realtime:".length) : tema;
    const m = RE_TEMA.exec(limpio);
    if (!m) return null;
    return { prefijo: m[1].toLowerCase() as PrefijoTema, sesionId: m[2].toLowerCase(), token: m[3] ?? null };
}

/** ¿El tema es de ESTA sesión y de ESTE prefijo? (defensa: nadie abre el canal de otra). */
export function temaEsDeSesion(tema: string | null | undefined, prefijo: PrefijoTema, sesionId: string): boolean {
    const p = analizarTema(tema);
    return !!p && p.prefijo === prefijo && p.sesionId === sesionId.toLowerCase();
}

/* ───────────────────────────── Errores de suscripción ───────────────────────────── */

/**
 * Qué significa un CHANNEL_ERROR de realtime-js:
 *  · «denegado»  — el servidor dice que no (política RLS que no deja, o la señalización privada
 *                  aún no está desplegada). Reintentar no sirve: hay que decirlo y parar.
 *  · «rechazado» — el servidor rechazó la unión por otro motivo (límite de canales…). Tras
 *                  varios seguidos se trata como «denegado».
 *  · «red»       — el socket se cayó: realtime-js reconecta solo.
 *
 * realtime-js entrega la respuesta de un `join` rechazado como `Error` con el texto del servidor
 * (p. ej. «Unauthorized: You do not have permissions to read from this Channel topic: …»); los
 * fallos del socket llegan como un evento sin mensaje.
 */
export type ClaseErrorCanal = "denegado" | "rechazado" | "red";

const RE_DENEGADO = /unauthori[sz]ed|permission|forbidden|not allowed|authori[sz]ation|row-level|\brls\b|private channel/i;
const RE_RED = /network|socket|websocket|timeout|timed out|closed|disconnect|econn|fetch/i;

export function clasificarErrorCanal(err: unknown): ClaseErrorCanal {
    let texto = "";
    if (typeof err === "string") texto = err;
    else if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
        texto = (err as { message: string }).message;
    }
    texto = texto.trim();
    if (!texto) return "red";
    if (RE_DENEGADO.test(texto)) return "denegado";
    if (RE_RED.test(texto)) return "red";
    return "rechazado";
}

/** Rechazos «de otro tipo» seguidos que se tratan como denegación (para no reintentar sin fin). */
export const MAX_RECHAZOS_CANAL = 3;

/**
 * Lo que ve la persona si el canal privado no deja entrar. Nunca se cae a un canal público:
 * sería rebajar la seguridad sin avisar.
 */
export const MENSAJE_CANAL_PRIVADO =
    "No se pudo abrir el canal privado de la llamada. O el servidor aún no tiene activada la señalización privada " +
    "(falta aplicar la actualización de llamadas en la base de datos), o tu acceso ya no vale porque la llamada " +
    "terminó o el enlace se revocó. Por seguridad no se usa un canal público en su lugar.";
