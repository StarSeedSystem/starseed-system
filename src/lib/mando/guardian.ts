/**
 * Guardián común de las rutas `/api/mando/*` (solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * 404 fuera de local (salvo `STARSEED_MANDO=1`); en producción desplegada,
 * además, sesión. En un despliegue LOCAL (modo ligero en la neurona, Ola 253 ·
 * 2026-09-06) la consola pasa SIN sesión: es la misma puerta que la de la voz
 * (`esDespliegueLocal`), porque exigir login en la propia máquina dejaba el
 * Puente de Mando apagado justo donde tiene que usarse.
 * Devuelve la respuesta de veto o `null` si se puede seguir.
 */

import { createClient } from "@/utils/supabase/server";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import type { CapacidadAmbito } from "./ambito";

export type DecisionAcceso = 200 | 401 | 403 | 404 | 503;

/**
 * Decisión pura de acceso al Mando. El orden importa:
 * apagado → 404; local u otro no-producción → 200; sin sesión → 401;
 * sin la bandera de "mando para todos" se queda como hoy → 200;
 * RPC caída → 503 (nunca deja pasar por error); sin capacidad → 403.
 */
export function decidirAcceso(e: {
    bandera: boolean;
    habilitado: boolean;
    produccion: boolean;
    esLocal: boolean;
    hayUsuario: boolean;
    tieneCapacidad: boolean;
    rpcFallo: boolean;
}): DecisionAcceso {
    if (!e.habilitado) return 404;
    if (e.esLocal || !e.produccion) return 200;
    if (!e.hayUsuario) return 401;
    if (!e.bandera) return 200;
    if (e.rpcFallo) return 503;
    if (!e.tieneCapacidad) return 403;
    return 200;
}

/**
 * Cierto si el mando está habilitado en esta instancia:
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
    const esLocal = !!(req && esDespliegueLocal(req));
    const bandera = process.env.STARSEED_MANDO_TODOS === "1";
    let hayUsuario = false;
    let usuarioId = "";
    let tieneCapacidad = false;
    let rpcFallo = false;

    if (habilitado && produccion && !esLocal) {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) {
                return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
            }
            hayUsuario = true;
            usuarioId = data.user.id;
            if (bandera) {
                const ambito = opciones?.ambito ?? usuarioId;
                const capacidad = opciones?.capacidad ?? "ver-detalle";
                try {
                    const { data: ok, error: errRpc } = await supabase.rpc("mando_capacidad", {
                        _ambito: ambito,
                        _capacidad: capacidad,
                    });
                    if (errRpc) rpcFallo = true;
                    else tieneCapacidad = ok === true;
                } catch {
                    rpcFallo = true;
                }
            }
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }

    const decision = decidirAcceso({ bandera, habilitado, produccion, esLocal, hayUsuario, tieneCapacidad, rpcFallo });
    if (decision === 404) return new Response("Not Found", { status: 404 });
    if (decision === 401) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    if (decision === 403) return Response.json({ error: "No tienes permiso en este Mando." }, { status: 403 });
    if (decision === 503) return Response.json({ error: "No se pudo comprobar el permiso." }, { status: 503 });
    return null;
}
