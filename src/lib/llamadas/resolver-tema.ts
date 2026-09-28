"use client";

/**
 * Qué canal privado toca para una sesión (llamada o app en vivo), y dos ayudas de Realtime
 * que comparten la señalización de llamadas y la presencia de las apps en vivo.
 *
 *  · Con el token del enlace público en la mano → `<prefijo>:<id>:<token>`.
 *  · Si no, se mira la fila de la sesión (la RLS de `os_sesiones_vivas` se la sirve al creador,
 *    a los invitados y a los miembros del chat): si tiene enlace público vigente, el tema con su
 *    token (así miembros e invitados comparten sala); si no, `<prefijo>:<id>`.
 *  · Si la lectura falla (sin red, sin cuenta, sin la migración) → el tema de miembros; el
 *    servidor dirá si deja entrar, y la interfaz lo explicará. Nunca se inventa un canal público.
 *
 * El token nunca se pinta ni se registra: solo forma parte del nombre del canal.
 */
import { createClient } from "@/utils/supabase/client";
import { esTokenPublico, temaSesion, type PrefijoTema } from "@/lib/llamadas/temas";

const TTL_MS = 30_000;
const cache = new Map<string, { t: number; p: Promise<string | null> }>();

export interface OpcionesResolver {
    /** Token del enlace público con el que se llegó (invitados). */
    token?: string | null;
    /** Salta la caché (tras crear o revocar un enlace, o cuando alguien avisa de mudanza). */
    fresco?: boolean;
}

export async function resolverTemaSesion(prefijo: PrefijoTema, sesionId: string | null | undefined, opciones: OpcionesResolver = {}): Promise<string | null> {
    const base = temaSesion(prefijo, sesionId);
    if (!base || !sesionId) return null;
    if (esTokenPublico(opciones.token)) return temaSesion(prefijo, sesionId, opciones.token);
    const clave = `${prefijo}:${sesionId.toLowerCase()}`;
    const ahora = Date.now();
    const hit = cache.get(clave);
    if (!opciones.fresco && hit && ahora - hit.t < TTL_MS) return hit.p;
    const p = (async (): Promise<string | null> => {
        try {
            const { data, error } = await createClient()
                .from("os_sesiones_vivas")
                .select("modo, token_publico")
                .eq("id", sesionId)
                .maybeSingle();
            if (error || !data) return base;
            const fila = data as { modo?: unknown; token_publico?: unknown };
            if (fila.modo === "publico" && esTokenPublico(fila.token_publico)) return temaSesion(prefijo, sesionId, fila.token_publico);
            return base;
        } catch {
            return base;
        }
    })();
    cache.set(clave, { t: ahora, p });
    return p;
}

/** Olvida lo resuelto para una sesión (la próxima consulta va al servidor). */
export function olvidarTemaSesion(prefijo: PrefijoTema, sesionId: string): void {
    cache.delete(`${prefijo}:${sesionId.toLowerCase()}`);
}

/* ───────────────────────────── Denegaciones recordadas ───────────────────────────── */

/**
 * Si el servidor dijo «no» a un tema, los que solo MIRAN (tarjetas, timbres, contadores) no
 * vuelven a intentarlo durante un rato: nada de reintentos en bucle cada vez que una tarjeta
 * entra en pantalla. Quien entra en una llamada (un gesto de la persona) sí lo intenta siempre.
 */
const VENTANA_DENEGADO_MS = 5 * 60_000;
const denegados = new Map<string, number>();

export function marcarTemaDenegado(tema: string, ahora: number = Date.now()): void {
    denegados.set(tema, ahora);
}

export function temaDenegadoReciente(tema: string, ahora: number = Date.now()): boolean {
    const t = denegados.get(tema);
    if (t === undefined) return false;
    if (ahora - t >= VENTANA_DENEGADO_MS) {
        denegados.delete(tema);
        return false;
    }
    return true;
}

/* ───────────────────────────── Autenticación de Realtime ───────────────────────────── */

type ConRealtime = { realtime?: { setAuth?: (token?: string | null) => Promise<unknown> } };

/**
 * Los canales privados se autorizan con el JWT que lleva la petición de unión. Si el socket aún
 * no tiene el token de la sesión (recién cargada la página), la unión saldría como anónima y un
 * miembro sería rechazado. `realtime.setAuth()` sin argumentos toma el token actual de la sesión
 * (o la clave anónima si no hay sesión). Devuelve null si el cliente no lo admite (pruebas).
 * Nunca rechaza y como mucho espera 3 s.
 */
export function prepararAuthRealtime(cliente: unknown): Promise<void> | null {
    const rt = (cliente as ConRealtime | null | undefined)?.realtime;
    if (!rt || typeof rt.setAuth !== "function") return null;
    try {
        const auth = Promise.resolve(rt.setAuth()).then(
            () => undefined,
            () => undefined,
        );
        const tope = new Promise<void>((ok) => setTimeout(ok, 3000));
        return Promise.race([auth, tope]);
    } catch {
        return null;
    }
}

/**
 * Token del enlace público en la URL actual, solo si la página es la de ESA sesión
 * (`/vivo/<id>?t=…` o `/llamada/<id>?t=…`). Para que el contador de una página de enlace
 * público funcione sin que la página tenga que pasarlo.
 */
export function tokenDeLaUrl(sesionId: string, ubicacion: Pick<Location, "pathname" | "search"> | null = typeof window !== "undefined" ? window.location : null): string | null {
    if (!ubicacion) return null;
    try {
        const ruta = decodeURIComponent(ubicacion.pathname || "").toLowerCase();
        const id = sesionId.toLowerCase();
        if (ruta !== `/vivo/${id}` && ruta !== `/llamada/${id}`) return null;
        const t = new URLSearchParams(ubicacion.search || "").get("t");
        return esTokenPublico(t) ? t : null;
    } catch {
        return null;
    }
}

/** Solo pruebas. */
export function __reiniciarResolverTema(): void {
    cache.clear();
    denegados.clear();
}
