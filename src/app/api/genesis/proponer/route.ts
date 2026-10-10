/**
 * POST /api/genesis/proponer — el agente de Genesis/PoliGenesis traduce lo que pide una persona
 * a OPERACIONES TIPADAS (2026-10-10).
 *
 * Usa los modelos gratuitos que este servidor ya tiene configurados (`carriles-servidor.ts`), con
 * relevo si uno no tiene cupo. La salida del modelo se VALIDA aquí (`leerRespuestaModelo` →
 * vocabulario cerrado + invariantes del núcleo) y el navegador la vuelve a validar antes de
 * aplicar. Esta ruta no toca datos de nadie: solo propone.
 *
 * Seguridad: exige sesión (o petición de esta misma máquina, comprobación estricta), límite por
 * cuenta (20 cada 10 min) y cuerpo acotado. Sin modelos configurados → 503 que lo dice.
 * SOP: architecture/genesis-personas-poligenesis.md
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import { carrilesGenesis, preguntarCarriles, VARIABLES_CARRILES, type MensajeModelo } from "@/lib/genesis/carriles-servidor";
import { ambitoDesde, contextoValidacion, leerRespuestaModelo, promptSistema, sanearContexto } from "@/lib/genesis/traductor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CUERPO = 64 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
    let cuenta = "esta-maquina";
    if (!esPeticionDeEstaMaquina(req)) {
        try {
            const supabase = await createClient();
            let { data } = await supabase.auth.getUser();
            if (!data.user) {
                const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
                if (token) ({ data } = await supabase.auth.getUser(token));
            }
            if (!data.user) return Response.json({ error: "Inicia sesión para usar Genesis." }, { status: 401 });
            cuenta = data.user.id;
        } catch {
            return Response.json({ error: "No se pudo comprobar la sesión." }, { status: 401 });
        }
    }

    const limite = rateLimit(`genesis-proponer:${cuenta}`, 20, 10 * 60 * 1000);
    if (!limite.allowed) {
        return Response.json(
            { error: `Has pedido muchas propuestas seguidas. Vuelve a intentarlo en ${limite.retryAfterSec} s.` },
            { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
        );
    }

    const crudo = await req.text().catch(() => "");
    if (!crudo || crudo.length > MAX_CUERPO) return Response.json({ error: "Petición vacía o demasiado grande." }, { status: 400 });
    let cuerpo: Record<string, unknown>;
    try {
        cuerpo = JSON.parse(crudo) as Record<string, unknown>;
    } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
    }
    const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim().slice(0, 2000) : "";
    if (!mensaje) return Response.json({ error: "Escribe qué quieres cambiar." }, { status: 400 });

    const ambito = ambitoDesde(cuerpo.ambito);
    const contexto = sanearContexto(cuerpo.contexto);
    const historial: MensajeModelo[] = (Array.isArray(cuerpo.historial) ? cuerpo.historial : [])
        .slice(-6)
        .map((t) => (typeof t === "object" && t ? (t as Record<string, unknown>) : {}))
        .filter((t) => (t.rol === "persona" || t.rol === "agente") && typeof t.texto === "string")
        .map((t) => ({ role: t.rol === "persona" ? ("user" as const) : ("assistant" as const), content: String(t.texto).slice(0, 1200) }));

    const carriles = carrilesGenesis({ local: esPeticionDeEstaMaquina(req) });
    if (carriles.length === 0) {
        return Response.json(
            {
                error: `Este servidor no tiene ningún modelo gratuito configurado para Genesis (mira estas variables: ${VARIABLES_CARRILES.join(", ")}). Puedes seguir creando operaciones a mano.`,
                sinModelos: true,
            },
            { status: 503 },
        );
    }

    const mensajes: MensajeModelo[] = [{ role: "system", content: promptSistema(ambito, contexto) }, ...historial, { role: "user", content: mensaje }];
    const r = await preguntarCarriles(carriles, mensajes);
    if (!r.ok) {
        return Response.json(
            { error: "Ningún modelo gratuito contestó ahora mismo.", intentos: r.intentos },
            { status: 502 },
        );
    }
    const propuesta = leerRespuestaModelo(r.texto, contextoValidacion(ambito, contexto));
    return Response.json({ ...propuesta, modelo: r.carril, intentos: r.intentos });
}
