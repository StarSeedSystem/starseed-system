import { guardianMando } from "@/lib/mando/guardian";
import { resumirRecursosRed } from "@/lib/mando/recursos-red";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const veto = await guardianMando(request);
  if (veto) return veto;

  const resumen = resumirRecursosRed({
    ofertas: [],
    prestamos: [],
    volumenes: [],
  });

  return Response.json(resumen, { headers: { "Cache-Control": "no-store" } });
}
