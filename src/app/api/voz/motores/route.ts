/**
 * GET/POST /api/voz/motores (Ola 240 · Estudio de voces — tarea VZ2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Motores y tamaños del motor de voz de esta neurona:
 *
 *  · GET  — qué modelos GGUF hay instalados, cuál está cargado en el demonio
 *           local y el catálogo de los cuatro niveles de «Voz StarSeed».
 *  · POST — `{ "tamano": "Q4_K_M" | "Q8_0" }` reinicia el demonio local con
 *           ese modelo y espera a que vuelva a estar sano.
 *
 * ⚠️ Seguridad (la misma puerta que /api/mando/*):
 *  · `guardianMando`: 404 si la consola está apagada (production sin STARSEED_MANDO=1); en la propia
 *    máquina pasa sin sesión; desde cualquier otro sitio —Genesis publicado en el A1 tras Caddy
 *    (2026-10-20 · COL1012Md)— exige sesión de un miembro de MetaGenesis. Antes esta ruta solo miraba
 *    STARSEED_MANDO=1, y publicada habría dejado a cualquiera reiniciar el motor de voz.
 *  · CAMBIO DE COMPORTAMIENTO a tener presente: en el modo ligero de una neurona (STARSEED_LOCAL=1 sin
 *    STARSEED_MANDO) esta ruta respondía 404 en producción y ahora queda ABIERTA para el bucle local (la
 *    propia máquina, sin sesión) y para miembros de MetaGenesis con sesión, igual que /api/mando/*. Es lo
 *    que el panel promete («solo en esta neurona»), pero antes no ocurría. Con STARSEED_PUBLICO=1 (el A1)
 *    nada es local: siempre sesión.
 *  · El POST valida `tamano` contra la lista blanca (400 si no encaja).
 *  · NUNCA devuelve rutas absolutas del disco: solo nombres de archivo.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    TAMANOS_VALIDOS,
    leerMotores,
    reiniciarConModelo,
    type TamanoModelo,
} from "@/lib/voces/motores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const estado = await leerMotores();
    return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }

    const tamano = (cuerpo as { tamano?: unknown })?.tamano;
    if (typeof tamano !== "string" || !(TAMANOS_VALIDOS as readonly string[]).includes(tamano)) {
        return Response.json(
            { error: "Tamaño no válido. Valores admitidos: Q4_K_M y Q8_0." },
            { status: 400 },
        );
    }

    // El modelo ya validado por la lista blanca alimenta la línea de comandos.
    const resultado = await reiniciarConModelo(tamano as TamanoModelo);
    return Response.json(resultado, {
        status: resultado.ok ? 200 : 502,
        headers: { "Cache-Control": "no-store" },
    });
}
