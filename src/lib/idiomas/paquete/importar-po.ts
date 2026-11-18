/**
 * IMA8 · Importación de paquetes de idiomas desde gettext (.po/.pot) y .properties.
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: Array<{ motivo: string; linea?: number }>;
    avisos: string[];
}

function limpiarBom(texto: string): string {
    return texto.startsWith("\uFEFF") ? texto.slice(1) : texto;
}

function decodificarEscapesPo(texto: string): string {
    return texto
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

function decodificarUnicode(texto: string): string {
    return texto.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extraerComillas(texto: string): string {
    const match = texto.match(/^"(.*)"$/);
    return match ? match[1] : texto;
}

function parseEntradaPo(bloque: string): { msgctxt: string; msgid: string; msgidPlural: string; msgstr: string[]; esPlural: boolean; fuzzy: boolean } {
    const lineas = bloque.split(/\r?\n/);
    let msgctxt = "";
    let msgid = "";
    let msgidPlural = "";
    const msgstr: string[] = [];
    let esPlural = false;
    let fuzzy = false;
    let estado: "inicio" | "msgid" | "msgstr" = "inicio";

    for (const linea of lineas) {
        const l = linea.trim();
        if (!l) continue;
        if (l.startsWith("#")) {
            if (l.includes("fuzzy")) fuzzy = true;
            continue;
        }
        if (l.startsWith("msgctxt")) {
            const m = l.match(/^msgctxt\s+"(.*)"$/);
            if (m) msgctxt = decodificarEscapesPo(m[1]);
            continue;
        }
        if (l.startsWith("msgid_plural")) {
            const m = l.match(/^msgid_plural\s+"(.*)"$/);
            if (m) msgidPlural = decodificarEscapesPo(m[1]);
            esPlural = true;
            estado = "msgid";
            continue;
        }
        if (l.startsWith("msgid")) {
            const m = l.match(/^msgid\s+"(.*)"$/);
            if (m) msgid = decodificarEscapesPo(m[1]);
            estado = "msgid";
            continue;
        }
        if (l.startsWith("msgstr")) {
            const matchMsgstr = l.match(/^msgstr(?:\[(\d+)\])?\s+"(.*)"$/);
            if (matchMsgstr) {
                const indice = matchMsgstr[1] ? parseInt(matchMsgstr[1], 10) : 0;
                msgstr[indice] = decodificarEscapesPo(matchMsgstr[2]);
            }
            estado = "msgstr";
            continue;
        }
        if (l.startsWith('"')) {
            const contenido = extraerComillas(l);
            const decodificado = decodificarEscapesPo(contenido);
            if (estado === "msgstr" && msgstr.length > 0) {
                msgstr[msgstr.length - 1] += decodificado;
            } else {
                msgid += decodificado;
            }
            continue;
        }
    }

    return { msgctxt, msgid, msgidPlural, msgstr, esPlural, fuzzy };
}

function dividirEnBloquesPo(texto: string): string[] {
    const bloques: string[] = [];
    const lineas = texto.split(/\r?\n/);
    let bloqueActual: string[] = [];
    let vioMsgid = false;

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        const l = linea.trim();

        const esMsgid = /^msgid(\s|$)/.test(l);
        const esMsgctxt = l.startsWith("msgctxt");

        // Nueva entrada: msgid cuando ya vimos un msgid anterior, o msgctxt cuando ya vimos msgid
        if ((esMsgid || esMsgctxt) && vioMsgid) {
            bloques.push(bloqueActual.join("\n"));
            bloqueActual = [linea];
            vioMsgid = esMsgid;
        } else {
            bloqueActual.push(linea);
            if (esMsgid) {
                vioMsgid = true;
            }
        }
    }

    if (bloqueActual.length > 0) {
        bloques.push(bloqueActual.join("\n"));
    }

    return bloques;
}

export function desdePo(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [], avisos: [] };
    const limpio = limpiarBom(texto);

    if (!limpio.trim()) {
        return resultado;
    }

    const bloques = dividirEnBloquesPo(limpio);

    for (const bloque of bloques) {
        const entrada = parseEntradaPo(bloque);

        if (entrada.msgid === "") {
            continue;
        }

        if (entrada.fuzzy) {
            resultado.avisos.push(`Entrada "${entrada.msgid}" marcada como fuzzy; se ignora`);
            continue;
        }

        const claveCompuesta = entrada.msgctxt ? `${entrada.msgctxt}|${entrada.msgid}` : entrada.msgid;

        if (entrada.esPlural) {
            if (entrada.msgstr[0]) {
                resultado.entradas[claveCompuesta] = entrada.msgstr[0];
                resultado.avisos.push(`plural simplificado para "${claveCompuesta}": se usa forma 0`);
            } else {
                resultado.descartadas.push({ motivo: "msgstr vacío en plural" });
            }
        } else {
            if (entrada.msgstr[0]) {
                resultado.entradas[claveCompuesta] = entrada.msgstr[0];
            } else {
                resultado.descartadas.push({ motivo: "msgstr vacío" });
            }
        }
    }

    return resultado;
}

export function desdeProperties(texto: string): ResultadoImportacion {
    const resultado: ResultadoImportacion = { entradas: {}, descartadas: [], avisos: [] };
    const limpio = limpiarBom(texto);

    if (!limpio.trim()) {
        return resultado;
    }

    const lineas = limpio.split(/\r?\n/);
    let i = 0;
    let lineaActual = "";
    let numeroLineaInicio = 0;
    let fueContinuacion = false;

    function finalizarLineaActual(esContinuacionIncompleta = false) {
        if (!lineaActual) return;

        const separadorIdx = lineaActual.indexOf("=");
        const separadorDosPuntosIdx = lineaActual.indexOf(":");

        let separadorPos = -1;
        if (separadorIdx !== -1 && separadorDosPuntosIdx !== -1) {
            separadorPos = Math.min(separadorIdx, separadorDosPuntosIdx);
        } else if (separadorIdx !== -1) {
            separadorPos = separadorIdx;
        } else if (separadorDosPuntosIdx !== -1) {
            separadorPos = separadorDosPuntosIdx;
        }

        if (separadorPos !== -1) {
            const clave = lineaActual.slice(0, separadorPos).trim();
            // No hacer trim si es continuación incompleta para preservar espacio final
            let valor = esContinuacionIncompleta
                ? lineaActual.slice(separadorPos + 1)
                : lineaActual.slice(separadorPos + 1).trim();

            if (clave) {
                valor = decodificarUnicode(valor);
                valor = valor
                    .replace(/\\n/g, "\n")
                    .replace(/\\t/g, "\t")
                    .replace(/\\r/g, "\r")
                    .replace(/\\"/g, '"')
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, "\\");
                resultado.entradas[clave] = valor;
            } else {
                resultado.descartadas.push({ motivo: "Clave vacía", linea: numeroLineaInicio });
            }
        } else {
            resultado.descartadas.push({ motivo: "Línea de continuación sin terminar", linea: numeroLineaInicio });
        }

        if (esContinuacionIncompleta) {
            resultado.descartadas.push({ motivo: "continuación sin terminar", linea: numeroLineaInicio });
        }

        lineaActual = "";
        fueContinuacion = false;
    }

    while (i < lineas.length) {
        const linea = lineas[i];
        const lineaRecortada = linea.trimEnd();

        // Verificar si la línea actual (sin continuaciones) parece una nueva entrada clave=valor
        const pareceNuevaEntrada = lineaActual !== "" && /^[^#\s!][^=:]*(?:=|:)/.test(lineaRecortada);

        if (!lineaRecortada.trim() || lineaRecortada.trimStart().startsWith("#") || lineaRecortada.trimStart().startsWith("!") || pareceNuevaEntrada) {
            if (lineaActual) {
                finalizarLineaActual(pareceNuevaEntrada && fueContinuacion);
            }

            if (pareceNuevaEntrada) {
                // No incrementar i, reprocesar esta línea como nueva entrada
                continue;
            }

            i++;
            continue;
        }

        if (lineaActual === "") {
            numeroLineaInicio = i + 1;
        }

        if (lineaRecortada.endsWith("\\")) {
            lineaActual += lineaRecortada.slice(0, -1);
            fueContinuacion = true;
            i++;
            continue;
        }

        lineaActual += lineaRecortada;
        i++;

        const separadorIdx = lineaActual.indexOf("=");
        const separadorDosPuntosIdx = lineaActual.indexOf(":");

        let separadorPos = -1;
        if (separadorIdx !== -1 && separadorDosPuntosIdx !== -1) {
            separadorPos = Math.min(separadorIdx, separadorDosPuntosIdx);
        } else if (separadorIdx !== -1) {
            separadorPos = separadorIdx;
        } else if (separadorDosPuntosIdx !== -1) {
            separadorPos = separadorDosPuntosIdx;
        } else {
            resultado.descartadas.push({ motivo: "Sin separador (= o :)", linea: numeroLineaInicio });
            lineaActual = "";
            fueContinuacion = false;
            continue;
        }

        const clave = lineaActual.slice(0, separadorPos).trim();
        let valor = lineaActual.slice(separadorPos + 1).trim();

        if (!clave) {
            resultado.descartadas.push({ motivo: "Clave vacía", linea: numeroLineaInicio });
            lineaActual = "";
            fueContinuacion = false;
            continue;
        }

        valor = decodificarUnicode(valor);
        valor = valor
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r")
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");

        resultado.entradas[clave] = valor;
        lineaActual = "";
        fueContinuacion = false;
    }

    if (lineaActual) {
        finalizarLineaActual(fueContinuacion);
    }

    return resultado;
}