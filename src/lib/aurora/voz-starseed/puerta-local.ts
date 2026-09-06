/**
 * Puerta de sesión para las rutas de voz (Ola 253 · 2026-09-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * Las rutas `/api/voz/*` hablan con el demonio de voz de ESTA neurona
 * (`127.0.0.1:4500`). La puerta de sesión se pensó para Vercel, pero cuando el
 * OS corre en producción LOCAL (modo ligero en la Mac: `next start` en la
 * propia neurona), exigir sesión dejaba la voz apagada y el rito de bienvenida
 * —que habla ANTES de que exista sesión— mudo.
 *
 * Regla: en producción solo se exige sesión si el despliegue NO es local. Una
 * petición es local si el host es localhost/127.0.0.1/[::1]/*.local o si la
 * variable `STARSEED_LOCAL=1` está activa; en Vercel (`VERCEL=1`) NUNCA se
 * considera local, aunque lleguen cabeceras amistosas.
 *
 * Solo servidor (usa `@/utils/supabase/server`).
 */

import { createClient } from "@/utils/supabase/server";

/** Sufijos y nombres de host que identifican un despliegue en la propia neurona. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Quita el puerto de un host (`localhost:9002` → `localhost`, `[::1]:9002` → `[::1]`)
 * y lo pasa a minúsculas. Devuelve null si la cadena viene vacía.
 */
function hostSinPuerto(host: string | null): string | null {
    if (!host) return null;
    const limpio = host.trim().toLowerCase();
    if (!limpio) return null;
    // IPv6 con corchetes: [::1] o [::1]:9002.
    if (limpio.startsWith("[")) {
        const cierre = limpio.indexOf("]");
        return cierre === -1 ? limpio : limpio.slice(0, cierre + 1);
    }
    return limpio.split(":")[0] ?? null;
}

/**
 * Cierto si la petición va dirigida a un despliegue local del OS:
 *  - `STARSEED_LOCAL=1` fuerza modo local explícitamente;
 *  - o el host (`x-forwarded-host` si existe, si no `host`) es localhost,
 *    127.0.0.1, [::1] o termina en `.local`, con o sin puerto.
 * NUNCA es local en Vercel (`VERCEL=1` manda sobre todo lo demás).
 */
export function esDespliegueLocal(req: Request): boolean {
    // En Vercel nunca se abre la puerta: ahí la autenticación es obligatoria.
    if (process.env.VERCEL === "1") return false;
    if (process.env.STARSEED_LOCAL === "1") return true;

    const host = hostSinPuerto(req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
    if (!host) return false;
    if (HOSTS_LOCALES.has(host)) return true;
    return host.endsWith(".local");
}

/**
 * Puerta única de las rutas de voz: devuelve null si la petición puede pasar,
 * o una respuesta 401 si falta la sesión.
 *
 * Pasa sin sesión cuando:
 *  - `NODE_ENV !== "production"` (desarrollo y tests), o
 *  - el despliegue es local (`esDespliegueLocal`).
 *
 * En producción desplegada (Vercel y similares) se exige un usuario
 * autenticado con `auth.getUser()`.
 */
export async function exigirSesionSalvoLocal(req: Request): Promise<Response | null> {
    if (process.env.NODE_ENV !== "production") return null;
    if (esDespliegueLocal(req)) return null;

    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        }
        return null;
    } catch {
        return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
    }
}
