import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { moderarPublicacion } from "@/lib/jev/moderacion";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = rateLimit(`moderacion:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones de moderación" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    texto?: unknown;
    titulo?: unknown;
    autor?: unknown;
  } | null;

  if (!body || typeof body.texto !== "string" || !body.texto.trim()) {
    return NextResponse.json(
      { error: "Falta el campo 'texto' en la petición de moderación" },
      { status: 400 }
    );
  }

  const titulo = typeof body.titulo === "string" ? body.titulo : undefined;
  const autor = typeof body.autor === "string" ? body.autor : undefined;

  const resultado = await moderarPublicacion(body.texto, { titulo, autor });
  return NextResponse.json(resultado, { status: 200 });
}
