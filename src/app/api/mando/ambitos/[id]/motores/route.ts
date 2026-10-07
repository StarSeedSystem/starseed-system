/**
 * Motores de un ámbito — Mando para todos (PT1009B · §2 y §6.2 del contrato).
 *
 *   POST   {nombre, tipo, capacidades} → registra un motor vía RPC
 *          `mando_registrar_motor` y enseña el token UNA sola vez.
 *   GET    → motores del ámbito desde la vista `mando_motores_publica`
 *          (nunca token_hash).
 *   DELETE ?motor=<id> → revoca el motor vía RPC `mando_revocar_motor`.
 *
 * Todo detrás de `STARSEED_MANDO_TODOS=1`: sin la bandera, 404 y el Mando se
 * comporta exactamente igual que hoy. La tabla `mando_motores` está cerrada:
 * nada de insert/update directos.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { crearTokenMotor } from "@/lib/mando/motor-token";
import { armarRespuestaMotor, validarCuerpoMotor } from "@/lib/mando/motores";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" } as const;

type Params = { params: Promise<{ id: string }> };

function sinBandera(): boolean {
    return process.env.STARSEED_MANDO_TODOS !== "1";
}

export async function POST(peticion: Request, { params }: Params): Promise<Response> {
    if (sinBandera()) return new Response("Not Found", { status: 404 });
    const { id } = await params;
    const veto = await guardianMando(peticion, { ambito: id, capacidad: "gestionar-motores" });
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const valido = validarCuerpoMotor(cuerpo);
    if (!valido.ok) return Response.json({ error: valido.error }, { status: 400 });

    const { token, hash, huella } = crearTokenMotor();
    const supabase = await createClient();
    const { data: motorId, error } = await supabase.rpc("mando_registrar_motor", {
        _ambito: id,
        _nombre: valido.valor.nombre,
        _tipo: valido.valor.tipo,
        _token_hash: hash,
        _huella: huella,
        _capacidades: valido.valor.capacidades,
    });
    if (error || typeof motorId !== "string") {
        return Response.json({ error: "No se pudo registrar el motor." }, { status: 403 });
    }

    return Response.json(
        armarRespuestaMotor({ motorId, huella, token }),
        { status: 201, headers: SIN_CACHE },
    );
}

export async function GET(peticion: Request, { params }: Params): Promise<Response> {
    if (sinBandera()) return new Response("Not Found", { status: 404 });
    const { id } = await params;
    const veto = await guardianMando(peticion, { ambito: id, capacidad: "ver-detalle" });
    if (veto) return veto;

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("mando_motores_publica")
        .select("id, nombre, tipo, huella, capacidades, estado, ultimo_reporte, creado_por")
        .eq("ambito_id", id);
    if (error) return Response.json({ error: "No se pudieron leer los motores." }, { status: 500 });
    return Response.json({ motores: data ?? [] }, { headers: SIN_CACHE });
}

export async function DELETE(peticion: Request, { params }: Params): Promise<Response> {
    if (sinBandera()) return new Response("Not Found", { status: 404 });
    const { id } = await params;
    const veto = await guardianMando(peticion, { ambito: id, capacidad: "gestionar-motores" });
    if (veto) return veto;

    const motor = new URL(peticion.url).searchParams.get("motor") ?? "";
    if (!motor) return Response.json({ error: "Falta ?motor=<id>." }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("mando_revocar_motor", { _motor: motor });
    if (error || data !== true) {
        return Response.json({ error: "No se pudo revocar el motor." }, { status: 403 });
    }
    return Response.json({ ok: true }, { headers: SIN_CACHE });
}
