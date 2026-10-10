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

    if (habilitado && produccion && !esLocal) {
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
                    else esMiembro = ok === true;
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
