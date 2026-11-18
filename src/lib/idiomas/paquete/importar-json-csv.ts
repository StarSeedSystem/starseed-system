/**
 * IMA7-d1 · Importación de paquetes de idiomas desde JSON plano, JSON anidado y CSV/TSV.
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: Array<{ motivo: string; linea?: number }>;
}

const CABECERAS_VALIDAS = ["key", "clave", "source", "clave,traducción", "key,value", "source,target"];

function limpiarBom(texto: string): string {
    return texto.startsWith("\uFEFF") ? texto.slice(1) : texto;
}

function esCabecera(primeraLinea: string, separador: string): boolean {
    const partes = primeraLinea.split(separador).map(p => p.trim().toLowerCase());
    if (partes.length !== 2) return false;
    return CABECERAS_VALIDAS.some(h => h.toLowerCase() === partes.join(separador).toLowerCase() ||
        partes[0] === "key" || partes[0] === "clave" || partes[0] === "source");
}

function parseJsonSeguro(texto: string): { valor: unknown; error?: string } {
    try {
        return { valor: JSON.parse(texto) };
    } catch (e) {
        return { valor: null, error: e instanceof Error ? e.message : "Error de sintaxis JSON" };
    }
}

function aplanarObjeto(obj: Record<string, unknown>, prefijo = ""): Array<{ clave: string; valor: unknown }> {
    const resultado: Array<{ clave: string; valor: unknown }> = [];

    for (const [k, v] of Object.entries(obj)) {
        const nuevaClave = prefijo ? `${prefijo}.${k}` : k;

        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            resultado.push(...aplanarObjeto(v as Record<string, unknown>, nuevaClave));
        } else {
            resultado.push({ clave: nuevaClave, valor: v });
        }
    }

    return resultado;
}

export function desdeJsonPlano(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [] };
    const limpio = limpiarBom(texto.trim());

    if (!limpio) {
        return resultado;
    }

    const { valor, error } = parseJsonSeguro(limpio);
    if (error || valor === null || typeof valor !== "object" || Array.isArray(valor)) {
        resultado.descartadas.push({ motivo: error || "No es un objeto JSON válido" });
        return resultado;
    }

    const obj = valor as Record<string, unknown>;

    for (const [clave, valorEntrada] of Object.entries(obj)) {
        if (typeof valorEntrada === "string") {
            resultado.entradas[clave] = valorEntrada;
        } else {
            resultado.descartadas.push({ motivo: `Valor no es texto: ${typeof valorEntrada}` });
        }
    }

    return resultado;
}

export function desdeJsonAnidado(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [] };
    const limpio = limpiarBom(texto.trim());

    if (!limpio) {
        return resultado;
    }

    const { valor, error } = parseJsonSeguro(limpio);
    if (error || valor === null || typeof valor !== "object" || Array.isArray(valor)) {
        resultado.descartadas.push({ motivo: error || "No es un objeto JSON válido" });
        return resultado;
    }

    const aplanado = aplanarObjeto(valor as Record<string, unknown>);

    for (const { clave, valor: valorEntrada } of aplanado) {
        if (typeof valorEntrada === "string") {
            resultado.entradas[clave] = valorEntrada;
        } else {
            resultado.descartadas.push({ motivo: `Valor no es texto en ${clave}: ${typeof valorEntrada}` });
        }
    }

    return resultado;
}

function parseCsv(texto: string, separador: string): Array<{ columnas: string[]; lineaInicio: number; lineaFin: number }> {
    const filas: Array<{ columnas: string[]; lineaInicio: number; lineaFin: number }> = [];
    let actual: string[] = [];
    let campoActual = "";
    let enComillas = false;
    let lineaActual = 1;
    let lineaInicio = 1;

    for (let i = 0; i < texto.length; i++) {
        const char = texto[i];
        const siguiente = texto[i + 1];

        if (char === '"') {
            if (enComillas) {
                if (siguiente === '"') {
                    campoActual += '"';
                    i++;
                    const despues = texto[i + 1];
                    if (despues === separador || despues === "\n" || despues === "\r" || despues === undefined) {
                        enComillas = false;
                    }
                } else if (siguiente === '\\') {
                    campoActual += '"';
                    i++;
                } else if (siguiente === separador || siguiente === "\n" || siguiente === "\r" || siguiente === undefined) {
                    enComillas = false;
                } else {
                    campoActual += '"';
                }
            } else {
                enComillas = true;
            }
        } else if (char === separador && !enComillas) {
            actual.push(campoActual);
            campoActual = "";
        } else if ((char === "\n" || (char === "\r" && siguiente !== "\n")) && !enComillas) {
            actual.push(campoActual);
            filas.push({ columnas: actual, lineaInicio, lineaFin: lineaActual });
            actual = [];
            campoActual = "";
            lineaActual++;
            lineaInicio = lineaActual;
            if (char === "\r" && siguiente === "\n") i++;
        } else if (char === "\r" && siguiente === "\n" && !enComillas) {
            actual.push(campoActual);
            filas.push({ columnas: actual, lineaInicio, lineaFin: lineaActual });
            actual = [];
            campoActual = "";
            lineaActual++;
            lineaInicio = lineaActual;
            i++;
        } else {
            campoActual += char;
        }
    }

    if (campoActual || actual.length > 0) {
        actual.push(campoActual);
        filas.push({ columnas: actual, lineaInicio, lineaFin: lineaActual });
    }

    return filas;
}

function filaVacia(columnas: string[]): boolean {
    return columnas.every(c => c.trim() === "");
}

export function desdeCsv(texto: string, separador: "," | "\t" | ";"): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [] };
    const limpio = limpiarBom(texto);

    if (!limpio.trim()) {
        return resultado;
    }

    const filas = parseCsv(limpio, separador);
    let indiceInicio = 0;

    if (filas.length > 0 && esCabecera(filas[0].columnas.join(separador), separador)) {
        indiceInicio = 1;
    }

    for (let i = indiceInicio; i < filas.length; i++) {
        const fila = filas[i];

        if (filaVacia(fila.columnas)) {
            continue;
        }

        const columnas = fila.columnas.map(c => c.trim());

        if (columnas.length < 2) {
            resultado.descartadas.push({ motivo: "Número insuficiente de columnas", linea: fila.lineaInicio });
            continue;
        }

        const [clave, valor] = columnas;
        if (clave && valor && typeof valor === "string") {
            resultado.entradas[clave] = valor;
        } else if (!clave) {
            resultado.descartadas.push({ motivo: "clave vacía", linea: fila.lineaInicio });
        } else if (!valor) {
            resultado.descartadas.push({ motivo: "valor vacío", linea: fila.lineaInicio });
        }
    }

    return resultado;
}