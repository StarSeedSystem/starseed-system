// Tablero del pilar «Procesos activos»: filtros por tipo, cuentas reales y
// acciones existentes. Módulo puro, sin red ni disco.
// Contrato: architecture/cerebros-fusion-telepatia.md §7.

import {
    ETIQUETA_TIPO,
    type EstadoProceso,
    type ProcesoActivo,
    type TipoProceso,
} from "./procesos";

/** Estado en palabras, con acentos. */
export const ETIQUETA_ESTADO: Record<EstadoProceso, string> = {
    "en-marcha": "en marcha",
    esperando: "esperando",
    pausado: "pausado",
    fallando: "fallando",
};

export function textoEstado(estado: EstadoProceso): string {
    return ETIQUETA_ESTADO[estado];
}

/** Tipos con filtro: los visibles de las preferencias; sin preferencias, todos. */
export function tiposFiltro(tiposPrefs: TipoProceso[]): TipoProceso[] {
    if (tiposPrefs.length > 0) {
        return tiposPrefs.filter((t) => ETIQUETA_TIPO[t] !== undefined);
    }
    return Object.keys(ETIQUETA_TIPO) as TipoProceso[];
}

export interface CuentaTipo {
    tipo: TipoProceso;
    etiqueta: string;
    cuenta: number;
}

/** Cuentas reales por tipo, una por tipo filtrable (bases de unos: cuenta 0). */
export function cuentasPorTipo(procesos: ProcesoActivo[], tiposPrefs: TipoProceso[]): CuentaTipo[] {
    const cuentas: Partial<Record<TipoProceso, number>> = {};
    for (const p of procesos) {
        cuentas[p.tipo] = (cuentas[p.tipo] ?? 0) + 1;
    }
    return tiposFiltro(tiposPrefs).map((tipo) => ({
        tipo,
        etiqueta: ETIQUETA_TIPO[tipo],
        cuenta: cuentas[tipo] ?? 0,
    }));
}

/** Lista cortada por el filtro pulsable (null = todos). */
export function filtrarPorTipo(procesos: ProcesoActivo[], filtro: TipoProceso | null): ProcesoActivo[] {
    return filtro === null ? procesos : procesos.filter((p) => p.tipo === filtro);
}

/** Ventana minimizada de `readDesktopsSnapshot()` con id `ventana:<escritorio>:<ventana>`. */
export function ventanaAppFondo(p: ProcesoActivo): { escritorio: string; ventana: string } | null {
    if (p.tipo !== "app-fondo") return null;
    const partes = p.id.split(":");
    if (partes.length < 3 || partes[0] !== "ventana") return null;
    const ventana = partes.slice(2).join(":");
    return ventana ? { escritorio: partes[1], ventana } : null;
}
