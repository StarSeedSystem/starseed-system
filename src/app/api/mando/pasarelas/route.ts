import "server-only";

import { guardianMando } from "@/lib/mando/guardian";
import { leerPasarelas } from "@/lib/mando/pasarelas-lector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    return Response.json(await leerPasarelas(), {
        headers: { "Cache-Control": "no-store" },
    });
}
