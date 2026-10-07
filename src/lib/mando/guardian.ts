import { createClient } from "@/utils/supabase/server";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";

/**
 * Cierto si el mando está habilitado en esta instancia:
 *  - `NODE_ENV !== "production"` (desarrollo y tests), o
 *  - `STARSEED_MANDO_TODOS=1`, o
 *  - la petición llega a un despliegue local (`esDespliegueLocal`: localhost,
 *    127.0.0.1, *.local o `STARSEED_LOCAL=1`; nunca en Vercel).
 */
export function mandoHabilitado(req?: Request): boolean {
    if (process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO_TODOS === "1") return true;
    return req ? esDespliegueLocal(req) : false;
}

/**
 * Saca la decisión a una función pura exportada `decidirAcceso`.
 * 
 * Decide si una solicitud de acceso al Mando debería ser permitida (200),
 * rechazada por diferentes razones, o bloqueada.
 * 
 * @param bandera - `true` si STARSEED_MANDO_TODOS=1 está habilitado
 * @param produccion - `true` si estamos en modo producción (NODE_ENV=production)
 * @param esLocal - `true` si la solicitud es desde un despliegue local
 * @param hayUsuario - `true` si hay un usuario autenticado en la sesión
 * @param tieneCapacidad - `true` si el usuario tiene la capacidad solicitada en el ámbito
 * @param rpcFallo - `true` si la RPC mando_capacidad falló al verificar la capacidad
 * @returns Uno de: 200 (permitido), 401 (sin sesión), 403 (sin permiso), 404 (mando apagado), 503 (RPC falló)
 */
export function decidirAcceso({
    bandera,
    produccion,
    esLocal,
    hayUsuario,
    tieneCapacidad,
    rpcFallo,
}: {
    bandera: boolean;
    produccion: boolean;
    esLocal: boolean;
    hayUsuario: boolean;
    tieneCapacidad: boolean;
    rpcFallo: boolean;
}): 200 | 401 | 403 | 404 | 503 {
    if (!bandera) {
        if (produccion && !esLocal) {
            if (rpcFallo) return 503;
            if (!hayUsuario) return 401;
            if (!tieneCapacidad) return 403;
        }
        return 200;
    }
    if (produccion && !esLocal) {
        if (rpcFallo) return 503;
        if (!hayUsuario) return 401;
        if (!tieneCapacidad) return 403;
    }
    return 200;
}

/**
 * Puerta única de `/api/mando/*`: 404 si la consola está apagada en esta
 * instancia; sesión obligatoria solo en producción NO local; en local pasa
 * sin sesión (la máquina ya es el perímetro de confianza).
 */
export async function guardianMando(
    req?: Request,
    opciones?: { ambito?: string; capacidad?: string },
): Promise<Response | null> {
    const bandera = process.env.STARSEED_MANDO_TODOS === "1";
    const produccion = process.env.NODE_ENV === "production";
    const esLocal = req ? esDespliegueLocal(req) : true;

    let hayUsuario = false;
    let tieneCapacidad = false;
    let rpcFallo = false;

    if (produccion && !esLocal) {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            hayUsuario = !error && !!data.user;
            if (hayUsuario) {
                try {
                    const { data: capacidadData, error: capacidadError } = await supabase.rpc(
                        "mando_capacidad",
                        { ambito: opciones?.ambito || null, capacidad: opciones?.capacidad || "ver-detalle" },
                    );
                    tieneCapacidad = !capacidadError && !!capacidadData;
                } catch {
                    rpcFallo = true;
                }
            }
        } catch {
            rpcFallo = true;
        }
    }

    const decision = decidirAcceso({
        bandera,
        produccion,
        esLocal,
        hayUsuario,
        tieneCapacidad,
        rpcFallo,
    });

    if (decision === 200 && mandoHabilitado(req)) return null;
    if (decision === 401) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    if (decision === 403) return Response.json({ error: "No tienes permiso en este Mando." }, { status: 403 });
    if (decision === 503) return Response.json({ error: "No se pudo verificar la sesión." }, { status: 503 });
    if (decision === 404 || !mandoHabilitado(req)) return new Response("Not Found", { status: 404 });

    return null;
}
