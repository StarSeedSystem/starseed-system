/**
 * Usuario actual sin red (contrato «consumo», 2026-09-29).
 *
 * `/auth/v1/user` fue la ruta MÁS pedida del proyecto: 12.770 veces en 4 horas. Cada
 * `supabase.auth.getUser()` es una petición de red, y decenas de ayudantes la hacían en cada lectura,
 * escritura o sondeo solo para saber el id del usuario. Ese id ya está en la sesión local.
 *
 * `usuarioActual()` / `uidActual()` leen `auth.getSession()` (sin red salvo que toque renovar el
 * token, que el cliente coordina) y guardan el resultado en caché, que se actualiza con cada evento
 * de `onAuthStateChange` (entrar, salir, renovar, cambiar datos). `usuarioVerificado()` pregunta de
 * verdad al servidor, como mucho una vez cada 10 min por pestaña.
 *
 * Solo para el NAVEGADOR y solo cuando basta con saber quién es: el código de servidor y las rutas
 * de API siguen verificando el JWT con `getUser()` (no se toca).
 */
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export const VERIFICAR_CADA_MS = 10 * 60_000;

type Cliente = ReturnType<typeof createClient>;

interface AuthMinima {
    getSession?: () => Promise<{ data: { session: { user?: User | null } | null } | null }>;
    getUser?: () => Promise<{ data: { user: User | null } | null; error?: unknown }>;
    onAuthStateChange?: (cb: (evento: string, sesion: { user?: User | null } | null) => void) => unknown;
}

let clienteCacheado: unknown = null;
let cache: { user: User | null } | null = null;
let generacion = 0;
let enVuelo: Promise<User | null> | null = null;
let ultimaVerificacion = 0;
let verificando: Promise<User | null> | null = null;
const suscritos = new WeakSet<object>();

function authDe(sb: Cliente): AuthMinima | null {
    const auth = (sb as unknown as { auth?: AuthMinima } | null)?.auth;
    return auth && typeof auth === "object" ? auth : null;
}

/** Engancha la caché a los cambios de sesión. Devuelve si la caché es fiable para ese cliente. */
function engancharCambios(sb: Cliente, auth: AuthMinima): boolean {
    if (suscritos.has(sb as object)) return true;
    if (typeof auth.onAuthStateChange !== "function") return false;
    try {
        auth.onAuthStateChange((evento, sesion) => {
            if (clienteCacheado !== sb) return;
            generacion++;
            cache = { user: sesion?.user ?? null };
            if (evento === "SIGNED_OUT") ultimaVerificacion = 0;
        });
        suscritos.add(sb as object);
        return true;
    } catch {
        return false;
    }
}

async function leerSesion(sb: Cliente, auth: AuthMinima): Promise<User | null> {
    if (typeof auth.getSession === "function") {
        const { data } = await auth.getSession();
        return data?.session?.user ?? null;
    }
    // Clientes simulados sin getSession (pruebas antiguas): el camino de siempre.
    if (typeof auth.getUser === "function") {
        const { data } = await auth.getUser();
        return data?.user ?? null;
    }
    return null;
}

/** Usuario con sesión en este navegador (o null). Sin red; nunca lanza. */
export async function usuarioActual(): Promise<User | null> {
    let sb: Cliente;
    try {
        sb = createClient();
    } catch {
        return null;
    }
    const auth = authDe(sb);
    if (!auth) return null;

    // En el servidor no hay caché compartible entre peticiones.
    if (typeof window === "undefined") {
        try {
            return await leerSesion(sb, auth);
        } catch {
            return null;
        }
    }

    if (clienteCacheado !== sb) {
        // Cliente nuevo (en producción es un singleton; en pruebas puede cambiar): caché de cero.
        clienteCacheado = sb;
        cache = null;
        enVuelo = null;
        generacion++;
    }
    const fiable = engancharCambios(sb, auth);
    if (fiable && cache) return cache.user;
    if (fiable && enVuelo) return enVuelo;

    const gen = generacion;
    const promesa = (async () => {
        try {
            const user = await leerSesion(sb, auth);
            // Si llegó un evento de sesión mientras leíamos, manda el evento.
            if (fiable && gen === generacion && clienteCacheado === sb) cache = { user };
            return fiable && cache && clienteCacheado === sb ? cache.user : user;
        } catch {
            return null;
        }
    })();
    if (!fiable) return promesa;
    enVuelo = promesa;
    try {
        return await promesa;
    } finally {
        if (enVuelo === promesa) enVuelo = null;
    }
}

/** Id del usuario con sesión (o null). Sin red; nunca lanza. */
export async function uidActual(): Promise<string | null> {
    const u = await usuarioActual();
    return u?.id ?? null;
}

/** Lo que haya en caché ahora mismo, sin esperar: `undefined` = aún no se sabe. */
export function uidEnCache(): string | null | undefined {
    return cache ? cache.user?.id ?? null : undefined;
}

/**
 * Usuario confirmado por el servidor (`getUser()`), como mucho una vez cada 10 min por pestaña.
 * Entre medias devuelve la caché. Ante un error de red, la sesión local sigue mandando.
 */
export async function usuarioVerificado(): Promise<User | null> {
    if (typeof window === "undefined") return usuarioActual();
    if (verificando) return verificando;
    if (Date.now() - ultimaVerificacion < VERIFICAR_CADA_MS) return usuarioActual();
    const local = await usuarioActual();
    if (!local) return null; // sin sesión no hay nada que verificar (ni petición que gastar)
    ultimaVerificacion = Date.now();
    verificando = (async () => {
        try {
            const sb = createClient();
            const auth = authDe(sb);
            if (!auth || typeof auth.getUser !== "function") return local;
            const { data, error } = await auth.getUser();
            if (data?.user) {
                if (clienteCacheado === sb) {
                    generacion++;
                    cache = { user: data.user };
                }
                return data.user;
            }
            return error ? local : null;
        } catch {
            return local;
        } finally {
            verificando = null;
        }
    })();
    return verificando;
}

/** Solo pruebas: olvida la caché y las suscripciones de este módulo. */
export function _reiniciarUsuarioParaPruebas(): void {
    clienteCacheado = null;
    cache = null;
    enVuelo = null;
    generacion++;
    ultimaVerificacion = 0;
    verificando = null;
}
