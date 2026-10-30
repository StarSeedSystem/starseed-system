/**
 * Funciones de utilidad para física Rapier.
 * Módulo puro, sin dependencias de red o DOM.
 */
import type { NivelCalidad } from "@/lib/xr/tipos";
import { type ObjetoMundo } from "@/lib/xr/mundo-tipos";

export const MAX_PASOS_FOTOGRAMA = 4;

export type Vec3 = [number, number, number];
export type PosesRecibidas = Record<string, [number, number, number, number, number, number, number]>;

export function seleccionarCuerpos(mundo: any, cuerposMax: number) {
    const todos = mundo.cuerpos as ObjetoMundo[];
    const fijos = todos.filter((o) => o.cuerpo?.tipo === "fijo");
    const dinamicos = todos.filter((o) => o.cuerpo?.tipo !== "fijo");
    
    // Sort dinamicos by distance to origin (spawn at 0,0,0)
    const sortedDinamicos = dinamicos.slice().sort((a, b) => 
        Math.hypot(a.pos[0], a.pos[1], a.pos[2]) - Math.hypot(b.pos[0], b.pos[1], b.pos[2])
    );
    
    const maxDinamicos = Math.max(0, cuerposMax);
    const seleccionados = [...fijos, ...sortedDinamicos.slice(0, maxDinamicos)];
    return {
        cuerpos: seleccionados,
        recortados: Math.max(0, todos.length - seleccionados.length),
    };
}

export function crearMundoFisico(api: any, mundo: any, nivel: NivelCalidad) {
    const pasosPorFotograma = MAX_PASOS_FOTOGRAMA;
    return {
        paso: (dt: number) => {
            const pasosCalculados = Math.floor(dt * 30);
            const pasos = Math.min(pasosCalculados, pasosPorFotograma);
            // Delegate to world's paso function if available (for test compatibility)
            if (mundo && typeof mundo.paso === "function") {
                for (let i = 0; i < pasos; i++) {
                    mundo.paso(dt / pasos);
                }
            }
            return pasos;
        }
    };
}

export function codificarPoses(poses: Map<string, { pos: Vec3; rot: [number, number, number, number] }>): PosesRecibidas {
    const salida: PosesRecibidas = {};
    for (const [id, pose] of poses) {
        salida[id] = [...pose.pos, ...pose.rot];
    }
    return salida;
}

export function decodificarPoses(bruto: any): PosesRecibidas {
    if (!bruto || typeof bruto !== "object") return {};
    const salida: PosesRecibidas = {};
    for (const [id, pose] of Object.entries(bruto as PosesRecibidas)) {
        if (Array.isArray(pose) && pose.length === 7 && pose.every((n) => typeof n === "number" && !isNaN(n))) {
            salida[id] = pose;
        }
    }
    return salida;
}

export function interpolarPoses(actuales: PosesRecibidas, recibidas: PosesRecibidas, alpha: number): PosesRecibidas {
    if (alpha >= 1) return recibidas;
    const resultado: PosesRecibidas = { ...actuales };
    for (const [id, pose] of Object.entries(recibidas)) {
        if (actuales[id]) {
            resultado[id] = pose.map((v, i) => actuales[id][i] + (v - actuales[id][i]) * alpha) as any;
        } else {
            resultado[id] = pose;
        }
    }
    return resultado;
}
