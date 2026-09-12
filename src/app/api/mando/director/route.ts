import { NextResponse } from "next/server";

import { construirRamificacion } from "@/lib/mando/ramificacion";
import { medirAgentes } from "@/lib/mando/lector-local";

/** Director: usa las MISMAS fuentes frescas que el pulso del CentroMando.
 *  Lee el EstadoMando completo y aplica las mismas reglas de conteo que `contarTrabajoReal`.
 *  Esto garantiza que "Tareas en curso" del pulso = los agentes que el Director muestra. */

export async function GET(_peticion: Request) {
    try {
        // Fuentes frescas idénticas a las que usa el pulso del CentroMando
        const [rama, agentesMedidos] = await Promise.all([
            construirRamificacion(8).catch(() => null as any),
            medirAgentes().catch(() => ({ activos: 0, orquestadores: 0, capacidad: 0, memoriaLibreMb: null, holgado: false })),
        ]);

        // Si no hay ramificación, no hay qué mostrar
        if (!rama || !rama.olas || rama.olas.length === 0) {
            return NextResponse.json({
                agentes: [],
                totalColas: 0,
                tareasEjecutables: 0,
                tareasHechas: 0,
                tareasPendientes: 0,
                tareasBloqueadas: 0,
                olasActivas: [],
                proveedoresVivos: 0,
                apinexDisponible: false,
            });
        }

        // Usar la misma lógica que el pulso: la ola activa es la que tiene agentes latiendo AHORA
        // El pulso elige la ola viva (con latidos frescos) o la más reciente
        const olasVivas = rama.olas.filter((o: any) => o.viva);
        const olaActiva = olasVivas.length > 0 ? olasVivas[0] : rama.olas[rama.olas.length - 1];
        const tareas = olaActiva.tareas ?? [];

        // LATIDOS = fuente única de agentes activos (igual que el pulso)
        // `construirRamificacion` ya calcula `ramificacion.latidos` como los latidos frescos
        // (los que tienen quietoSegundos <= LATIDO_FRESCO_S = 300s).
        // El Director usa ESTOS para mostrar los mismos agentes que el pulso cuenta.
        const latidos: any[] = rama.latidos ?? [];
        const vivoPorId = new Map<string, { latido: any; tarea: any }>();

        for (const l of latidos) {
            if (!l.tarea) continue;
            const t = tareas.find((tt: any) => tt.id === l.tarea) ?? null;
            if (t) vivoPorId.set(l.tarea, { latido: l, tarea: t });
        }

        // Construir agentes: solo los que tienen latido fresco (misma regla que el pulso)
        const agentes: any[] = [];
        const proveedoresVivos = new Set<string>();
        let apinexDisponible = false;

        for (const [id, entry] of vivoPorId) {
            const { latido, tarea } = entry;
            const proveedor = (latido.modelo || "").split("/")[0] || "—";
            const fase = ["hecho", "cancelado", "integrado"].includes(latido.fase || "")
                ? latido.fase
                : (latido.fase || tarea.estado || "escribiendo");

            agentes.push({
                id: tarea.id,
                nombre: (tarea.titulo || "").trim().slice(0, 40) || tarea.id,
                fase,
                modelo: latido.modelo || tarea.modelo || "—",
                proveedor: proveedor,
                ola: olaActiva.id,
                tarea: (tarea.titulo || "").trim() || "—",
                bytes: latido.bytesLog ?? 0,
                minutos: latido.minutos ?? 0,
                intento: latido.intento ?? 1,
                quietoSegundos: latido.quietoSegundos ?? 0,
                rpm: 0,
                vivo: true,
                commits: 0,
                verificaciones: 0,
                mcpConectados: 0,
                pluginsActivos: 0,
            });

            proveedoresVivos.add(proveedor);
            if (proveedor === "apinex") apinexDisponible = true;
        }

        // tareasEjecutables = latidos frescos (igual que el pulso cuenta "en curso")
        const tareasEjecutables = agentes.filter(a => a.vivo).length;
        const tareasHechas = tareas.filter((t: any) => ["commit", "bloqueante", "sin_cambios"].includes(t.estado)).length;
        const tareasPendientes = tareas.filter((t: any) => ["pendiente", "interrumpida", "pendiente_aprobacion"].includes(t.estado)).length;
        const tareasBloqueadas = tareas.filter((t: any) => t.estado === "bloqueada").length;

        return NextResponse.json({
            agentes,
            totalColas: 0,
            tareasEjecutables,
            tareasHechas,
            tareasPendientes,
            tareasBloqueadas,
            olasActivas: rama.olas.slice(0, 10).map((o: any) => o.id),
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
