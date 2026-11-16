/**
 * IMA7 · Importar JSON plano, JSON anidado y CSV/TSV a formato de paquete de idioma.
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: { motivo: string; linea?: number }[];
}

function esValorTexto(valor: unknown): valor es string {
    return typeof valor === "string";
}

function desdeJsonPlano(texto: string): ResultadoImportacion {
    let obj: unknown;
    try {
        obj = JSON.parse(texto);
    } catch {
        return { entradas: {}, descartadas: [{ motivo: "JSON inválido" }] };
    }

    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
        return { entradas: {}, descartadas: [{ motivo: "JSON no es un objeto" }] };
    }

    const entradas: Record<string, string> = {};
    const descartadas: { motivo: string; linea?: number }[] = [];

    const entries = obj as Record<string, unknown>;
    for (const [clave, valor] of Object.entries(entries)) {
        if (esValorTexto(valor)) {
            entradas[clave] = valor;
        } else {
            descartadas.push({ motivo: "valor no es texto" });
        }
    }

    return { entradas, descartadas };
}

function aplanarParaClaves(
    obj: Record<string, unknown>,
    prefijo: string = ""
): Record<string, string> {
    const resultado: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(obj)) {
        const nombre = prefijo ? `${prefijo}.${clave}` : clave;
        if (esValorTexto(valor)) {
            resultado[nombre] = valor;
        } else if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
            Object.assign(resultado, aplanarParaClaves(valor as Record<string, unknown>, nombre));
        }
        // valores no-texto que no son objeto: se descartan (no incluimos)
    }
    return resultado;
}

function desdeJsonAnidado(texto: string): ResultadoImportacion {
    let obj: unknown;
    try {
        obj = JSON.parse(texto);
    } catch {
        return { entradas: {}, descartadas: [{ motivo: "JSON inválido" }] };
    }

    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
        return { entradas: {}, descartadas: [{ motivo: "JSON no es un objeto" }] };
    }

    const aplanado = aplanarParaClaves(obj as Record<string, unknown>);
    const entradas: Record<string, string> = {};
    const descartadas: { motivo: string; linea?: number }[] = [];

    for (const [clave, valor] of Object.entries(aplanado)) {
        entradas[clave] = valor;
    }

    return { entradas, descartadas };
}

function parsearFilasCSV(
    texto: string,
    separador: string
): { cabeceras: string[]; filas: string[][]; numeroLineaInicial: number } {
    const lineas = texto.split("\n");
    const filas: string[][] = [];
    let numeroLineaInicial = 0;

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (linea === "") continue;

        // Manejo simple: dividir por separador, respetando comillas dobles
        const campos: string[] = [];
        let campoActual = "";
        let enComilla = false;

        for (let j = 0; j < linea.length; j++) {
            const char = linea[j];
            if (char === '"') {
                enComilla = !enComilla;
                campoActual += char;
            } else if (char === separador && !enComilla) {
                campos.push(campoActual);
                campoActual = "";
            } else {
                campoActual += char;
            }
        }
        campos.push(campoActual);

        if (filas.length === 0) {
            numeroLineaInicial = i + 1;
        }
        filas.push(campos);
    }

    const cabeceras = filas[0] || [];
    return { cabeceras, filas: filas.slice(1), numeroLineaInicial };
}

function desdeCsv(texto: string, separador: "," | "\t" | ";"): ResultadoImportacion;
function desdeCsv(
    texto: string,
    separador: ","
): ResultadoImportacion;
function desdeCsv(
    texto: string,
    separador: "\t"
): ResultadoImportacion;
function desdeCsv(
    texto: string,
    separador: ";"
): ResultadoImportacion;
function desdeCsv(
    texto: string,
    separador: "," | "\t" | ";"
): ResultadoImportacion {
    const { cabeceras, filas } = parsearFilasCSV(texto, separador);
    const entradas: Record<string, string> = {};
    const descartadas: { motivo: string; linea?: number }[] = [];

    // Detectar si la primera fila es cabecera (dice "key/clave/source")
    const esCabecera = (fila: string[]) =>
        fila.some((c) => c.toLowerCase().includes("key") || c.toLowerCase().includes("clave") || c.toLowerCase().includes("source"));

    const datosFilas = esCabecera(cabeceras) ? filas : [cabeceras, ...filas];

    let numeroLinea = 0;
    for (const fila of datosFilas) {
        numeroLinea++;
        if (fila.length < 2) {
            descartadas.push({ motivo: "fila con menos de 2 columnas" });
            continue;
        }

        const clave = limpiar(fila[0]).trim();
        const traduccion = limpiar(fila[1]).trim();

        if (!clave) {
            descartadas.push({ motivo: "clave vacía", linea: numeroLinea });
            continue;
        }

        if (!esValorTexto(traduccion)) {
            // La traducción parseada del CSV siempre será string si pasamos el trim,
            // pero si está vacía la descartamos
            if (traduccion === "") {
                descartadas.push({ motivo: "traducción vacía", linea: numeroLinea });
                continue;
            }
        }

        entradas[clave] = traduccion;
    }

    return { entradas, descartadas };
}