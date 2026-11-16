/**
 * IMA8 · Importador de paquetes de idioma .po y .properties (A2).
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

export interface ImportPoResult {
    entradas: Record<string, string>;
    descartadas: string[];
    avisos: string[];
}

export interface ImportPropertiesResult {
    entradas: Record<string, string>;
    descartadas: string[];
    avisos: string[];
}

/**
 * Extrae strings entre comillas dobles de una línea.
 * Retorna el contenido entre la primera pareja de comillas encontradas.
 */
function extraerStringEntreComillas(linea: string): string | null {
    const inicio = linea.indexOf('"');
    if (inicio === -1) return null;
    const fin = linea.indexOf('"', inicio + 1);
    if (fin === -1) return null;
    const contenido = linea.substring(inicio + 1, fin);
    // Reemplazar escapes comunes
    return contenido
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

/**
 * Parsea el contenido de un archivo .po y devuelve { entradas, descartadas, avisos }.
 *
 * - Ignora la cabecera `msgid ""`.
 * - Ignora bloques con `fuzzy`, añadiendo aviso.
 * - Descarta `msgstr` vacío.
 * - Soporta `msgctxt`: clave devuelta como `contexto|texto`.
 * - Soporta plurales `msgid_plural`/`msgstr[n]`: usa la forma [0] y anota aviso "plural simplificado".
 * - Soporta multilínea con comillas y escapes `\n` `\\"`.
 */
export function desdePo(texto: string): ImportPoResult {
    const entradas: Record<string, string> = {};
    const descartadas: string[] = [];
    const avisos: string[] = [];

    const lineas = texto.split("\n");
    let i = 0;

    while (i < lineas.length) {
        const linea = lineas[i].trim();

        // Saltar comentarios y líneas vacías
        if (linea === "" || linea.startsWith("#") || linea.startsWith("!")) {
            i++;
            continue;
        }

        // Saltar cabecera msgid ""
        if (linea === 'msgid ""') {
            i++;
            // Consumir hasta encontrar línea vacía o nuevo bloque
            while (i < lineas.length && lineas[i].trim() !== "" && !lineas[i].trim().startsWith("msgid ") && !lineas[i].trim().startsWith("msgctxt ") && !lineas[i].trim().startsWith("msgid_plural ")) {
                i++;
            }
            continue;
        }

        // Intentar parsear un bloque que empiece con msgid, msgctxt o msgid_plural
        let contexto: string | undefined;
        let msgidPrincipal: string | null = null;
        let msgstrPrincipal: string | null = null;
        let msgstrFormas: Map<number, string> = new Map();
        let fuzzy = false;
        let plural = false;

        // Determinar tipo de bloque
        if (linea.startsWith("msgctxt ")) {
            // Bloque con contexto
            const match = linea.match(/msgctxt "([^"]*)"/);
            if (match) {
                contexto = match[1];
            }
            i++;
            // El siguiente line debe ser msgid
            if (i < lineas.length) {
                const siguiente = lineas[i].trim();
                if (siguiente.startsWith('msgid "')) {
                    msgidPrincipal = extraerStringEntreComillas(siguiente);
                }
            }
        } else if (linea.startsWith("msgid_plural ")) {
            // Bloque plural
            plural = true;
            const match = linea.match(/msgid_plural "([^"]*)"/);
            if (match) {
                msgidPrincipal = match[1];
            }
            i++;
            // Consumir msgstr[0], msgstr[1], etc.
            while (i < lineas.length) {
                const pline = lineas[i].trim();
                if (pline.startsWith('msgstr[')) {
                    const idxMatch = pline.match(/msgstr\[(\d+)\]/);
                    const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;
                    const strMatch = pline.match(/"(.*)"/);
                    if (strMatch) {
                        msgstrFormas.set(idx, strMatch[1]);
                    }
                    i++;
                } else if (pline === "fuzzy") {
                    fuzzy = true;
                    i++;
                    break;
                } else if (pline === "") {
                    break;
                } else {
                    // msgstr sin número [n]
                    const strMatch = pline.match(/"(.*)"/);
                    if (strMatch) {
                        msgstrFormas.set(0, strMatch[1]);
                    }
                    i++;
                }
            }
            // Asegurar que existe la forma [0]
            if (!msgstrFormas.has(0)) {
                msgstrFormas.set(0, "");
            }
        } else {
            // Bloque msgid normal
            if (linea.startsWith('msgid "')) {
                msgidPrincipal = extraerStringEntreComillas(linea);
            }
            i++;
        }

        // Ahora buscar el msgstr correspondiente
        // Para bloques normales y de contexto, buscar líneas siguientes
        // Para bloques plurales, ya se consumieron arriba

        if (!plural && msgidPrincipal !== null) {
            // Buscar msgstr en líneas siguientes
            while (i < lineas.length) {
                const sl = lineas[i].trim();

                if (sl === "fuzzy") {
                    fuzzy = true;
                    i++;
                    break;
                }

                if (sl.startsWith('msgstr[')) {
                    const idxMatch = sl.match(/msgstr\[(\d+)\]/);
                    const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;
                    const strMatch = sl.match(/"(.*)"/);
                    if (strMatch) {
                        msgstrFormas.set(idx, strMatch[1]);
                    }
                    i++;
                } else if (sl.startsWith('msgstr "')) {
                    const strMatch = sl.match(/"(.*)"/);
                    if (strMatch) {
                        msgstrFormas.set(0, strMatch[1]);
                    }
                    i++;
                } else if (sl === 'msgstr "")') {
                    // msgstr vacío explícito
                    msgstrFormas.set(0, "");
                    i++;
                } else if (sl.startsWith("#") || sl.startsWith("!")) {
                    // Comentario dentro del bloque
                    i++;
                    break;
                } else if (sl === "") {
                    // Fin del bloque
                    break;
                } else {
                    i++;
                }
            }
        }

        // Procesar resultados
        if (fuzzy) {
            avisos.push("fuzzy");
            if (msgidPrincipal) {
                descartadas.push(msgidPrincipal);
            }
            continue;
        }

        if (msgidPrincipal === null) {
            continue;
        }

        // Determinar qué msgstr usar
        let valor: string | null = null;

        if (plural) {
            // Usar forma [0] para plurales
            const forma0 = msgstrFormas.get(0) || "";
            valor = forma0;
            if (msgstrFormas.size > 1) {
                avisos.push("plural simplificado");
            }
        } else if (msgstrFormas.has(0)) {
            valor = msgstrFormas.get(0) || null;
        }

        if (valor === null || valor === "") {
            // msgstr vacío o ausente -> descartar
            descartadas.push(msgidPrincipal);
            continue;
        }

        // Añadir entrada
        if (contexto) {
            const clave = `${contexto}|${msgidPrincipal}`;
            entradas[clave] = valor;
        } else {
            entradas[msgidPrincipal] = valor;
        }
    }

    return { entradas, descartadas, avisos };
}

