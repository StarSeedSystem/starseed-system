/* GET /api/neuronas/insomne — estado insomne de ESTA neurona (solo local).
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato: architecture/neurona-insomne.md §3. Como /api/mando/* y
 * /api/jev/systemone, fuera de un despliegue local responde 404: en la nube no
 * hay Insomnia de la máquina del usuario.
 *
 * Solo LEE el estado de Insomnia (no escribe ni ejecuta `pmset`) y NUNCA
 * devuelve rutas del disco: solo el `EstadoInsomne` (activo, hasta, proveedor,
 * motivo, batería, calor…).
 */
import { NextResponse } from "next/server";

import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { leerEstadoInsomne } from "@/lib/neurons/insomne-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!esDespliegueLocal(req)) return new Response("Not Found", { status: 404 });
  return NextResponse.json(leerEstadoInsomne());
}
