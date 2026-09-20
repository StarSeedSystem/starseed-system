/**
 * /api/ai/astraura-158 — Diagnóstico del destino de razonamiento de Astraura 1.58.
 */

import { NextRequest } from "next/server";
import { destinoParaPeticion } from "@/lib/astraura/donde-razona-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const query = req.nextUrl.searchParams.get("destino") ?? "";
  const cabecera = req.headers.get("x-starseed-destino") ?? "";
  const reqDestino = query.trim() || cabecera.trim() || null;

  const dec = await destinoParaPeticion({ destinoPedido: reqDestino });
  return Response.json({
    ok: true,
    destino: dec.destino,
    motivo: dec.motivo,
  });
}
