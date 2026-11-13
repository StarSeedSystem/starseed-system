/**
 * GET /api/mando/buzon (BZN1108A · Consola de MetaGenesis)
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra los últimos avisos del buzón MetaGenesis (clase='aviso').
 * Solo visibles en local (guardianMando).
 *
 * Respuesta: { avisos: AvisoBuzon[] } con los últimos 20 avisos.
 */

import { createClient } from "@supabase/supabase-js";
import { guardianMando } from "@/lib/mando/guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AvisoBuzon {
    id: number;
    t: string;
    de: string;
    asunto: string;
    texto: string;
    estado: "pendiente" | "entregado" | "fallo" | "archivado";
    entregado_en: string | null;
    detalle: string | null;
}

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !clave) {
        return new Response(JSON.stringify({ avisos: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
    }

    try {
        const sb = createClient(url, clave, { auth: { persistSession: false } });
        const { data, error } = await sb
            .from<AvisoBuzon[]>("metagenesis_buzon")
            .select("*")
            .eq("clase", "aviso")
            .order("t", { ascending: false })
            .limit(20);

        if (error) {
            return new Response(JSON.stringify({ avisos: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
            });
        }

        return new Response(JSON.stringify({ avisos: data ?? [] }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
    } catch {
        return new Response(JSON.stringify({ avisos: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
    }
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !clave) {
        return Response.json({ ok: false, error: "Sin credenciales" }, { status: 500 });
    }

    try {
        const sb = createClient(url, clave, { auth: { persistSession: false } });

        const { error } = await sb
            .from("metagenesis_buzon")
            .update({ estado: "pendiente", detalle: null })
            .eq("clase", "aviso")
            .eq("estado", "fallo");

        if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        return Response.json({ ok: true });
    } catch (e) {
        return Response.json({ ok: false, error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
    }
}