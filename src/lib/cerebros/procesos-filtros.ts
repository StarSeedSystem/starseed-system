// Filtros y ayudas del pilar «Procesos activos» (CB1013N). Módulo puro, sin
// disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7.

import { ETIQUETA_TIPO, type EstadoProceso, type TipoProceso } from "./procesos";

export const ETIQUETA_ESTADO: Record<EstadoProceso, string> = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
};

export const NOMBRE_MEDIDA: Record<"cpu" | "ram" | "disco" | "bateria", string> = {
    cpu: "CPU",
    ram: "RAM",
    disco: "Disco",
    bateria: "Batería",
};

export function tiposVisibles(seleccionados: TipoProceso[]): TipoProceso[] {
    const ordenSistema = Object.keys(ETIQUETA_TIPO) as TipoProceso[];
    if (!Array.isArray(seleccionados) || seleccionados.length === 0) return ordenSistema;
    // Los ajustes dejan tipos vacío por defecto (todos visibles); al elegir, solo esos,
    // en el orden del sistema y descartando valores que no sean tipos del sistema.
    const elegidos = new Set<unknown>(seleccionados);
    return ordenSistema.filter((t) => elegidos.has(t));
}

export function escritorioYVentana(
    id: string,
): { escritorio: string; ventana: string } | null {
    if (typeof id !== "string" || !id.startsWith("ventana:")) return null;
    const partes = id.slice("ventana:".length).split(":");
    if (partes.length < 2) return null;
    const ventana = partes.pop() ?? "";
    const escritorio = partes.join(":");
    if (escritorio === "" || ventana === "") return null;
    return { escritorio, ventana };
}
