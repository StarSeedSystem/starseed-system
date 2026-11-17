export interface EntradaDescartada {
    motivo: string;
    linea?: number;
}

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: EntradaDescartada[];
}

export function desdeJsonPlano(_texto: string): ResultadoImportacion {
    return { entradas: {}, descartadas: [] };
}

export function desdeJsonAnidado(_texto: string): ResultadoImportacion {
    return { entradas: {}, descartadas: [] };
}

export function desdeCsv(_texto: string, _separador: "," | "\t" | ";" = ","): ResultadoImportacion {
    return { entradas: {}, descartadas: [] };
}
