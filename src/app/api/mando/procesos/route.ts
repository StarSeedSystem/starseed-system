import { guardianMando } from "@/lib/mando/guardian";
import { leerProcesosActivos } from "@/lib/cerebros/procesos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    try {
        const procesos = await leerProcesosActivos();
        return Response.json(
            {
                procesos,
                generadoEn: new Date().toISOString(),
            },
            {
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        console.error("[api/mando/procesos] Error reading procesos activos:", error);
        return Response.json(
            {
                error: "No se pudieron leer los procesos activos.",
            },
            {
                status: 500,
                headers: { "Cache-Control": "no-store" },
            }
        );
    }
}