/**
 * Parsea el contenido de un archivo .properties y devuelve { entradas, descartadas, avisos }.
 *
 * - Soporta `clave=valor` y `clave:valor`.
 * - Ignora comentarios con `#` y `!`.
 * - Soporta continuaciones con `\`.
 * - Soporta escapes `\uXXXX`.
 */
export function desdeProperties(texto: string): ImportPoResult {
    const entradas: Record<string, string> = {};
    const descartadas: string[] = [];
    const avisos: string[] = [];

    const lineas = texto.split("\n");
    let i = 0;

    while (i < lineas.length) {
        let linea = lineas[i];

        // Eliminar comentarios (# o ! al inicio, hasta fin de línea)
        const comentarioIdx = linea.search(/[#!]/);
        if (comentarioIdx >= 0) {
            linea = linea.substring(0, comentarioIdx);
        }

        linea = linea.trim();

        // Saltar líneas vacías
        if (linea === "") {
            i++;
            continue;
        }

        // Unir continuaciones con \
        if (linea.endsWith("\\") && linea.length > 1) {
            // Esta línea continúa en la siguiente
            let valorContinuacion = linea.slice(0, -1); // quitar el \
            let continuacionProcesada = false;
            let j = i + 1;
            while (j < lineas.length) {
                const sig = lineas[j].trim();
                // Si la siguiente línea es comentario o vacía, detener
                if (sig === "" || sig.startsWith("#") || sig.startsWith("!")) {
                    break;
                }
                // Quitar possible \ al inicio de la siguente (si continuaba ella también)
                valorContinuacion += sig;
                continuacionProcesada = true;
                j++;
                // Si la siguiente línea no termina con \, terminamos
                if (!sig.endsWith("\\") || sig.length <= 1) {
                    break;
                }
            }
            if (!continuacionProcesada) {
                i++;
                continue;
            }
            linea = valorContinuacion;
        }

        // Parsear clave=valor o clave:valor
        const eqIdx = linea.indexOf("=");
        const colonIdx = linea.indexOf(":");

        let clave: string | null = null;
        let valor: string | null = null;

        if (eqIdx > 0) {
            clave = linea.substring(0, eqIdx).trim();
            valor = linea.substring(eqIdx + 1);
        } else if (colonIdx > 0) {
            clave = linea.substring(0, colonIdx).trim();
            valor = linea.substring(colonIdx + 1);
        }

        if (clave && valor !== null) {
            // Remover comillas alrededor del valor si las hay
            let valLimpio = valor.trim();
            if ((valLimpio.startsWith('"') && valLimpio.endsWith('"')) ||
                (valLimpio.startsWith("'") && valLimpio.endsWith("'"))) {
                valLimpio = valLimpio.slice(1, -1);
            }
            // Aplicar desescapado \uXXXX
            valLimpio = desescaparPropiedades(valLimpio);
            entradas[clave] = valLimpio;
        }

        i++;
    }

    return { entradas, descartadas, avisos };
}

function desescaparPropiedades(texto: string): string {
    // Reemplazar \uXXXX con el carácter Unicode correspondiente
    return texto.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
}