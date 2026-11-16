export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: { motivo: string; linea?: number }[];
}

export function desdeJsonPlano(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: { motivo: string; linea?: number }[] = [];

    let jsonParseado: unknown;
    try {
        jsonParseado = JSON.parse(texto);
    } catch (e) {
        const error = e as Error;
        const indice = error.message.indexOf("at ");
        const linea = indice > 0 ? parseInt(error.message.slice(indice + 3).split(":")[0], 10) : undefined;
        descartadas.push({ motivo: "JSON roto", linea });
        return { entradas, descartadas };
    }

    if (jsonParseado === null || typeof jsonParseado !== "object" || Array.isArray(jsonParseado)) {
        descartadas.push({ motivo: "JSON no es un objeto plano", linea: 1 });
        return { entradas, descartadas };
    }

    const obj = jsonParseado as Record<string, unknown>;
    for (const [clave, valor] of Object.entries(obj)) {
        if (typeof valor !== "string") {
            descartadas.push({ motivo: "Valor no-texto", linea: undefined });
            continue;
        }
        entradas[clave] = valor;
    }

    return { entradas, descartadas };
}

function aplanarJson(json: unknown, prefix = ""): Record<string, string> {
    const resultado: Record<string, string> = {};
    if (json === null || json === undefined) return resultado;
    if (typeof json !== "object" || Array.isArray(json)) return resultado;

    const obj = json as Record<string, unknown>;
    for (const [clave, valor] of Object.entries(obj)) {
        const nuevaClave = prefix ? `${prefix}.${clave}` : clave;
        if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
            Object.assign(resultado, aplanarJson(valor, nuevaClave));
        } else if (typeof valor === "string") {
            resultado[nuevaClave] = valor;
        }
    }
    return resultado;
}

export function desdeJsonAnidado(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: { motivo: string; linea?: number }[] = [];

    let jsonParseado: unknown;
    try {
        jsonParseado = JSON.parse(texto);
    } catch (e) {
        const error = e as Error;
        const indice = error.message.indexOf("at ");
        const linea = indice > 0 ? parseInt(error.message.slice(indice + 3).split(":")[0], 10) : undefined;
        descartadas.push({ motivo: "JSON roto", linea });
        return { entradas, descartadas };
    }

    const plano = aplanarJson(jsonParseado);
    for (const [clave, valor] of Object.entries(plano)) {
        entradas[clave] = valor;
    }

    return { entradas, descartadas };
}

type SeparadorCsv = "," | "\t" | ";";

function parsearCsv(texto: string, separador: SeparadorCsv): string[][] {
    const filas: string[][] = [];
    const actual: string[] = [];
    let campo = "";
    let entreComillas = false;
    let i = 0;

    while (i < texto.length) {
        const c = texto[i];

        if (entreComillas) {
            if (c === '"') {
                if (texto[i + 1] === '"') {
                    campo += '"';
                    i += 2;
                    continue;
                }
                entreComillas = false;
            } else {
                campo += c;
            }
        } else {
            if (c === '"') {
                entreComillas = true;
            } else if (c === separador) {
                actual.push(campo);
                campo = "";
            } else if (c === "\n" || c === "\r") {
                if (c === "\r" && texto[i + 1] === "\n") i++;
                actual.push(campo);
                filas.push(actual);
                actual.length = 0;
                campo = "";
            } else {
                campo += c;
            }
        }
        i++;
    }

    if (campo !== "" || actual.length > 0) {
        actual.push(campo);
        filas.push(actual);
    }

    return filas;
}

export function desdeCsv(texto: string, separador: SeparadorCsv = ","): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: { motivo: string; linea?: number }[] = [];

    const textoSinBom = texto.replace(/^\uFEFF/, "");
    const filas = parsearCsv(textoSinBom, separador);

    if (filas.length === 0) {
        return { entradas, descartadas };
    }

    let indiceCabecera = 0;
    const primeraFila = filas[0];
    if (primeraFila.length === 2 && (primeraFila[0].toLowerCase() === "key" || primeraFila[0].toLowerCase() === "clave")) {
        indiceCabecera = 1;
    }

    if (filas.length <= indiceCabecera) {
        return { entradas, descartadas };
    }

    const claves = filas[indiceCabecera];

    for (let filaIdx = indiceCabecera + 1; filaIdx < filas.length; filaIdx++) {
        const fila = filas[filaIdx];
        if (fila.length !== claves.length) {
            descartadas.push({ motivo: "Número de columnas distinto al encabezado", linea: filaIdx + 1 });
            continue;
        }

        const clave = fila[0];
        const valor = fila[1] ?? "";

        if (typeof clave !== "string" || clave === "") {
            descartadas.push({ motivo: "Clave vacía", linea: filaIdx + 1 });
            continue;
        }

        entradas[clave] = valor;
    }

    return { entradas, descartadas };
}