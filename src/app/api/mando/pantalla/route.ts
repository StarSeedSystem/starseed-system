/**
 * GET/POST /api/mando/pantalla (Ola 1005P · Pantalla siempre encendida)
 * ─────────────────────────────────────────────────────────────────────────
 * Lee y cambia el ajuste global `~/.starseed/pantalla.json` que gobierna el
 * servicio `com.starseed.pantalla` de la Mac y la Screen Wake Lock del
 * navegador en cualquier dispositivo con Genesis abierto.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local. NUNCA
 * devuelve la ruta absoluta del archivo ni claves.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { estadoServicioMac, guardarPantalla, leerPantalla } from "@/lib/mando/pantalla-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Respuesta común: el ajuste vigente y el estado del servicio en la Mac. */
async function respuestaPantalla(): Promise<Response> {
    const ajuste = await leerPantalla();
    const mac = await estadoServicioMac();
    return Response.json({ activa: ajuste.activa, desde: ajuste.desde, mac });
}

/** GET: ajuste actual + estado del servicio de la Mac. */
export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    return respuestaPantalla();
}

/** POST {activa: boolean}: cambia el ajuste y devuelve el estado resultante. */
export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const activa = (cuerpo as Record<string, unknown> | null)?.activa;
    if (typeof activa !== "boolean") {
        return Response.json({ error: "`activa` tiene que ser boolean." }, { status: 400 });
    }

    await guardarPantalla(activa, "mando");
    return respuestaPantalla();
}
