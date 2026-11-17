/**
 * IMA9 · Importación de archivos de localización (XLIFF, .strings de Apple, strings.xml de Android).
 * Módulo PURO: sin red, sin disco, sin procesos. Analizador mínimo por expresiones regulares con límites de tamaño.
 */

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: Array<{ clave: string; motivo: string }>;
    avisos: string[];
}

const LIMITE_TEXTO = 5_000_000;
const LIMITE_ENTRADAS = 50_000;

function decodificarEntidadesXml(texto: string): string {
    return texto
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&/g, "&");
}

function tieneEtiquetas(texto: string): boolean {
    return /<[a-zA-Z]/.test(texto);
}

function descartarConMotivo(
    resultado: ResultadoImportacion,
    clave: string,
    motivo: string
): void {
    resultado.descartadas.push({ clave, motivo });
}

export function desdeXliff(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [], avisos: [] };

    if (texto.length > LIMITE_TEXTO) {
        resultado.avisos.push("Texto supera el límite de tamaño; se procesa lo posible");
    }

    const textoProcesado = texto.slice(0, LIMITE_TEXTO);

    // XLIFF 1.2: buscar trans-unit de forma simple
    const transUnits = textoProcesado.match(/<trans-unit[\s\S]*?<\/trans-unit>/gi) || [];
    for (const unit of transUnits) {
        if (Object.keys(resultado.entradas).length >= LIMITE_ENTRADAS) break;

        const idMatch = unit.match(/(?:id|resname)\s*=\s*["']([^"']+)["']/i);
        if (!idMatch) continue;
        const clave = idMatch[1];

        const sourceMatch = unit.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
        const targetMatch = unit.match(/<target[^>]*>([\s\S]*?)<\/target>/i);

        if (sourceMatch && targetMatch) {
            const source = decodificarEntidadesXml(sourceMatch[1].trim());
            const target = decodificarEntidadesXml(targetMatch[1].trim());

            if (source && target) {
                if (tieneEtiquetas(target)) {
                    descartarConMotivo(resultado, clave, "El valor contiene etiquetas XML");
                } else {
                    resultado.entradas[clave] = target;
                }
            }
        }
    }

    // XLIFF 2.0: <unit id="..."><segment><source>...</source><target>...</target></segment></unit>
    const units = textoProcesado.match(/<unit[\s\S]*?<\/unit>/gi) || [];
    for (const unit of units) {
        if (Object.keys(resultado.entradas).length >= LIMITE_ENTRADAS) break;

        const idMatch = unit.match(/id\s*=\s*["']([^"']+)["']/i);
        if (!idMatch) continue;
        const clave = idMatch[1];

        const segmentMatch = unit.match(/<segment[^>]*>([\s\S]*?)<\/segment>/i);
        if (!segmentMatch) continue;

        const segmentContent = segmentMatch[1];
        const sourceMatch = segmentContent.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
        const targetMatch = segmentContent.match(/<target[^>]*>([\s\S]*?)<\/target>/i);

        if (sourceMatch && targetMatch) {
            const source = decodificarEntidadesXml(sourceMatch[1].trim());
            const target = decodificarEntidadesXml(targetMatch[1].trim());

            if (source && target) {
                if (tieneEtiquetas(target)) {
                    descartarConMotivo(resultado, clave, "El valor contiene etiquetas XML");
                } else {
                    resultado.entradas[clave] = target;
                }
            }
        }
    }

    return resultado;
}

export function desdeStringsApple(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [], avisos: [] };

    if (texto.length > LIMITE_TEXTO) {
        resultado.avisos.push("Texto supera el límite de tamaño; se procesa lo posible");
    }

    const textoProcesado = texto.slice(0, LIMITE_TEXTO);

    // Eliminar comentarios /* ... */ y //
    let sinComentarios = textoProcesado.replace(/\/\*[\s\S]*?\*\//g, "");
    sinComentarios = sinComentarios.replace(/\/\/.*$/gm, "");

    // Patrón: "clave" = "valor";
    const regexEntrada = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
    let match: RegExpExecArray | null;

    while ((match = regexEntrada.exec(sinComentarios)) !== null && Object.keys(resultado.entradas).length < LIMITE_ENTRADAS) {
        let clave = match[1];
        let valor = match[2];

        // Decodificar escapes Unicode \uXXXX
        const decodificarUnicode = (s: string): string => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

        clave = decodificarUnicode(clave);
        valor = decodificarUnicode(valor);

        // Decodificar entidades XML
        clave = decodificarEntidadesXml(clave);
        valor = decodificarEntidadesXml(valor);

        // Decodificar escapes comunes (orden importa: Unicode ya hecho)
        valor = valor
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r")
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");

        // Clave: solo quitar escapes de comillas y barra
        clave = clave
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");

        if (tieneEtiquetas(valor)) {
            descartarConMotivo(resultado, clave, "El valor contiene etiquetas XML");
        } else {
            resultado.entradas[clave] = valor;
        }
    }

    return resultado;
}

export function desdeStringsAndroid(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [], avisos: [] };

    if (texto.length > LIMITE_TEXTO) {
        resultado.avisos.push("Texto supera el límite de tamaño; se procesa lo posible");
    }

    const textoProcesado = texto.slice(0, LIMITE_TEXTO);

    // Patrón: <string name="clave" translatable="false">valor</string> o <string name="clave">valor</string>
    const regexString = /<string\s+([^>]*)>([\s\S]*?)<\/string>/gi;
    let match: RegExpExecArray | null;

    while ((match = regexString.exec(textoProcesado)) !== null && Object.keys(resultado.entradas).length < LIMITE_ENTRADAS) {
        const attrs = match[1];
        const valorBruto = match[2];

        const nameMatch = /name\s*=\s*["']([^"']+)["']/.exec(attrs);
        const translatableMatch = /translatable\s*=\s*["']false["']/.exec(attrs);

        if (!nameMatch) {
            continue;
        }

        if (translatableMatch) {
            resultado.avisos.push(`Clave "${nameMatch[1]}" marcada como no traducible; se ignora`);
            continue;
        }

        const clave = nameMatch[1];
        let valor = decodificarEntidadesXml(valorBruto);

        // Convertir escapes y placeholders
        valor = valor
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r")
            .replace(/\\\\/g, "\\")
            .replace(/%1\$s/g, "{0}")
            .replace(/%2\$s/g, "{1}")
            .replace(/%3\$s/g, "{2}")
            .replace(/%\d\$s/g, "{0}")
            .replace(/%s/g, "{0}");

        if (tieneEtiquetas(valor)) {
            descartarConMotivo(resultado, clave, "El valor contiene etiquetas XML");
        } else {
            resultado.entradas[clave] = valor;
        }
    }

    return resultado;
}