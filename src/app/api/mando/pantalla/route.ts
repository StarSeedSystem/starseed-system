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
import {
    estadoServicioMac,
    guardarPantalla,
    leerDespierto,
    leerPantalla,
    senalesDespierto,
} from "@/lib/mando/pantalla-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Respuesta común: el ajuste vigente, el estado del servicio en la Mac y el latido. */
async function respuestaPantalla(): Promise<Response> {
    const ajuste = await leerPantalla();
    const mac = await estadoServicioMac();
    // (KAL1101C) El estado keepalive de ESTA neurona, leído del latido local
    // (`~/.starseed/despierto.json`, lo que escribe `mantener_pantalla.py`).
    const senales = senalesDespierto(await leerDespierto());
    return Response.json({
        activa: ajuste.activa,
        modo: ajuste.modo ?? null,
        desde: ajuste.desde,
        mac,
        ...(senales ? { senales } : {}),
    });
}

/** GET: ajuste actual + estado del servicio de la Mac. */
export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    return respuestaPantalla();
}

/** POST {activa} · {neuronaId, seguir, modo}: cambia el ajuste y devuelve el estado. */
export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const crudo = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo)
        ? (cuerpo as Record<string, unknown>)
        : {};
    // (KAL1101C) Ajuste clásico {activa} o por neurona {neuronaId, seguir, modo};
    // solo num era aceptado, el interruptor de la neurona llega con `seguir`.
    const activa = typeof crudo.activa === "boolean"
        ? crudo.activa
        : typeof crudo.seguir === "boolean"
          ? crudo.seguir
          : null;
    if (activa === null) {
        return Response.json({ error: "`activa` (o `seguir`) tiene que ser boolean." }, { status: 400 });
    }
    const modo = crudo.modo === "pantalla" || crudo.modo === "sistema" ? crudo.modo : undefined;

    await guardarPantalla(activa, "mando", undefined, modo);
    return respuestaPantalla();
}
