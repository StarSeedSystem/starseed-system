/**
 * GET /api/mando/astra — estado de Astra y auditorías
 * POST /api/mando/astra — auditar o fijar techo
 *
 * Ola 294 · AR3 · 2026-09-09.
 * Puerta única `guardianMando` (404 fuera de local; sesión solo en producción no local).
 * Nunca devuelve claves ni rutas del disco.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { AMBITOS_ASTRA } from "@/lib/mando/astra";
import {
  auditar,
  gastoDeHoy,
  listarAuditorias,
  guardarTecho,
  techoGuardado,
  techoDelDia,
} from "@/lib/mando/astra-servidor";
import { claveDe } from "@/lib/mando/modelos-disponibles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;

  const tieneClave = !!(await claveDe("STARSEED_PASARELA_OPENAI_KEY", "OPENAI_API_KEY"));
  const gasto = await gastoDeHoy();
  const techo = await techoGuardado();
  const ultimas = await listarAuditorias(5);

  return Response.json({
    ambitos: AMBITOS_ASTRA.map((a) => ({ id: a.id, etiqueta: a.etiqueta })),
    clavePresente: tieneClave,
    gastoHoy: gasto,
    techo,
    ultimasAuditorias: ultimas,
  });
}

export async function POST(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;

  let cuerpo: Record<string, unknown> = {};
  try {
    const crudo = (await peticion.json()) as unknown;
    cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";

  if (accion === "auditar") {
    const ambito = typeof cuerpo.ambito === "string" ? cuerpo.ambito : "";
    if (!ambito) {
      return Response.json({ error: "Falta el ámbito." }, { status: 400 });
    }
    const modelo = typeof cuerpo.modelo === "string" ? cuerpo.modelo : undefined;
    const resultado = await auditar(ambito, { modelo });
    return Response.json(resultado, { status: resultado.ok ? 200 : 400 });
  }

  if (accion === "techo") {
    const usd = typeof cuerpo.usd === "number" ? cuerpo.usd : Number(cuerpo.usd);
    if (!Number.isFinite(usd) || usd < 0) {
      return Response.json({ error: "Techo debe ser un número positivo." }, { status: 400 });
    }
    await guardarTecho(usd);
    return Response.json({ ok: true, techo: usd });
  }

  return Response.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
}