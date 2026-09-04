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
 * ⚠️ Seguridad (copiada del patrón de /api/mando/estado):
 *  · SOLO LOCAL: si NODE_ENV es production y no hay STARSEED_MANDO=1 → 404.
 *  · El POST valida `tamano` contra la lista blanca (400 si no encaja).
 *  · NUNCA devuelve rutas absolutas del disco: solo nombres de archivo.
 */

import {
    TAMANOS_VALIDOS,
    leerMotores,
    reiniciarConModelo,
    type TamanoModelo,
} from "@/lib/voces/motores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mismo candado que el Centro de Mando: la ruta no existe fuera de local. */
function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

export async function GET(): Promise<Response> {
    if (!mandoHabilitado()) {
        return new Response("Not Found", { status: 404 });
    }
    const estado = await leerMotores();
    return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    if (!mandoHabilitado()) {
        return new Response("Not Found", { status: 404 });
    }

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
