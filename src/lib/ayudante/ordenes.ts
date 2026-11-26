/**
 * Terminal entre neuronas · catálogo de órdenes tipadas (TRM1125J-d1).
 * Contrato: `architecture/terminal-entre-neuronas.md`.
 */

export const COMANDOS_APP = [
    "estado",
    "salud",
    "formatear",
    "montar",
    "desmontar",
    "verificar",
    "actualizar",
    "reiniciar"
] as const;

export type Comando = typeof COMANDOS_APP[number];

export interface OrdenTerminal {
    nombre: Comando;
    args: Record<string, unknown>;
}

export function validarComando(nombre: string): nombre is Comando {
    return COMANDOS_APP.includes(nombre as Comando);
}
