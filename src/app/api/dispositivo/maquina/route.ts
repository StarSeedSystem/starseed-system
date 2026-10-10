/**
 * GET /api/dispositivo/maquina — huella corta del nombre de ESTA máquina (2026-10-09).
 *
 * La usa el registro de neuronas para reconocer que Chrome en localhost:9002 y la app nativa
 * (que la calcula igual con `device_info`) son el MISMO aparato y no dos neuronas. Solo responde
 * a peticiones de la propia máquina (`esPeticionDeEstaMaquina`): un móvil del Wi-Fi o un túnel
 * reciben 404 y no pueden hacerse pasar por la Mac. Nunca devuelve el nombre, solo su huella.
 */
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { NextResponse } from "next/server";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import { normalizarNombreMaquina } from "@/lib/neurons/maquina-tipos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!esPeticionDeEstaMaquina(req)) return new NextResponse(null, { status: 404 });
  const nombre = normalizarNombreMaquina(hostname());
  if (!nombre) return NextResponse.json({ huella: null }, { headers: { "cache-control": "no-store" } });
  const huella = createHash("sha256").update(`starseed-maquina:${nombre}`).digest("hex").slice(0, 16);
  return NextResponse.json({ huella }, { headers: { "cache-control": "no-store" } });
}
