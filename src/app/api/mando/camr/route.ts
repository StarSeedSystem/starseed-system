/**
 * /api/mando/camr — Proxy local (guardianMando) al agente CAMR en 127.0.0.1:4480.
 * Solo en el Mac; nunca expone claves ni rutas del disco. El panel opera con
 * el simulador cuando el agente no está en línea (§6 · contrato CAMR).
 */
import { guardianMando } from "@/lib/mando/guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENTE_CAMR = "http://127.0.0.1:4480";

export async function GET(request: Request): Promise<Response> {
  const veto = await guardianMando(request);
  if (veto) return veto;

  const url = new URL(request.url);
  const ruta = url.pathname.replace("/api/mando/camr", "");
  const destino = `${AGENTE_CAMR}${ruta || "/estado"}${url.search}`;

  try {
    const agenteRes = await fetch(destino, {
      method: "GET",
      headers: { Accept: "application/json", "X-CAMR-Proxy": "genesis" },
      signal: AbortSignal.timeout(3000),
    });
    const cuerpo = agenteRes.ok ? await agenteRes.json() : { ok: false, error: `agente ${agenteRes.status}` };
    return Response.json({
      proxy: "genesis",
      destino: "agente-camr-local",
      disponible: agenteRes.ok,
      datos: cuerpo,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      proxy: "genesis",
      destino: "agente-camr-local",
      disponible: false,
      datos: { ok: false, error: "agente no responde; operando con simulador" },
      simulador: true,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request): Promise<Response> {
  const veto = await guardianMando(request);
  if (veto) return veto;

  const url = new URL(request.url);
  const ruta = url.pathname.replace("/api/mando/camr", "");
  const destino = `${AGENTE_CAMR}${ruta || "/aplicar"}${url.search}`;

  try {
    const cuerpo = await request.text();
    const agenteRes = await fetch(destino, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-CAMR-Proxy": "genesis" },
      body: cuerpo,
      signal: AbortSignal.timeout(3000),
    });
    const datos = agenteRes.ok ? await agenteRes.json() : { ok: false, error: `agente ${agenteRes.status}` };
    return Response.json({ proxy: "genesis", destino: "agente-camr-local", respuesta: datos }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ proxy: "genesis", destino: "agente-camr-local", simulador: true, respuesta: { ok: false, error: "sin agente; operación simulada" } }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
