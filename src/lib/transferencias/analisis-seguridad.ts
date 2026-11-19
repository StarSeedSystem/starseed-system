/**
 * transferencias/analisis-seguridad — Análisis puro de seguridad de archivos recibidos.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Reglas:
 * - Al recibir, Astraura ofrece analizar (y lo hace solo si la persona quiere o si lo dejó activado):
 *   · tipo real frente a extensión
 *   · huella
 *   · firma del ejecutable si la tiene
 *   · señales de riesgo (ejecutables, macros, scripts, comprimidos anidados, rutas peligrosas en comprimidos)
 *   · antivirus del sistema si existe (ClamAV, XProtect, Defender) por su orden
 * - El resultado se muestra ANTES de abrir
 * - Lo recibido queda en cuarentena hasta aceptar y analizar si así se eligió
 * Español neutro, puro (sin red, sin disco, sin procesos lanzados).
 */

export interface ResultadoAnalisis {
    /** Tipo real detectado (imagen, audio, video, ejecutable, documento, compresión, otro) */
    tipoReal: string;
    /** ¿El tipo detectado coincide con la extensión/claim? */
    tipoCoincide: boolean;
    /** Huella SHA-256 del archivo (hex), si se pudo calcular */
    huella?: string;
    /** Firma digital del ejecutable, si la tiene */
    firma?: string;
    /** Señales de riesgo detectadas */
    riesgo: {
        /** ¿Es un archivo ejecutable? */
        ejecutable: boolean;
        /** ¿Contiene macros (Office, etc.)? */
        macros: boolean;
        /** ¿Contiene scripts (shell, python, etc.)? */
        scripts: boolean;
        /** ¿Es un compresión anidada (zip, rar, etc.)? */
        comprimidoAnidado: boolean;
        /** ¿Tiene rutas absolutas o peligrosas dentro de compresión? */
        rutasPeligrosas: boolean;
        /** ¿Se detectó como virus por antivirus? */
        virusSistema: boolean;
        /** Mensaje descriptivo de cualquier riesgo encontrado */
        mensaje: string;
    };
    /** ¿El archivo pasó el análisis sin riesgos críticos? */
    seguro: boolean;
    /** Si no es seguro, explicación resumida */
    explicacion: string;
}

/**
 * Tipos de archivo por tipo real detectado.
 */
export type TipoArchivo =
    | "imagen"
    | "audio"
    | "video"
    | "ejecutable"
    | "documento"
    | "comprimido"
    | "otro";

/**
 * Lista de extensiones de compresión.
 */
const LISTA_COMPRESION = [".zip", ".rar", ".7z", ".tar", ".gz", ".xz", ".iso", ".dmg"];

/** Lista de extensiones de imagen. */
const LISTA_IMAGEN = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tiff", ".tif"];

/** Lista de extensiones de audio. */
const LISTA_AUDIO = [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma", ".mid", ".midi"];

/** Lista de extensiones de video. */
const LISTA_VIDEO = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".mkv", ".rm"];

/** Lista de extensiones de ejecutables. */
const LISTA_EJECUTABLE = [".exe", ".bin", ".run", ".com", ".app", ".deb", ".rpm"];
const LISTA_EXTENSION_EXE = [".exe", ".bin", ".run", ".sh", ".bash", ".cmd", ".com", ".app"];

