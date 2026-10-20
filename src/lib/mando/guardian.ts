/**
 * Guardián común de las rutas `/api/mando/*` (solo servidor)
 *
 * (2026-10-10 · MetaGenesis) «Local» ya NO es «el servidor es una neurona» (`esDespliegueLocal`,
 * que con `STARSEED_LOCAL=1` decía que sí a CUALQUIER petición: un móvil del mismo Wi-Fi o un
 * túnel entraban en Genesis sin sesión). Ahora pasa sin sesión solo la propia máquina
 * (`esPeticionDeEstaMaquina`: bucle local estricto, sin cabeceras de túnel). Desde cualquier otro
 * sitio hace falta sesión (cookie o `Authorization: Bearer`) y ser miembro de MetaGenesis
 * (`es_metagenesis()`, tabla `metagenesis_accesos`). Si no se puede comprobar, 503: nunca se deja
 * pasar por error.
 *
 * (2026-10-20 · COL1012Md) Genesis en el A1, publicado tras Caddy (`STARSEED_PUBLICO=1`): nada se
 * considera «de esta máquina» (`estaPublicado`), siempre sesión. Y se cuida la cuota de Supabase (cada
 * verificación cuesta una petición; el presupuesto diario es de 25.000) en tres capas, cada una con su límite:
 *   1. un Bearer malformado, caducado o rechazado hace menos de 10 s responde 401 sin preguntar;
 *   2. desde una misma IP (la `X-Real-IP` que pone Caddy), tras 20 rechazos de Supabase en un minuto
 *      se responde 429 sin preguntar más, con el token o la cookie que sea (`FALLOS_POR_IP`). Lo que ya
 *      estaba verificado hace menos de 60 s pasa igual, sea un Bearer o la cookie de sesión del navegador
 *      (se mira antes del freno: un miembro tras la misma IP que un atacante, casa o móvil con CGNAT, sigue entrando);
 *   3. NO cubre a quien reparte los intentos entre muchas IPs: un JWT falso bien formado, con `exp` futuro,
 *      cuesta una petición por IP hasta el freno. Cerrarlo del todo exige verificar la firma en local (JWKS).
 * Prueba obligatoria del contrato `architecture/colmena-relevo-contenedores.md` §5:
 * `__tests__/guardian-caddy-a1.test.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 * 404 fuera de local (salvo `STARSEED_MANDO=1`); en producción desplegada,
 * además, sesión. En un despliegue LOCAL (modo ligero en la neurona, Ola 253 ·
 * 2026-09-06) la consola pasa SIN sesión: es la misma puerta que la de la voz
 * (`esDespliegueLocal`), porque exigir login en la propia máquina dejaba el
 * Genesis apagado justo donde tiene que usarse.
 * Devuelve la respuesta de veto o `null` si se puede seguir.
 */

import { createClient } from "@/utils/supabase/server";
import { createClient as clienteConToken } from "@supabase/supabase-js";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import type { CapacidadAmbito } from "./ambito";
import {
    crearCacheVerificaciones,
    defectoDelToken,
    expDelToken,
    huellaSesionPorCookie,
    huellaToken,
} from "@/lib/metagenesis/cache-verificacion";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/** Tokens de MetaGenesis remoto verificados hace poco (huella → miembro), en memoria del proceso. */
const verificados = crearCacheVerificaciones();

/**
 * (2026-10-20 · COL1012Md) Tokens que Supabase rechazó con claridad, 10 s (huella → motivo). Con Genesis
 * publicado en el A1 cualquiera en internet puede mandar `Authorization: Bearer …` en bucle: sin esto cada
 * petición costaría una llamada de verificación, y el presupuesto diario del proyecto es de 25.000.
 */
const rechazados = crearCacheVerificaciones<{ motivo: string }>({ ttlMs: 10_000 });

/**
 * ¿El fallo de `auth.getUser` es del medio (red caída, 5xx, límite de peticiones) y no un rechazo del token?
 * Un fallo del medio NUNCA se recuerda: dejaría fuera 10 s a quien trae un token bueno.
 */
export function esFalloTransitorio(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const { name, status } = error as { name?: unknown; status?: unknown };
    if (name === "AuthRetryableFetchError") return true;
    return typeof status === "number" && (status === 0 || status === 429 || status >= 500);
}

/** Rechazos de Supabase tolerados por IP y por ventana antes de dejar de preguntarle (capa 2 de la cuota). */
export const FALLOS_POR_IP = 20;
export const VENTANA_FALLOS_MS = 60_000;
/** IP → instante (ms) hasta el que no se le pregunta a Supabase por ella. Acotado a 2.000 entradas. */
const frenadas = new Map<string, number>();
const MAX_FRENADAS = 2_000;

/**
 * IP de quien llama. Detrás de Caddy manda `X-Real-IP` (el bloque de Genesis la pone con
 * `header_up X-Real-IP {remote_host}`, así que no la puede falsear el cliente); si falta, la primera de
 * `X-Forwarded-For`. Sin ninguna, null: entonces no se frena (el freno cuida la cuota, la sesión sigue
 * siendo obligatoria igual).
 */
