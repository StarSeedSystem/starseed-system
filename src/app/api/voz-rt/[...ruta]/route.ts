import { NextRequest, NextResponse } from "next/server";

import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";

/**
 * /api/voz-rt/* → 127.0.0.1:4460/* · la voz en tiempo real de Astraura (2026-09-22)
 * ─────────────────────────────────────────────────────────────────────────────
 * El servidor `native/astraura-voice/conversacion/voz_rt.py` (Supertonic 3) sintetiza una
 * frase en ~0,3× su duración en la Mac de Alex: la voz va por delante de lo que se oye y no
 * hay pausas de carga. Mismo origen que la página (igual que `/api/voz-local`), así funciona
 * en navegadores embebidos y paneles aislados. Solo en despliegue local.
 */
export const runtime = "nodejs";

const VOZ_RT = process.env.STARSEED_VOZ_RT_URL || "http://127.0.0.1:4460";
const RUTAS = new Set(["status", "tts", "latido", "fin"]);
const CABECERAS = ["x-calculo-ms", "x-duracion-ms", "x-pasos", "x-voz", "x-rtf"];

async function reenviar(req: NextRequest, ruta: string[]): Promise<Response> {
    if (!esDespliegueLocal(req)) return new Response("Not Found", { status: 404 });
    const destino = ruta.join("/");
    if (!RUTAS.has(destino)) return NextResponse.json({ ok: false, error: "ruta no permitida" }, { status: 404 });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), destino === "tts" ? 30_000 : 4_000);
    try {
        const r = await fetch(`${VOZ_RT}/${destino}`, {
            method: req.method,
            headers: { "Content-Type": "application/json" },
            body: req.method === "POST" ? await req.text() : undefined,
            signal: ctrl.signal,
        });
        const cuerpo = await r.arrayBuffer();
        const cab: Record<string, string> = {
            "Content-Type": r.headers.get("content-type") || "application/octet-stream",
            "Cache-Control": "no-store",
        };
        for (const c of CABECERAS) {
            const v = r.headers.get(c);
            if (v) cab[c] = v;
        }
        return new Response(cuerpo, { status: r.status, headers: cab });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: `voz en tiempo real inalcanzable: ${(e as Error)?.message ?? "error"}` },
            { status: 502 },
        );
    } finally {
        clearTimeout(t);
    }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
    return reenviar(req, (await ctx.params).ruta);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
    return reenviar(req, (await ctx.params).ruta);
}
