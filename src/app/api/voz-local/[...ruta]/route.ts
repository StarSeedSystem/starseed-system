import { NextRequest, NextResponse } from "next/server";

/**
 * /api/voz-local/* → 127.0.0.1:4444/* (Adenda 217 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxy del daemon de voz local por el PROPIO servidor del OS. El navegador
 * habla siempre con su mismo origen, así que funciona donde una petición
 * directa a `127.0.0.1:4444` no llega: navegadores embebidos, paneles
 * aislados, Tauri con webview restringida, CSP estrictas.
 *
 * Solo tiene sentido cuando el servidor Next corre EN la misma máquina que el
 * daemon (desarrollo, Tauri, autoalojado). En Vercel el servidor está en la
 * nube y no ve el 127.0.0.1 del usuario: responde 502 y el cliente
 * (`motor-local.ts`) salta a la petición directa.
 *
 * Solo se reenvían las rutas del daemon; nada más.
 */
export const runtime = "nodejs";

const DAEMON = "http://127.0.0.1:4444";
const RUTAS = new Set(["status", "tts", "warm", "identity", "asr"]);

async function reenviar(req: NextRequest, ruta: string[]): Promise<Response> {
    const destino = ruta.join("/");
    if (!RUTAS.has(destino)) return NextResponse.json({ ok: false, error: "ruta no permitida" }, { status: 404 });
    try {
        const ctrl = new AbortController();
        // tts: una frase larga tarda ~90 s en un M1/8 GB y el daemon da 150 s al servidor
        // residente; con 120 s las últimas frases de un párrafo se quedaban mudas.
        // asr: el daemon da 120 s al proceso asr_infer; damos 130 s de margen.
        const t = setTimeout(() => ctrl.abort(), destino === "tts" ? 200_000 : destino === "asr" ? 130_000 : 5_000);
        // Multipart (campo `audio` de /asr): reenviamos el cuerpo binario TAL CUAL,
        // pasando el stream del request con duplex:"half" y la cabecera content-type
        // original (incluye el boundary), para no romper el parseo en el daemon.
        const contentType = req.headers.get("content-type") || "application/json";
        const esMultipart = contentType.startsWith("multipart/form-data");
        const body = req.method === "POST" ? (esMultipart ? req.body : await req.text()) : undefined;
        const init: RequestInit = {
            method: req.method,
            headers: { "Content-Type": contentType },
            signal: ctrl.signal,
        };
        if (body !== undefined) {
            init.body = body as BodyInit;
            if (esMultipart) (init as RequestInit & { duplex: string }).duplex = "half";
        }
        const r = await fetch(`${DAEMON}/${destino}`, init);
        clearTimeout(t);
        const cuerpo = await r.arrayBuffer();
        return new Response(cuerpo, {
            status: r.status,
            headers: {
                "Content-Type": r.headers.get("content-type") || "application/octet-stream",
                "Cache-Control": "no-store",
                "X-Astraura-Via": "proxy-local",
            },
        });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: `daemon local inalcanzable desde el servidor: ${(e as Error)?.message ?? "error"}` },
            { status: 502 },
        );
    }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
    return reenviar(req, (await ctx.params).ruta ?? []);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
    return reenviar(req, (await ctx.params).ruta ?? []);
}
