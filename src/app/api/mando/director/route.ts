import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import path from "path";

import { guardianMando } from "@/lib/mando/guardian";

const ROOT = process.env.STARSEED_ROOT || path.join(process.env.HOME || "/Users/alex", "Documents", "starseed-os-main");
const OLAS_DIR = path.join(ROOT, "starseed_memory_root", "olas");

export async function GET(peticion: Request) {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    try {
        const archivos = await readdir(OLAS_DIR);
        const colas = archivos.filter(f => f.startsWith("cola-") && f.endsWith(".json"));

        // Prioridad: leer solo la cola más reciente con agentes activos (en curso)
        // Si no hay ninguna con activos, leer la cola más reciente completa
        const colasConEstado = await Promise.all(colas.map(async (archivo) => {
            const nombreCola = archivo.replace(".json", "");
            const latidoPath = path.join(OLAS_DIR, `latidos-${nombreCola}.json`);
            let latido: any = null;
            let tieneActivos = false;
            try {
                const latidoContent = await readFile(latidoPath, "utf-8");
                latido = JSON.parse(latidoContent);
                const tareasLatido = latido.tareas || {};
                tieneActivos = Object.values(tareasLatido).some((t: any) =>
                    t.fase && !["hecho", "integrado", "cancelado", "fallido"].includes(t.fase)
                );
            } catch { /* sin latido */ }
            return { archivo, nombreCola, latido, tieneActivos };
        }));

        // Elegir la cola más reciente con activos, o la primera si no hay activos
        const colaActiva = colasConEstado.find(c => c.tieneActivos);
        const colaElegida = colaActiva || colasConEstado[0];

        if (!colaElegida) {
            return NextResponse.json({
                agentes: [],
                totalColas: colas.length,
                tareasEjecutables: 0,
                tareasHechas: 0,
                tareasPendientes: 0,
                tareasBloqueadas: 0,
                olasActivas: [],
                proveedoresVivos: 0,
                apinexDisponible: false,
            });
        }

        // Leer la cola elegida
        const rutaCola = path.join(OLAS_DIR, colaElegida.archivo);
        const contenidoCola = await readFile(rutaCola, "utf-8");
        const datos = JSON.parse(contenidoCola);
        const latido = colaElegida.latido;

        // Desduplicar por id y construir lista de agentes
        const agentesMap = new Map<string, any>();
        const olasActivas = new Set<string>();
        let totalEjecutables = 0;
        let totalHechas = 0;
        let totalPendientes = 0;
        let totalBloqueadas = 0;
        const proveedoresVivos = new Set<string>();
        let apinexDisponible = false;

        for (const tarea of datos) {
            const id = tarea.id;
            if (agentesMap.has(id)) continue; // ya procesado

            const ola = tarea.ola || "Sin ola";
            olasActivas.add(ola);

            let estadoReal = tarea.estado || "pendiente";
            let faseReal = "";
            let infoLatido: any = null;

            if (latido && latido.tareas && latido.tareas[id]) {
                infoLatido = latido.tareas[id];
                faseReal = infoLatido.fase || "";
                if (faseReal === "hecho" || faseReal === "integrado" || faseReal === "cancelado") {
                    estadoReal = "hecho";
                } else if (faseReal === "fallido") {
                    estadoReal = "fallido";
                } else if (faseReal === "esperando-aprobacion" || faseReal === "esperando aprobación") {
                    estadoReal = "pendiente";
                } else if (faseReal) {
                    estadoReal = "ejecutando";
                }
            }

            if (estadoReal === "hecho" || estadoReal === "integrado") {
                totalHechas++;
            } else if (estadoReal === "fallido") {
                // no contar
            } else if (tarea.aprobacion && estadoReal === "pendiente") {
                totalPendientes++;
            } else {
                const deps = tarea.depende || [];
                const depsPendientes = deps.filter((d: string) =>
                    datos.some((t: any) => t.id === d && (t.estado !== "hecho" && t.estado !== "integrado" && t.estado !== "fallido"))
                );
                if (depsPendientes.length > 0) {
                    totalBloqueadas++;
                } else if (estadoReal === "pendiente" || estadoReal === "ejecutando") {
                    totalEjecutables++;
                }
            }

            const modelo = infoLatido?.modelo || tarea.modelo || "—";
            const proveedor = modelo.split("/")[0] || "—";

            if (infoLatido || (!latido && tarea.estado === "pendiente")) {
                proveedoresVivos.add(proveedor);
                if (proveedor === "apinex") apinexDisponible = true;

                const fase = infoLatido?.fase || tarea.estado || "desconocido";
                const bytes = infoLatido?.bytes || 0;
                const desde = infoLatido?.desde || 0;
                const ahora = Date.now() / 1000;
                const minutos = Math.max(0, Math.round((ahora - desde) / 60));
                const avance = infoLatido?.avance || desde;
                const quietoSegundos = Math.round(ahora - avance);

                agentesMap.set(id, {
                    id,
                    nombre: tarea.titulo?.slice(0, 40) || id,
                    fase,
                    modelo,
                    proveedor,
                    ola: latido?.cola || ola,
                    tarea: tarea.titulo || "—",
                    bytes,
                    minutos,
                    intento: infoLatido?.intento || 1,
                    quietoSegundos,
                    rpm: 0,
                    vivo: !["hecho", "fallido", "integrado", "cancelado"].includes(fase),
                    commits: 0,
                    verificaciones: 0,
                    mcpConectados: 0,
                    pluginsActivos: 0,
                });
            }
        }

        const agentes = Array.from(agentesMap.values());
        agentes.sort((a, b) => {
            if (a.vivo !== b.vivo) return a.vivo ? -1 : 1;
            return b.bytes - a.bytes;
        });

        return NextResponse.json({
            agentes,
            totalColas: colas.length,
            tareasEjecutables: totalEjecutables,
            tareasHechas: totalHechas,
            tareasPendientes: totalPendientes,
            tareasBloqueadas: totalBloqueadas,
            olasActivas: Array.from(olasActivas).slice(0, 10),
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
