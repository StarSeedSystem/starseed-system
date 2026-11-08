/**
 * (OFF1108A) Id de cuenta recordado en este aparato, para saber QUIÉN eres cuando no hay red.
 *
 * Por qué existe. `uidActual()` lee `auth.getSession()`. Con el token de acceso caducado (dura ~1 h) y sin
 * internet, Supabase intenta renovarlo, falla por red y devuelve `session: null`. Al reabrir la app de la
 * tableta sin Wi‑Fi eso dejaba a TODO el sistema «sin cuenta»: perfil vacío, lista de neuronas con solo
 * este aparato, saludos sin cuenta y mensajes «esperando un medio disponible» (hallazgo OFF1108A, 08-11).
 *
 * Qué guarda: SOLO el id de la cuenta (un uuid) y cuándo se vio. Nunca tokens ni claves: la sesión sigue
 * donde Supabase la guarda. Qué NO hace: no inicia sesión ni concede acceso al servidor; solo permite
 * seguir usando lo que ya está en este aparato. Se borra al cerrar sesión.
 */

export const CLAVE_UID_RECORDADO = "starseed.cuenta.uid-recordado.v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function almacen(): Storage | null {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** Anota la cuenta con sesión viva. Nunca lanza. */
export function recordarUid(uid: string | null | undefined, ahora: number = Date.now()): void {
    if (typeof uid !== "string" || !UUID.test(uid)) return;
    try {
        const a = almacen();
        if (!a) return;
        const previo = a.getItem(CLAVE_UID_RECORDADO);
        if (previo) {
            const p = JSON.parse(previo) as { uid?: string; en?: number };
            // No se reescribe en cada lectura: solo si cambió la cuenta o pasó más de una hora.
            if (p.uid === uid && typeof p.en === "number" && ahora - p.en < 3_600_000) return;
        }
        a.setItem(CLAVE_UID_RECORDADO, JSON.stringify({ uid, en: ahora }));
    } catch {
        /* sin almacenamiento: no se puede recordar */
    }
}

/** La cuenta recordada, o null. Nunca lanza. */
export function uidRecordado(): string | null {
    try {
        const raw = almacen()?.getItem(CLAVE_UID_RECORDADO);
        if (!raw) return null;
        const p = JSON.parse(raw) as { uid?: unknown };
        return typeof p.uid === "string" && UUID.test(p.uid) ? p.uid : null;
    } catch {
        return null;
    }
}

/** Cierre de sesión MANUAL: se olvida. */
export function olvidarUid(): void {
    try {
        almacen()?.removeItem(CLAVE_UID_RECORDADO);
    } catch {
        /* */
    }
}

/** ¿El fallo de lectura de sesión parece de RED (y no un rechazo del servidor)? Pura. */
export function esErrorDeRed(e: unknown): boolean {
    if (!e || typeof e !== "object") return false;
    const o = e as { name?: unknown; message?: unknown; status?: unknown };
    if (o.name === "AuthRetryableFetchError") return true;
    if (typeof o.status === "number" && o.status === 0) return true;
    const m = typeof o.message === "string" ? o.message : "";
    return /failed to fetch|network|load failed|fetch failed|timed? ?out|offline/i.test(m);
}
