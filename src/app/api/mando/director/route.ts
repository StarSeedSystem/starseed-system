import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.env.STARSEED_ROOT || path.join(process.env.HOME || "/Users/alex", "Documents", "starseed-os-main");
const OLAS_DIR = path.join(ROOT, "starseed_memory_root", "olas");

export async function GET() {
    try {
        const archivos = await fs.readdir(OLAS_DIR);
        const agentes: any[] = [];
        const olasActivas = new Set<string>();
        let totalEjecutables = 0;
        let totalHechas = 0;
        let totalPendientes = 0;
        let totalBloqueadas = 0;
        const proveedoresVivos = new Set<string>();
        let apinexDisponible = false;

        for (const archivo of archivos) {
            if (!archivo.startsWith("cola-") || !archivo.endsWith(".json")) continue;
            const ruta = path.join(OLAS_DIR, archivo);
            const contenido = await fs.readFile(ruta, "utf-8");
            const datos = JSON.parse(contenido);
            
            const nombreCola = archivo.replace(".json", "");
            const latidoPath = path.join(OLAS_DIR, `latidos-${nombreCola}.json`);
            let latido: any = null;
            try {
                const latidoContent = await fs.readFile(latidoPath, "utf-8");
                latido = JSON.parse(latidoContent);
            } catch { /* sin latido */ }

            for (const tarea of datos) {
                const ola = tarea.ola || "Sin ola";
                olasActivas.add(ola);
                
                // Estado: usar latido si existe, si no usar el campo de la cola
                let estadoReal = tarea.estado || "pendiente";
                let faseReal = "";
                let infoLatido: any = null;
                
                if (latido && latido.tareas && latido.tareas[tarea.id]) {
                    infoLatido = latido.tareas[tarea.id];
                    faseReal = infoLatido.fase || "";
                    
                    // Traducir fases del latido
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
                
                // Contar por estado
                if (estadoReal === "hecho" || estadoReal === "integrado") {
                    totalHechas++;
                } else if (estadoReal === "fallido") {
                    // No contar en ninguna categoría
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

                // Agregar al agente
                const modelo = infoLatido?.modelo || tarea.modelo || "—";
                const proveedor = modelo.split("/")[0] || "—";
                
                // Solo agregar si tiene información relevante
                if (infoLatido || (!latido && tarea.estado === "pendiente")) {
                    proveedoresVivos.add(proveedor);
                    
                    if (proveedor === "apinex") {
                        apinexDisponible = true;
                    }

                    const fase = infoLatido?.fase || tarea.estado || "desconocido";
                    const bytes = infoLatido?.bytes || 0;
                    const desde = infoLatido?.desde || 0;
                    const ahora = Date.now() / 1000;
                    const minutos = Math.max(0, Math.round((ahora - desde) / 60));
                    const avance = infoLatido?.avance || desde;
                    const quietoSegundos = Math.round(ahora - avance);
                    
                    agentes.push({
                        id: tarea.id,
                        nombre: tarea.titulo?.slice(0, 40) || tarea.id,
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
        }
        
        // Ordenar: vivos primero, luego por bytes descendente
        agentes.sort((a, b) => {
            if (a.vivo !== b.vivo) return a.vivo ? -1 : 1;
            return b.bytes - a.bytes;
        });
        
        return NextResponse.json({
            agentes,
            totalColas: archivos.filter(f => f.startsWith("cola-") && f.endsWith(".json")).length,
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