/** Lista de extensiones de Office. */
const LISTA_EXTENSION_OFFICE = [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"];

/** Lista de extensiones peligrosas. */
const LISTA_EXTENSION_PELIGROSA = [".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".cpl"];

/** Lista de extensiones de riesgo general. */
const LISTA_EXTENSION_RIESGO = [".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".cpl", ".vbs", ".js", ".jse"];

/** Mapeo de tipos a extensiones para coincidir nombre con tipo. */
const MAP_TIPO_EXTENSIONES: Record<string, string[]> = {
    imagen: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico"],
    audio: [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"],
    video: [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv"],
    documento: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".wpd"],
    ejecutable: [".exe", ".bin", ".sh", ".bash", ".cmd", ".com", ".app"],
    comprimido: [".zip", ".rar", ".7z", ".tar", ".gz", ".xz", ".iso"],
};

/**
 * Realiza un análisis de seguridad de un archivo basado en su tipo MIME y contenido.
 * Este es un módulo puro que analiza basándose en metadatos y heurísticas,
 * sin ejecutar ni acceder al sistema de archivos.
 *
 * @param tipoMime - El tipo MIME del archivo (ej. "application/zip", "application/pdf")
 * @param nombre - El nombre del archivo (para heurística por extensión)
 * @param contenidoBytes - Los primeros bytes del archivo (para heurística de firma)
 * @param esComprimido - Si el archivo es un compresor (zip, rar, etc.)
 * @returns Resultado del análisis de seguridad
 */
export function analizarSeguridad(
    tipoMime: string,
    nombre: string,
    contenidoBytes?: Uint8Array,
    esComprimido: boolean = false,
): ResultadoAnalisis {
    const tipoReal = detectarTipoReal(tipoMime, nombre, contenidoBytes, esComprimido);
    const tipoCoincide = tipoMime.toLowerCase().includes(tipoReal.toLowerCase()) || coincideExtensionNombre(tipoReal, nombre);

    // Detectar señales de riesgo
    const riesgo = detectarSeñalesRiesgo(tipoReal, nombre, contenidoBytes, esComprimido);

    // Calcular huella si hay contenido (usando crypto.createHash síncrono)
    let huella: string | undefined;
    if (contenidoBytes && contenidoBytes.length > 0) {
        huella = calcularHuella(contenidoBytes);
    }

    // Detectar firma de ejecutable (solo para tipos ejecutables)
    let firma: string | undefined;
    if (tipoReal === "ejecutable" && contenidoBytes) {
        firma = detectarFirmaEjecutable(contenidoBytes);
    }

    const seguro = !riesgo.ejecutable || !riesgo.virusSistema;
    const explicacion = generarExplicacion(tipoReal, riesgo);

    return {
        tipoReal,
        tipoCoincide,
        huella,
        firma,
        riesgo,
        seguro,
        explicacion,
    };
}

/**
 * Detecta el tipo real de un archivo basándose en su MIME y contenido.
 */
function detectarTipoReal(tipoMime: string, nombre: string, contenidoBytes?: Uint8Array, esComprimido: boolean = false): string {
    const nombreLower = nombre.toLowerCase();

    // Verificar compresión primero
    if (esComprimido || LISTA_COMPRESION.some((ext) => nombre.endsWith(ext))) {
        return "comprimido";
    }

    // Tipos de imagen
    if (tipoMime.startsWith("image/") || LISTA_IMAGEN.some((ext) => nombre.endsWith(ext))) {
        return "imagen";
    }

    // Tipos de audio
    if (tipoMime.startsWith("audio/") || LISTA_AUDIO.some((ext) => nombre.endsWith(ext))) {
        return "audio";
    }

    // Tipos de video
    if (tipoMime.startsWith("video/") || LISTA_VIDEO.some((ext) => nombre.endsWith(ext))) {
        return "video";
    }

    // Ejecutables
    if (LISTA_EJECUTABLE.some((ext) => nombre.endsWith(ext)) ||
        LISTA_EXTENSION_EXE.some((ext) => nombre.endsWith(ext))) {
        return "ejecutable";
    }

    // Documentos
    if (tipoMime.includes("pdf") || tipoMime.includes("word") ||
        tipoMime.includes("excel") || tipoMime.includes("powerpoint") ||
        LISTA_DOCUMENTO.some((ext) => nombre.endsWith(ext))) {
        return "documento";
    }

    return "otro";
}

/** Lista de extensiones de documentos (usada en detectarTipoReal). */
const LISTA_DOCUMENTO = [".pdf", ".doc", ".txt", ".rtf", ".odt", ".wpd"];

/**
 * Detecta señales de riesgo en un archivo.
 */
function detectarSeñalesRiesgo(
    tipoReal: string,
    nombre: string,
    contenidoBytes?: Uint8Array,
    esComprimido: boolean = false,
): {
    ejecutable: boolean;
    macros: boolean;
    scripts: boolean;
    comprimidoAnidado: boolean;
    rutasPeligrosas: boolean;
    virusSistema: boolean;
    mensaje: string;
} {
    const nombreLower = nombre.toLowerCase();
    const resultado: {
        ejecutable: boolean;
        macros: boolean;
        scripts: boolean;
        comprimidoAnidado: boolean;
        rutasPeligrosas: boolean;
        virusSistema: boolean;
        mensaje: string[];
    } = {
        ejecutable: false,
        macros: false,
        scripts: false,
        comprimidoAnidado: false,
        rutasPeligrosas: false,
        virusSistema: false,
        mensaje: [],
    };

    // Verificar por tipo real
    switch (tipoReal) {
        case "ejecutable":
            resultado.ejecutable = true;
            resultado.mensaje.push("Archivo ejecutable detectado");
            break;
        case "documento":
            // Verificar macros en documentos
            if (LISTA_EXTENSION_OFFICE.some((ext) => nombreLower.endsWith(ext))) {
                resultado.macros = true;
                resultado.mensaje.push("Documento con posible contenido de macros");
            }
            // Verificar scripts incrustados
            if (contenidoBytes) {
                const texto = new TextDecoder().decode(contenidoBytes).toLowerCase();
                if (texto.includes("#!/bin") || texto.includes("#!/usr/bin")) {
                    resultado.scripts = true;
                    resultado.mensaje.push("Posible script shebang detectado");
                }
                if (texto.includes("<script") || texto.includes("<!--")) {
                    resultado.scripts = true;
                    resultado.mensaje.push("Posible contenido HTML/Script detectado");
                }
            }
            break;
        case "imagen":
            // Imágenes normalmente no tienen riesgo, pero verificar extensiones sospechosas
            if (LISTA_EXTENSION_PELIGROSA.some((ext) => nombreLower.endsWith(ext))) {
                resultado.rutasPeligrosas = true;
                resultado.mensaje.push("Extensión de imagen con nombre sospechoso");
            }
            break;
        case "comprimido":
            resultado.comprimidoAnidado = esComprimido;
            resultado.mensaje.push(esComprimido ? "Comprimido detectado" : "No es compresión");
            // Si es compresión, verificar rutas dentro
            if (esComprimido && contenidoBytes) {
                const texto = new TextDecoder().decode(contenidoBytes);
                // Verificar rutas peligrosas simples
                if (texto.includes("..") || /C:\\/.test(texto) || /D:\//.test(texto)) {
                    resultado.rutasPeligrosas = true;
                    resultado.mensaje.push("Rutas peligrosas dentro de compresión");
                }
            }
            break;
        case "otro":
            // Verificar extensiones genéricas riesgosas
            if (LISTA_EXTENSION_RIESGO.some((ext) => nombreLower.endsWith(ext))) {
                resultado.ejecutable = true;
                resultado.mensaje.push("Extensión de archivo de riesgo general");
            }
            break;
    }

    // Verificar scripts en el contenido (aplica a varios tipos)
    if (contenidoBytes) {
        const texto = new TextDecoder().decode(contenidoBytes).toLowerCase();
        // Scripts shell
        if (/^#!.*\b(sh|bash|zsh|fish|powershell)\b/.test(texto) || /"shell".*"/.test(texto)) {
            resultado.scripts = true;
            if (!resultado.mensaje.includes("script")) {
                resultado.mensaje.push("Posible script de shell detectado");
            }
        }
        // Scripts Python
        if (texto.includes("import ") || texto.includes("from ") || /"python"/.test(texto)) {
            // Solo si no es un documento normal
            if (tipoReal !== "documento") {
                resultado.scripts = true;
                if (!resultado.mensaje.includes("script")) {
                    resultado.mensaje.push("Posible script Python detectado");
                }
            }
        }
    }

    // Virus del sistema - en un entorno puro, esto sería una llamada al antivirus
    // Por ahora, simulamos la verificación. En producción real, esto llamaría
    // a ClamAV, XProtect o Defender según el SO.
    resultado.virusSistema = false; // Placeholder: se completaría con integración real

    // Construir mensaje final
    const mensajes = resultado.mensaje;
    const mensajeFinal = mensajes.length === 0
        ? "No se detectaron riesgos específicos"
        : mensajes.join(". ") + ".";

    return {
        ejecutable: resultado.ejecutable,
        macros: resultado.macros,
        scripts: resultado.scripts,
        comprimidoAnidado: resultado.comprimidoAnidado,
        rutasPeligrosas: resultado.rutasPeligrosas,
        virusSistema: resultado.virusSistema,
        mensaje: mensajeFinal,
    };
}

/**
 * Calcula una huella SHA-256 de los bytes del contenido.
 * Puro: usa crypto.createHash síncrono (entorno Node).
 */
function calcularHuella(contenidoBytes: Uint8Array): string {
    const crypto = require("crypto");
    const buffer = Buffer.from(
        contenidoBytes.buffer.slice(
            contenidoBytes.byteOffset,
            contenidoBytes.byteOffset + contenidoBytes.byteLength,
        )
    );
    const hashBuffer = crypto.createHash("sha256").update(buffer).digest();
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Comprueba si el tipo detectado coincide con la extensión o nombre del archivo.
 */
function coincideExtensionNombre(tipoReal: string, nombre: string): boolean {
    const nombreLower = nombre.toLowerCase();

    return MAP_TIPO_EXTENSIONES[tipoReal]?.some((ext) => nombreLower.endsWith(ext)) ?? false;
}

/**
 * Detecta firma digital de un ejecutable (pequeña heurística basada en bytes iniciales).
 */
function detectarFirmaEjecutable(contenidoBytes: Uint8Array): string | undefined {
    const texto = new TextDecoder().decode(contenidoBytes.slice(0, 100)).toLowerCase();

    // Firmas comunes de ejecutables
    if (texto.startsWith("#!/")) {
        return "Script con shebang (línea inicial)";
    }

    // Buscar firma PE (Windows executable) - los primeros bytes suelen ser "MZ"
    if (contenidoBytes.length >= 2) {
        const firstTwo = String.fromCharCode(contenidoBytes[0], contenidoBytes[1]).toLowerCase();
        if (firstTwo === "mz") {
            return "Formato PE (Windows executable) detectado";
        }
    }

    // Firmas de scripts interpreters
    if (texto.includes("shell script") || texto.includes("bash script")) {
        return "Script con cabecera de shell";
    }

    return undefined;
}

/** Genera una explicación legible del resultado del análisis. */
function generarExplicacion(tipoReal: string, riesgo: {
    ejecutable: boolean;
    macros: boolean;
    scripts: boolean;
    comprimidoAnidado: boolean;
    rutasPeligrosas: boolean;
    virusSistema: boolean;
    mensaje: string;
}): string {
    const partes: string[] = [];

    // Tipo base
    partes.push(`Tipo: ${tipoReal}`);

    // Riesgos
    const riesgos: string[] = [];
    if (riesgo.ejecutable) riesgos.push("es un archivo ejecutable");
    if (riesgo.macros) riesgos.push("contiene macros");
    if (riesgo.scripts) riesgos.push("contiene scripts");
    if (riesgo.comprimidoAnidado) riesgos.push("es un compresión anidada");
    if (riesgo.rutasPeligrosas) riesgos.push("tiene rutas peligrosas");
    if (riesgo.virusSistema) riesgos.push("fue marcado como virus");

    if (riesgos.length > 0) {
        partes.push(` Riesgo: ${riesgos.join(", ")}.`);
    } else {
        partes.push(" Sin riesgos específicos detectados.");
    }

    // Mensaje adicional
    partes.push(` ${riesgo.mensaje}`);

    return partes.join(" ");
}

// Exportar tipos y funciones auxiliares
export { coincideExtensionNombre };