function ipDeLaPeticion(req?: Request): string | null {
    if (!req) return null;
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
    const ip = clientIp(req);
    return ip === "unknown" ? null : ip.slice(0, 64);
}

/** Milisegundos que le faltan a esta IP para volver a poder verificar, o 0 si no está frenada. */
function msDeFreno(ip: string | null): number {
    if (!ip) return 0;
    const hasta = frenadas.get(ip);
    if (!hasta) return 0;
    const falta = hasta - Date.now();
    if (falta <= 0) {
        frenadas.delete(ip);
        return 0;
    }
    return falta;
}

/** Anota un rechazo de Supabase de esta IP; al llegar a `FALLOS_POR_IP` en la ventana, la frena una ventana entera. */
function anotarRechazo(ip: string | null): void {
    if (!ip) return;
    const r = rateLimit(`mando-rechazos:${ip}`, FALLOS_POR_IP, VENTANA_FALLOS_MS);
    if (r.allowed && r.remaining > 0) return;
    frenadas.delete(ip);
    frenadas.set(ip, Date.now() + VENTANA_FALLOS_MS);
    if (frenadas.size > MAX_FRENADAS) {
        const ahora = Date.now();
        for (const [k, hasta] of frenadas) if (hasta <= ahora) frenadas.delete(k);
        while (frenadas.size > MAX_FRENADAS) {
            const masVieja = frenadas.keys().next().value;
            if (masVieja === undefined) break;
            frenadas.delete(masVieja);
        }
    }
}

/**
 * ¿Es un rechazo de la sesión que costó una petición a Supabase y no un fallo del medio? «Sin sesión»
 * (`AuthSessionMissingError`: no hay cookie, se resuelve en local) no cuesta nada y no cuenta.
 */
function esRechazoDeSesion(error: unknown): boolean {
    if (esFalloTransitorio(error)) return false;
    return !(error && typeof error === "object" && (error as { name?: unknown }).name === "AuthSessionMissingError");
}

export type DecisionAcceso = 200 | 401 | 403 | 404 | 503;

/**
 * Decisión pura de acceso a Genesis. El orden importa:
 * apagado → 404; local u otro no-producción → 200; sin sesión → 401;
 * sin la bandera de "mando para todos" se queda como hoy → 200;
 * RPC caída → 503 (nunca deja pasar por error); sin capacidad → 403.
 */
export function decidirAcceso(e: {
    bandera: boolean;
    habilitado: boolean;
    produccion: boolean;
    /** La petición viene de ESTA máquina (bucle local estricto). */
    esLocal: boolean;
    hayUsuario: boolean;
    tieneCapacidad: boolean;
    rpcFallo: boolean;
    /** (2026-10-10) La cuenta es miembro de MetaGenesis. */
    esMiembro?: boolean;
    /** (2026-10-10) La ruta es de un ámbito de «Genesis para todos» (decide la capacidad). */
    conAmbito?: boolean;
}): DecisionAcceso {
    if (!e.habilitado) return 404;
    if (e.esLocal || !e.produccion) return 200;
    if (!e.hayUsuario) return 401;
    if (e.rpcFallo) return 503;
    if (e.bandera && e.conAmbito) return e.tieneCapacidad ? 200 : 403;
    return e.esMiembro ? 200 : 403;
}

/** Token de `Authorization: Bearer …` (MetaGenesis usado desde otra neurona). */
function tokenDe(req?: Request): string | null {
    const h = req?.headers.get("authorization") ?? "";
    const m = h.match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,})$/);
    return m ? m[1] : null;
}

/**
 * Cierto si Genesis está habilitado en esta instancia:
 *  - `NODE_ENV !== "production"` (desarrollo y tests), o
 *  - `STARSEED_MANDO=1`, o
 *  - la petición llega a un despliegue local (`esDespliegueLocal`: localhost,
 *    127.0.0.1, *.local o `STARSEED_LOCAL=1`; nunca en Vercel).
 */
