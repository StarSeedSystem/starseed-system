import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { raizDelProyecto } from "@/lib/mando/raiz";

export type EstadoMedio = "listo" | "usable" | "requiere_alex" | "no_disponible";

export interface MedioComputo {
    id: string;
    nombre: string;
    estado: EstadoMedio;
    capacidad: string;
    detalle: string;
    siguiente_paso: string;
}

export interface ConteoMedios {
    listos: number;
    usables: number;
    porHacer: number;
    agentesAhora: number;
}

export interface ResumenMedios {
    generado?: string;
    medios: MedioComputo[];
    resumen: ConteoMedios;
    error?: string;
}

const execFileAsync = promisify(execFile);
const DURACION_CACHE_MS = 60_000;
let cacheMedios: { resumen: ResumenMedios; expira: number } | null = null;

export function resumirMedios(medios: MedioComputo[]): ConteoMedios {
    let listos = 0;
    let usables = 0;
    let porHacer = 0;
    let agentesAhora = 0;

    for (const m of medios) {
        if (m.estado === "listo") {
            listos++;
        } else if (m.estado === "usable") {
            usables++;
        } else {
            porHacer++;
        }

        if (m.id === "mac" && m.capacidad) {
            const match = m.capacidad.match(/(\d+)\s*agente/i);
            if (match) {
                const n = Number.parseInt(match[1], 10);
                if (Number.isFinite(n)) {
                    agentesAhora = n;
                }
            }
        }
    }

    return { listos, usables, porHacer, agentesAhora };
}

export function leerResumen(textoJson: string): ResumenMedios {
    try {
        const parsed = JSON.parse(textoJson) as Record<string, unknown>;
        if (typeof parsed !== "object" || parsed === null) {
            return {
                medios: [],
                resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
                error: "El JSON recibido no es un objeto válido.",
            };
        }

        const rawMedios = Array.isArray(parsed.medios) ? parsed.medios : [];
        const medios: MedioComputo[] = rawMedios.map((item) => {
            const m = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
            const estadoValido: EstadoMedio =
                m.estado === "listo" || m.estado === "usable" || m.estado === "requiere_alex" || m.estado === "no_disponible"
                    ? (m.estado as EstadoMedio)
                    : "no_disponible";

            return {
                id: String(m.id ?? ""),
                nombre: String(m.nombre ?? ""),
                estado: estadoValido,
                capacidad: String(m.capacidad ?? ""),
                detalle: String(m.detalle ?? ""),
                siguiente_paso: String(m.siguiente_paso ?? ""),
            };
        });

        const generado = typeof parsed.generado === "string" ? parsed.generado : undefined;

        return {
            generado,
            medios,
            resumen: resumirMedios(medios),
        };
    } catch {
        return {
            medios: [],
            resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
            error: "Error al parsear la salida JSON de medios de cómputo.",
        };
    }
}

export async function sondearMedios(opciones: { forzar?: boolean } = {}): Promise<ResumenMedios> {
    const ahora = Date.now();
    if (!opciones.forzar && cacheMedios && ahora < cacheMedios.expira) {
        return cacheMedios.resumen;
    }

    try {
        const { stdout } = await execFileAsync("python3", ["scripts/puente/medios_disponibles.py", "--json"], {
            cwd: raizDelProyecto(),
            timeout: 90_000,
            windowsHide: true,
        });

        const resultado = leerResumen(stdout);
        cacheMedios = { resumen: resultado, expira: Date.now() + DURACION_CACHE_MS };
        return resultado;
    } catch (err) {
        const mensajeError = err instanceof Error ? err.message : String(err);
        return {
            medios: [],
            resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
            error: `Error al sondear medios de cómputo: ${mensajeError}`,
        };
    }
}
