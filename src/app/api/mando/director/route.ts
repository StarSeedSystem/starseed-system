import { NextResponse } from "next/server";
import { leerLatidosCompletos } from "@/lib/mando/lector-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUIETO_MAX_SEGUNDOS = 7200; // 2 horas

/**
 * GET /api/mando/director — mismo origen de datos que el Puente de Mando.
 * Lee TODOS los latidos activos y filtra por actividad reciente.
 */
export async function GET() {
    try {
        const todos = await leerLatidosCompletos();

        const agentes = todos
            .filter((l) => (l.quietoSegundos ?? 0) <= QUIETO_MAX_SEGUNDOS)
            .map((l) => {
                const proveedor = (l.modelo || "").split("/")[0] || "—";
                return {
                    id: l.tarea,
                    nombre: l.tarea,
                    fase: l.fase || "escribiendo",
                    modelo: l.modelo || "—",
                    proveedor,
                    ola: l.cola || "—",
                    bytes: l.bytesLog ?? 0,
                    minutos: l.minutos ?? 0,
                    quietoSegundos: l.quietoSegundos ?? 0,
                    vivo: (l.quietoSegundos ?? 0) <= 600 || (l.fase || "") === "escribiendo",
                    donde: l.donde || "mac",
                };
            });

        const proveedores = new Set(agentes.map((a) => a.proveedor));
        const apinexOk = proveedores.has("apinex");

        return NextResponse.json({
            agentes,
            totalColas: new Set(agentes.map((a) => a.ola)).size,
            tareasEjecutables: agentes.filter((a) => a.vivo).length,
            tareasHechas: 0,
            tareasPendientes: 0,
            tareasBloqueadas: 0,
            olasActivas: [...new Set(agentes.map((a) => a.ola))],
            proveedoresVivos: proveedores.size,
            apinexDisponible: apinexOk,
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return NextResponse.json({ error: "Error leyendo director", message: String(error) }, { status: 500 });
    }
}