export function mandoHabilitado(req?: Request): boolean {
    if (process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1") return true;
    return req ? esDespliegueLocal(req) : false;
}

/**
 * Puerta única de `/api/mando/*`: 404 si la consola está apagada en esta
 * instancia; sesión obligatoria solo en producción NO local; en local pasa
 * sin sesión (la máquina ya es el perímetro de confianza).
 */
export async function guardianMando(
    req?: Request,
    opciones?: { ambito?: string; capacidad?: CapacidadAmbito },
): Promise<Response | null> {
    const habilitado = mandoHabilitado(req);
    const produccion = process.env.NODE_ENV === "production";
    const esLocal = !!(req && esPeticionDeEstaMaquina(req));
    const bandera = process.env.STARSEED_MANDO_TODOS === "1";
    const conAmbito = !!(opciones?.ambito || opciones?.capacidad);
    let hayUsuario = false;
    let tieneCapacidad = false;
    let esMiembro = false;
    let rpcFallo = false;

    // (2026-10-20 · COL1012Md) Antes de preguntar a Supabase: un token con forma rara o caducado no puede
    // ser válido, y uno que Supabase rechazó hace menos de 10 s tampoco. Los dos responden 401 sin
    // coste. (Un Bearer que ni parece un token no llega aquí: `tokenDe` lo ignora y manda la cookie.)
    const tokenPresentado = habilitado && produccion && !esLocal ? tokenDe(req) : null;
    const huellaPresentada = tokenPresentado ? await huellaToken(tokenPresentado).catch(() => null) : null;
    if (tokenPresentado) {
        const defecto = defectoDelToken(tokenPresentado);
        if (defecto) {
            return Response.json(
                { error: defecto === "caducado" ? "Tu sesión ha caducado. Vuelve a iniciar sesión." : "Token de sesión no válido." },
                { status: 401 },
            );
        }
        if (huellaPresentada && rechazados.leer(huellaPresentada)) {
            return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        }
    }

    // (2026-10-10) Token ya verificado hace menos de 60 s (y sin caducar): no se vuelve a preguntar
    // a Supabase en cada lectura remota. Ver `src/lib/metagenesis/cache-verificacion.ts`.
    const tokenRemoto = tokenPresentado && !(bandera && conAmbito) ? tokenPresentado : null;
    // Sin Bearer, la sesión del navegador llega por cookie: se recuerda por la huella de sus cookies de sesión
    // (nunca su valor), con la misma vida que un token. Sin cookie de sesión es null y se pregunta como siempre.
    const huellaCookie =
        habilitado && produccion && !esLocal && !tokenPresentado && !(bandera && conAmbito)
            ? await huellaSesionPorCookie(req?.headers.get("cookie") ?? null).catch(() => null)
            : null;
    const huella = tokenRemoto ? huellaPresentada : huellaCookie;
    const recordado = huella ? verificados.leer(huella) : null;
    if (recordado) {
        hayUsuario = true;
        esMiembro = recordado.miembro;
    } else if (habilitado && produccion && !esLocal) {
        // (2026-10-20 · COL1012Md) Capa 2 de la cuota: una IP que lleva `FALLOS_POR_IP` rechazos en la ventana
        // no vuelve a costar peticiones a Supabase hasta que acabe (lo que ya estaba verificado —Bearer o
        // cookie de sesión—, arriba, sí pasa).
        const ip = ipDeLaPeticion(req);
        const espera = msDeFreno(ip);
        if (espera > 0) {
            return Response.json(
                { error: "Demasiados intentos de sesión fallidos. Espera un momento." },
                { status: 429, headers: { "Retry-After": String(Math.ceil(espera / 1000)) } },
            );
        }
        try {
            // Sesión: cookie (misma web) o token (MetaGenesis desde otra neurona por el túnel).
            const token = tokenDe(req);
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            const supabase =
                token && url && anon
                    ? clienteConToken(url, anon, {
                          auth: { persistSession: false, autoRefreshToken: false },
                          global: { headers: { Authorization: `Bearer ${token}` } },
                      })
                    : await createClient();
            const { data, error } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
            if (error || !data.user) {
                // Rechazo claro de un token (no un fallo del medio): se recuerda 10 s para no repetir la pregunta.
                if (token && huellaPresentada && !esFalloTransitorio(error)) {
                    rechazados.guardar(huellaPresentada, { motivo: "rechazado" }, expDelToken(token));
                }
                if (esRechazoDeSesion(error)) anotarRechazo(ip);
                return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
            }
            hayUsuario = true;
            const usuarioId = data.user.id;
            try {
                if (bandera && conAmbito) {
                    const { data: ok, error: errRpc } = await supabase.rpc("mando_capacidad", {
                        _ambito_id: opciones?.ambito ?? usuarioId,
                        capacidad: opciones?.capacidad ?? "ver-detalle",
                    });
                    if (errRpc) rpcFallo = true;
                    else tieneCapacidad = ok === true;
                } else {
                    const { data: ok, error: errRpc } = await supabase.rpc("es_metagenesis");
                    if (errRpc) rpcFallo = true;
                    else {
                        esMiembro = ok === true;
                        if (huella) {
                            verificados.guardar(huella, { usuario: usuarioId, miembro: esMiembro }, tokenRemoto ? expDelToken(tokenRemoto) : null);
                        }
                    }
                }
            } catch {
                rpcFallo = true;
            }
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }

    const decision = decidirAcceso({ bandera, habilitado, produccion, esLocal, hayUsuario, tieneCapacidad, rpcFallo, esMiembro, conAmbito });
    if (decision === 404) return new Response("Not Found", { status: 404 });
    if (decision === 401) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    if (decision === 403)
        return Response.json(
            { error: conAmbito ? "No tienes permiso en este Genesis." : "MetaGenesis es solo para desarrolladores de StarSeed OS con permiso." },
            { status: 403 },
        );
    if (decision === 503) return Response.json({ error: "No se pudo comprobar el permiso." }, { status: 503 });
    return null;
}
