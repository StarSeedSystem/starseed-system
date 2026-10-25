/**
 * POST /api/genesis/conectores/claves — recibe la clave que la persona pega en
 * el asistente «Conectar Genesis» (paso 2) y la guarda CIFRADA en la bóveda del
 * ámbito de su cuenta (contrato architecture/genesis-conectores-abiertos.md §4),
 * usando el módulo ya existente `src/lib/genesis/conectores/boveda-servidor.ts`.
 *
 * Seguridad: exige sesión (o petición de esta misma máquina, comprobación
 * estricta), límite por cuenta y cuerpo acotado. El VALOR de la clave muere aquí:
 * no se guarda en registro, log ni respuesta; solo sale la huella (sha256, corta)
 * para que el asistente la muestre sin revelar nada.
 */

import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import { rateLimit } from "@/lib/security/rate-limit";
import { guardarClave } from "@/lib/genesis/conectores/boveda-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLAVE = 8 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
    let cuenta = "esta-maquina";
    if (!esPeticionDeEstaMaquina(req)) {
        try {
            const supabase = await createClient();
            const { data } = await supabase.auth.getUser();
            if (!data.user) {
                return Response.json({ error: "Inicia sesión para guardar claves en tu bóveda." }, { status: 401 });
            }
            cuenta = data.user.id;
        } catch {
            return Response.json({ error: "No se pudo comprobar la sesión." }, { status: 401 });
        }
    }

    const limite = rateLimit(`genesis-claves:${cuenta}`, 20, 10 * 60 * 1000);
    if (!limite.allowed) {
        return Response.json(
            { error: `Has guardado muchas claves seguidas. Vuelve a intentarlo en ${limite.retryAfterSec} s.` },
            { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
        );
    }

    let cuerpo: Record<string, unknown>;
    try {
        cuerpo = (await req.json()) as Record<string, unknown>;
    } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const proveedor = typeof cuerpo.proveedor === "string" ? cuerpo.proveedor.trim().slice(0, 64) : "";
    const variable = typeof cuerpo.variable === "string" ? cuerpo.variable.trim().slice(0, 128) : "";
    const clave = typeof cuerpo.clave === "string" ? cuerpo.clave.trim() : "";
    if (!proveedor || !variable || !clave) {
        return Response.json({ error: "Falta proveedor, variable o clave." }, { status: 400 });
    }
    if (clave.length > MAX_CLAVE) {
        return Response.json({ error: "La clave es demasiado grande." }, { status: 400 });
    }

    const r = await guardarClave(cuenta, proveedor, clave);
    // Solo la huella: ni el valor ni trazas de él salen de aquí.
    if (!r.ok) {
        return Response.json({ ok: false, huella: null, error: r.error ?? "La bóveda rechazó la clave." }, { status: 502 });
    }
    return Response.json({ ok: true, huella: createHash("sha256").update(clave).digest("hex").slice(0, 12) });
}
