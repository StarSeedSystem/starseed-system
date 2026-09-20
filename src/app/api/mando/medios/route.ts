import { guardianMando } from "@/lib/mando/guardian";
import { sondearMedios } from "@/lib/mando/medios-computo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const url = new URL(request.url);
    const paramForzar = url.searchParams.get("forzar");
    const forzar = paramForzar === "1" || paramForzar === "true";

    try {
        const resultado = await sondearMedios({ forzar });
        return Response.json(resultado, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (err) {
        const msj = err instanceof Error ? err.message : String(err);
        return Response.json(
            {
                medios: [],
                resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
                error: `No se pudieron consultar los medios de cómputo: ${msj}`,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
}
