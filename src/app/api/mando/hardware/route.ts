import { guardianMando } from "@/lib/mando/guardian";
import { medirHardware } from "@/lib/mando/hardware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const veto = await guardianMando(request);
  if (veto) return veto;
  const hardware = await medirHardware();
  return Response.json(hardware, { headers: { "Cache-Control": "no-store" } });
}