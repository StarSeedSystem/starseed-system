import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { guardianMando } from "@/lib/mando/guardian";

const ROOT = process.env.STARSEED_ROOT || path.join(process.env.HOME || "/Users/alex", "Documents", "starseed-os-main");
const OLAS_DIR = path.join(ROOT, "starseed_memory_root", "olas");

export async function GET(peticion: Request) {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
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
            
            const latido = await leerLatidos(path.join(OLAS_DIR, `latidos-${archivo.replace(".json", "")}`));
            const idsHechas = new Set<string>();
            
            for (const tarea of datos) {
                const estado = tarea.estado || "pendiente";
                const ola = tarea.ola || "Sin ola";
                
                if (estado === "hecho" || estado === "integrado") {
                    idsHechas.add(tarea.id);
                    totalHechas++;
                } else if (tarea.aprobacion) {
                    totalPendientes++;
                } else {
                    const deps = tarea.depende || [];
                    const depsPendientes = deps.filter((d: string) => 
                        !idsHechas.has(d) && datos.some((t: any) => t.id === d)
                    );
                    if (depsPendientes.length > 0) {
                        totalBloqueadas++;
                    } else {
                        totalEjecutables++;
                    }
                }
                
                olasActivas.add(ola);
            }
            
            if (latido && latido.tareas) {
                const ahora = Date.now() / 1000;
                for (const [tareaId, info] of Object.entries<any>(latido.tareas)) {
                    const modelo = info.modelo || "—";
                    const proveedor = modelo.split("/")[0] || "—";
                    proveedoresVivos.add(proveedor);
                    
                    if (proveedor === "apinex") {
                        apinexDisponible = true;
                    }
                    
                    const tareaInfo = datos.find((t: any) => t.id === tareaId);
                    const fase = info.fase || "desconocido";
                    const bytes = info.bytes || 0;
                    const desde = info.desde || 0;
                    const minutos = Math.max(0, Math.round((ahora - desde) / 60));
                    const avance = info.avance || desde;
                    const quietoSegundos = Math.round(ahora - avance);
                    
                    agentes.push({
                        id: tareaId,
                        nombre: tareaInfo?.titulo?.slice(0, 40) || tareaId,
                        fase,
                        modelo,
                        proveedor,
                        ola: latido.cola || "—",
                        tarea: tareaInfo?.titulo || "—",
                        bytes,
                        minutos,
                        intento: info.intento || 1,
                        quietoSegundos,
                        rpm: 0,
                        vivo: fase !== "hecho" && fase !== "fallido",
                        commits: 0,
                        verificaciones: 0,
                        mcpConectados: 0,
                        pluginsActivos: 0,
                    });
                }
            }
        }
        
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
            { error: "Error leyendo el director" },
            { status: 500 }
        );
    }
}

async function leerLatidos(ruta: string) {
    try {
        const contenido = await fs.readFile(ruta, "utf-8");
        return JSON.parse(contenido);
    } catch {
        return null;
    }
}
