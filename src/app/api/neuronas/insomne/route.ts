/* GET /api/neuronas/insomne — solo local (404 en producción). Solo lectura. */
import { NextRequest, NextResponse } from "next/server";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { estadoInsomneDesdeSistema } from "@/lib/neurons/insomne-servidor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!esDespliegueLocal(req)) {
    return new Response("Not Found", { status: 404 });
  }
  const estado = estadoInsomneDesdeSistema(new Date());
  return NextResponse.json(estado);
}
