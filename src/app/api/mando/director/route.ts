import { NextResponse } from "next/server";

import { guardianMando } from "@/lib/mando/guardian";
import { leerLatidos } from "@/lib/mando/lector-local";
import type { LatidoTarea } from "@/lib/mando/tipos";

/** Director: usa las MISMAS fuentes frescas y locales que el pulso del CentroMando.
 *  NO usa `construirRamificacion` (que toca Supabase y puede fallar). Lee directamente
 *  los latidos frescos del disco (hasta 300 s de quieto) + las colas locales.
 *  Los conteos son los mismos que el pulso calcula con `contarTrabajoReal`. */

export async function GET(peticion: Request) {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    try {
        // Latidos frescos del orquestador (hasta 300 s sin avance = fresco)
        const latidos = await leerLatidos();

        // Tareas vivas = aquellas con latido fresco (lo mismo que el pulso)
        const vivas = latidos.filter(l =>
            l.tarea && l.fase && !["hecho", "cancelado", "integrado", "fallido"].includes(l.fase)
        );

        // Construir lista de agentes para el Director, con modelo/bytes reales desde el latido
        const agentes: any[] = [];
        const olasVivas = new Set<string>();
        const proveedoresVivos = new Set<string>();
        let apinexDisponible = false;

        for (const l of vivas) {
            const id = l.tarea!;
            const modelo = l.modelo ?? "—";
            const proveedor = modelo.split("/")[0] ?? "—";
            const bytes = l.bytesLog ?? 0;
            const minutos = l.minutos ?? 0;
            const intento = l.intento ?? 1;
            const quietoSegundos = l.quietoSegundos ?? 0;

            // La ola viene del nombre de la cola del latido, normalizada
            const colaNormalizada = (l.cola ?? "").replace(/^cola-/, "").replace(/^latidos-/, "");
            const ola = `Ola ${colaNormalizada}`;

            if (proveedor === "apinex") apinexDisponible = true;
            proveedoresVivos.add(proveedor);
            olasVivas.add(ola);

            agentes.push({
                id,
                nombre: id,
                fase: l.fase ?? "escribiendo",
                modelo,
                proveedor,
                ola,
                tarea: id,
                bytes,
                minutos,
                intento,
                quietoSegundos,
                rpm: 0,
                vivo: true,
                commits: 0,
                verificaciones: 0,
                mcpConectados: 0,
                pluginsActivos: 0,
            });
        }

        // Ordenar por bytes descendente (mismo criterio que el pulso)
        agentes.sort((a, b) => b.bytes - a.bytes);

        return NextResponse.json({
            agentes,
            totalColas: 0,  // no escaneamos colas manualmente (consistente con lo que el pulso muestra)
            tareasEjecutables: agentes.length,  // = agentes con latido fresco = lo mismo que el pulso
            tareasHechas: 0,                    // las hechas no tienen latido fresco
            tareasPendientes: 0,                // las pendientes no tienen latido fresco
            tareasBloqueadas: 0,
            olasActivas: Array.from(olasVivas).slice(0, 10),
            proveedoresVivos: proveedoresVivos.size,
            apinexDisponible,
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Error leyendo el director", message: String(error) },
            { status: 500 }
        );
    }
}
