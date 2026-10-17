// POST /api/bots/invitado · reenvía UN turno a un bot invitado AG-UI (BOT1011N, contrato astraura-bots.md §11).
// Sesión obligatoria. Toda la guardia (SSRF, memoria personal vetada, cabecera por NOMBRE, 60 s y 1 MB) vive en
// `@/lib/astraura-bots/adaptadores/invitado-servidor`; aquí solo se autentica, se lee el cuerpo y se devuelve el flujo
// de eventos tal cual. La cabecera de autorización nunca vuelve al cliente. Una ruta de Next solo exporta lo permitido.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { reenviarTurno, type EntradaTurno } from "@/lib/astraura-bots/adaptadores/invitado-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const error = (mensaje: string, status: number) => NextResponse.json({ ok: false, error: mensaje }, { status });

export async function POST(req: NextRequest) {
  let cuentaId: string;
  try {
    const supabase = await createClient();
    const { data, error: fallo } = await supabase.auth.getUser();
    if (fallo || !data.user) return error("Necesitas iniciar sesión para hablar con un bot invitado.", 401);
    cuentaId = data.user.id;
  } catch {
    return error("No se pudo verificar la sesión.", 401);
  }

  let cuerpo: Partial<EntradaTurno>;
  try {
    cuerpo = (await req.json()) as Partial<EntradaTurno>;
  } catch {
    return error("Petición inválida: el cuerpo no es JSON.", 400);
  }
  if (!cuerpo || typeof cuerpo.endpoint !== "string" || !cuerpo.endpoint.trim()) return error("Falta la dirección del bot invitado.", 400);
  if (cuerpo.cabecera !== undefined && typeof cuerpo.cabecera !== "string") return error("La cabecera se indica por su nombre.", 400);

  const r = await reenviarTurno({
    endpoint: cuerpo.endpoint,
    mensajes: Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [],
    contextoPermitido: Array.isArray(cuerpo.contextoPermitido) ? cuerpo.contextoPermitido : [],
    cabecera: cuerpo.cabecera || undefined,
    hiloId: typeof cuerpo.hiloId === "string" ? cuerpo.hiloId.slice(0, 120) : undefined,
    cuentaId,
  });
  if (!r.ok) return error(r.error, r.status);
  return new Response(r.flujo, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
