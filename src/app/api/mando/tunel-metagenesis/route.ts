import { guardianMando } from "@/lib/mando/guardian";
import { estadoTunelMetaGenesis } from "@/lib/mando/tunel-metagenesis-estado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const veto = await guardianMando(request);
  if (veto) return veto;

  const estado = await estadoTunelMetaGenesis();
  return Response.json(estado);
}