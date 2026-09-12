import { NextResponse } from "next/server";

import { construirRamificacion } from "@/lib/mando/ramificacion";
import { medirAgentes } from "@/lib/mando/lector-local";

/** Director: usa las MISMAS fuentes frescas que el pulso del CentroMando.
 *  Lee el EstadoMando completo y aplica las mismas reglas de conteo.
 *  La diferencia clave con la versión anterior: muestra los agentes de los
 *  LATIDOS FRESCOS (como el pulso) en vez de limitarse a la "ola activa"
 *  del árbol, que puede no incluir a las tareas con latido vivo si hay
 *  olas más recientes sin actividad. */

export async function GET(_peticion: Request) {
    try {
        const [rama, agentesMedidos] = await Promise.all([
            construirRamificacion(8).catch(() => null as any),
            medirAgentes().catch(() => ({ activos: 0, orquestadores: 0, capacidad: 0, memoriaLibreMb: null, holgado: false })),
        ]);

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

        // FUENTE PRIMERA: los latidos frescos del pulso (los mismos que el EstadoMando usa)
        // Estos son los agentes **realmente** activos, sin importar en qué ola estén.
        const latidosFrescos: any[] = rama.latidos ?? [];
        const tareasPorId = new Map<string, any>();

        // Recoger TODAS las tareas de todas las olas elegidas (no solo la "activa")
        for (const ola of rama.olas) {
            const tareas = ola.tareas ?? [];
            for (const t of tareas) {
                // Si ya hay una tarea con este id, priorizar la de la ola con latido fresco
                const existente = tareasPorId.get(t.id);
                if (!existente || (t.cola && existente.cola && t.cola.length > existente.cola.length)) {
                    // La tarea con latido vivo debe tener su cola correcta
                    const latidoExistente = latidosFrescos.find((l: any) => l.tarea === t.id);
                    if (latidoExistente && t.cola === latidoExistente.cola) {
                        tareasPorId.set(t.id, t);
                    } else if (!tareasPorId.has(t.id)) {
                        tareasPorId.set(t.id, t);
                    }
                }
            }
        }

        // Indexar latidos por tarea
        const latidoPorId = new Map<string, any>();
        for (const l of latidosFrescos) {
            if (l.tarea) latidoPorId.set(l.tarea, l);
        }

        // Construir agentes: solo los que tienen latido fresco (misma regla que el pulso)
        const agentes: any[] = [];
        const proveedoresVivos = new Set<string>();
        let apinexDisponible = false;

        for (const [id, tarea] of tareasPorId) {
            const latido = latidoPorId.get(id) ?? null;
            if (!latido) continue;  // sin latido fresco, no es agente activo

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
                ola: tarea.ola || latido.cola || "—",
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
        const tareasHechas = rama.olas.reduce((acc: number, o: any) => acc + (o.hechas ?? 0), 0);
        const tareasPendientes = rama.olas.reduce((acc: number, o: any) => acc + (o.pendientes ?? 0), 0);
        const tareasBloqueadas = rama.olas.reduce((acc: number, o: any) => acc + (o.bloqueantes ?? 0), 0);

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
