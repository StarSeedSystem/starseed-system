import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import { guardianMando } from "@/lib/mando/guardian";
import { sugerirParaAmbito } from "@/lib/genesis/conectores/sugerir-conector";
import { guardarEnBoveda, obtenerAsignacionesPorAmbito, asignarClave, obtenerCatalogo } from "@/lib/genesis/conectores/vacio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUERPO = 64 * 1024;

/** Extrae el ámbito desde la query string ?ambito= */
function ambitoDesdeQuery(req: NextRequest): string | null {
    const url = req.nextUrl.href;
    try {
        const u = new URL(url);
        return u.searchParams.get("ambito");
    } catch {
        return null;
    }
}

/**
 * GET /api/genesis/conectores
 * Catálogo filtrado por ámbito + sugerencias + asignaciones (sin claves)
 */
export async function GET(req: NextRequest): Promise<Response> {
    let cuenta = "esta_maquina";
    
    // Verifica si es una petición de esta máquina o desde una cuenta
    if (!esPeticionDeEstaMaquina(req)) {
        try {
            const supabase = await createClient();
            let authRes = await supabase.auth.getUser();
            if (!authRes.data.user) {
                const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
                if (token) {
                    authRes = await supabase.auth.getUser(token);
                }
            }
            if (!authRes.data.user) {
                return NextResponse.json(
                    { error: "Inicia sesión para acceder al catálogo de Genesis." },
                    { status: 401 }
                );
            }
            cuenta = authRes.data.user.id;
        } catch {
            return NextResponse.json(
                { error: "No se pudo comprobar la sesión." },
                { status: 401 }
            );
        }
    }

    const ambitoId = ambitoDesdeQuery(req);
    if (!ambitoId) {
        return NextResponse.json(
            { error: "Falta ?ambito=" },
            { status: 400 }
        );
    }

    const veto = await guardianMando(req, { ambito: ambitoId, capacidad: "usar-apis" });
    if (veto) return veto;

    // Aplica rate limit por cuenta
    const limiter = rateLimit(`genesis-conectores:${cuenta}`, 20, 10 * 60 * 1000);
    if (!limiter.allowed) {
        return NextResponse.json(
            { error: `Has pedido muchas peticiones seguidas. Vuelve a intentarlo en ${limiter.retryAfterSec} s.` },
            { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
        );
    }

    try {
        const sugerencias = await sugerirParaAmbito(ambitoId);
        const asignaciones = await obtenerAsignacionesPorAmbito(ambitoId);
        const catalogo = await obtenerCatalogo(ambitoId);

        return NextResponse.json({
            ambito: ambitoId,
            sugerencias,
            asignaciones,
            catalogo,
        });
    } catch (error) {
        console.error("[genesis/conectores] GET error:", error);
        return NextResponse.json(
            { error: "No se pudo obtener el catálogo." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/genesis/conectores
 * Vincula un proveedor con su valor o asigna una clave a una cadena
 */
export async function POST(req: NextRequest): Promise<Response> {
    let cuenta = "esta_maquina";

    if (!esPeticionDeEstaMaquina(req)) {
        try {
            const supabase = await createClient();
            let authRes = await supabase.auth.getUser();
            if (!authRes.data.user) {
                const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
                if (token) {
                    authRes = await supabase.auth.getUser(token);
                }
            }
            if (!authRes.data.user) {
                return NextResponse.json(
                    { error: "Inicia sesión para vincular un proveedor." },
                    { status: 401 }
                );
            }
            cuenta = authRes.data.user.id;
        } catch {
            return NextResponse.json(
                { error: "No se pudo comprobar la sesión." },
                { status: 401 }
            );
        }
    }

    const ambitoId = ambitoDesdeQuery(req);
    if (!ambitoId) {
        return NextResponse.json(
            { error: "Falta ?ambito=" },
            { status: 400 }
        );
    }

    const veto = await guardianMando(req, { ambito: ambitoId, capacidad: "usar-apis" });
    if (veto) return veto;

    // Rate limit por cuenta
    const limiter = rateLimit(`genesis-conectores:${cuenta}`, 20, 10 * 60 * 1000);
    if (!limiter.allowed) {
        return NextResponse.json(
            { error: `Has pedido muchas peticiones seguidas. Vuelve a intentarlo en ${limiter.retryAfterSec} s.` },
            { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
        );
    }

    const crudo = await req.text().catch(() => "");
    if (!crudo || crudo.length > MAX_CUERPO) {
        return NextResponse.json(
            { error: "Petición vacía o demasiado grande." },
            { status: 400 }
        );
    }

    let cuerpo;
    try {
        cuerpo = JSON.parse(crudo);
    } catch {
        return NextResponse.json(
            { error: "JSON inválido en el cuerpo." },
            { status: 400 }
        );
    }

    const { accion, ambito: cuerpoAmbito } = cuerpo;
    if (!accion || typeof accion !== "string") {
        return NextResponse.json(
            { error: "Falta el campo obligatorio 'accion'." },
            { status: 400 }
        );
    }

    // Usa el ámbito de la query string si no está en el cuerpo
    const ambitoFinal = cuerpoAmbito || ambitoId;

    if (accion === "vincular") {
        const { proveedor, valor } = cuerpo;
        if (!proveedor || typeof proveedor !== "string" || !valor) {
            return NextResponse.json(
                { error: "Faltan campos obligatorios: proveedor, valor." },
                { status: 400 }
            );
        }

        try {
            const { huella, error: errorBoveda } = await guardarEnBoveda(ambitoFinal, proveedor, valor);
            if (errorBoveda) {
                return NextResponse.json(
                    { error: errorBoveda },
                    { status: 400 }
                );
            }

            return NextResponse.json(
                { accion: "vincular", proveedor, huella, ambito: ambitoFinal },
                { status: 201 }
            );
        } catch (error) {
            console.error("[genesis/conectores] vinculacion error:", error);
            return NextResponse.json(
                { error: "No se pudo vincular el proveedor." },
                { status: 500 }
            );
        }
    } else if (accion === "asignar") {
        const { clave, cadena } = cuerpo;
        if (!clave || typeof clave !== "string" || !cadena || typeof cadena !== "string") {
            return NextResponse.json(
                { error: "Faltan campos obligatorios: clave, cadena." },
                { status: 400 }
            );
        }

        try {
            const resultado = await asignarClave(ambitoFinal, clave, cadena);
            if (!resultado.ok) {
                return NextResponse.json(
                    { error: resultado.error || "No se pudo asignar la clave." },
                    { status: 400 }
                );
            }

            return NextResponse.json(
                { accion: "asignar", clave, ambito: ambitoFinal, ok: true },
                { status: 200 }
            );
        } catch (error) {
            console.error("[genesis/conectores] asignacion error:", error);
            return NextResponse.json(
                { error: "No se pudo asignar la clave." },
                { status: 500 }
            );
        }
    } else {
        return NextResponse.json(
            { error: `Acción no soportada: ${accion}` },
            { status: 400 }
        );
    }
}
