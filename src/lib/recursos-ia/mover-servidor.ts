/**
 * Recursos de IA por neurona · mover pesos entre almacenes con verificación SHA-256 (solo SERVIDOR · 2026-10-23).
 *
 * Copia un archivo o carpeta de modelo de un almacén local a otro (disco interno ↔ externo) en flujo,
 * calcula el SHA-256 al copiar, lo compara con el origen y SOLO entonces deja el nuevo; el original no se borra
 * (eso lo decide la persona). Comprueba espacio libre antes (con margen del 10 %).
 * La ruta POST /api/recursos-ia/mover va con el mismo guardián que /api/recursos-ia/detectar (solo local)
 * y rechaza rutas fuera de los volúmenes detectados.
 * SOP: architecture/recursos-ia-neurona.md §3, §7.
 */
import { createHash } from "node:crypto";
import { stat, readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { statfs } from "node:fs";
import { promisify } from "node:util";

import type { VolumenDetectado } from "./deteccion-tipos";

const statfsAsync = promisify(statfs);
export const GIB = 1024 ** 3;
const MARGEN_ESPACIO = 0.1; // 10 %

/* ───────────────────────────── Tipos ───────────────────────────── */

export interface MoverEntrada {
    /** Ruta absoluta del origen (archivo o carpeta). */
    origen: string;
    /** Ruta absoluta del destino (carpeta donde copiar). */
    destino: string;
    /** SHA-256 hexadecimal esperado del origen (archivo) o de cada archivo (carpeta). */
    sha256Esperado?: string | Record<string, string>;
    /** Si true, sobrescribe archivos existentes en el destino. */
    sobrescribir?: boolean;
}

export interface MoverResultado {
    ok: boolean;
    /** Ruta absoluta del destino creado (archivo o carpeta). */
    destino?: string;
    /** Bytes copiados. */
    bytesCopiados: number;
    /** SHA-256 calculado (archivo) o mapa ruta→SHA (carpeta). */
    sha256Calculado: string | Record<string, string>;
    /** Tiempo en ms. */
    duracionMs: number;
    /** Avisos no bloqueantes. */
    avisos: string[];
    /** Error si ok=false. */
    error?: string;
}

export interface EspacioResultado {
    /** Espacio libre en bytes. */
    libreBytes: number;
    /** Espacio total en bytes. */
    totalBytes: number;
    /** Espacio libre en GB (2 decimales). */
    libreGb: number;
    /** Espacio total en GB (2 decimales). */
    totalGb: number;
    /** Si hay espacio suficiente para `necesarioBytes` + 10 %. */
    cabe: boolean;
    /** Bytes necesarios (con margen). */
    necesarioConMargen: number;
}

/* ───────────────────────────── Funciones PURAS (exportadas para tests) ───────────────────────────── */

/**
 * Calcula el SHA-256 de un archivo en flujo (sin cargar todo en memoria).
 * PURA: no usa disco ni red, solo el stream que se le pase.
 */
export async function sha256DeArchivo(ruta: string): Promise<string> {
    const hash = createHash("sha256");
    const file = await readFile(ruta);
    hash.update(file);
    return hash.digest("hex");
}

/**
 * Calcula el SHA-256 de un archivo leyéndolo por chunks (streaming real).
 * PURA: lógica de streaming, sin efectos de lado.
 */
export async function sha256DeArchivoStream(ruta: string, chunkSize = 64 * 1024): Promise<string> {
    const { open } = await import("node:fs/promises");
    const handle = await open(ruta, "r");
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(chunkSize);
    let bytesLeidos: number;
    do {
        const { bytesRead } = await handle.read(buffer, 0, chunkSize, null);
        bytesLeidos = bytesRead;
        if (bytesLeidos > 0) hash.update(buffer.subarray(0, bytesLeidos));
    } while (bytesLeidos > 0);
    await handle.close();
    return hash.digest("hex");
}

/**
 * Verifica que una ruta está dentro de alguno de los volúmenes detectados.
 * PURA: solo compara strings.
 */
export function rutaEnVolumenes(ruta: string, volumenes: VolumenDetectado[]): boolean {
    const rutaNormalizada = ruta.replace(/\/+$/, "");
    return volumenes.some((v) => {
        const montaje = v.montaje.replace(/\/+$/, "");
        return rutaNormalizada === montaje || rutaNormalizada.startsWith(montaje + "/");
    });
}

/**
 * Calcula el tamaño total de un archivo o carpeta (recursivo).
 * PURA: lógica de cálculo, la implementación real usa stat/readdir.
 */
export async function calcularTamano(ruta: string): Promise<number> {
    const stats = await stat(ruta);
    if (stats.isFile()) return stats.size;
    if (!stats.isDirectory()) return 0;
    let total = 0;
    const entradas = await readdir(ruta, { withFileTypes: true });
    for (const e of entradas) {
        total += await calcularTamano(`${ruta}/${e.name}`);
    }
    return total;
}

/**
 * Obtiene el espacio libre y total de un montaje (statfs).
 * PURA: wrapper tipado, la implementación real llama a statfsAsync.
 */
export async function espacioDeMontaje(montaje: string): Promise<EspacioResultado> {
    const s = await statfsAsync(montaje);
    const bsize = Number(s.bsize);
    const blocks = Number(s.blocks);
    const bavail = Number(s.bavail);
    const totalBytes = blocks * bsize;
    const libreBytes = bavail * bsize;
    const gb = (b: number) => Math.round((b / GIB) * 100) / 100;
    return {
        libreBytes,
        totalBytes,
        libreGb: gb(libreBytes),
        totalGb: gb(totalBytes),
        cabe: false, // se setea fuera con el tamaño necesario
        necesarioConMargen: 0,
    };
}

/**
 * Decide si cabe el archivo/carpeta en el destino con margen del 10 %.
 * PURA: solo aritmética.
 */
export function cabeConMargen(libreBytes: number, necesarioBytes: number): { cabe: boolean; necesarioConMargen: number } {
    const necesarioConMargen = Math.ceil(necesarioBytes * (1 + MARGEN_ESPACIO));
    return { cabe: libreBytes >= necesarioConMargen, necesarioConMargen };
}

/**
 * Normaliza una ruta eliminando `.` y `..` y barras dobles.
 * PURA: solo strings.
 */
export function normalizarRuta(ruta: string): string {
    const esAbsoluta = ruta.startsWith("/");
    const partes = ruta.split("/").filter((p) => p && p !== ".");
    const res: string[] = [];
    for (const p of partes) {
        if (p === "..") {
            if (res.length > 0) res.pop();
            else if (!esAbsoluta) res.push("..");
        } else {
            res.push(p);
        }
    }
    let out = res.join("/");
    if (esAbsoluta) out = "/" + out;
    return out || (esAbsoluta ? "/" : ".");
}

/**
 * Construye la ruta de destino final (archivo o carpeta) a partir del origen y la carpeta destino.
 * PURA: solo strings.
 */
export function construirRutaDestino(origen: string, destinoCarpeta: string): string {
    const nombre = origen.split("/").filter(Boolean).pop() || "copia";
    return `${destinoCarpeta.replace(/\/+$/, "")}/${nombre}`;
}

/* ───────────────────────────── Funciones de SERVIDOR (node:fs, node:crypto) ───────────────────────────── */

/**
 * Copia un archivo en flujo calculando SHA-256 al mismo tiempo.
 * Si el SHA no cuadra con el esperado, borra el destino y devuelve error.
 */
export async function copiarArchivoConSha(
    origen: string,
    destino: string,
    shaEsperado?: string,
    sobrescribir = false,
): Promise<{ sha256: string; bytes: number }> {
    const statsOrigen = await stat(origen);
    if (!statsOrigen.isFile()) throw new Error(`El origen no es un archivo: ${origen}`);

    // Verificar si existe el destino
    try {
        const statsDestino = await stat(destino);
        if (statsDestino.isFile()) {
            if (!sobrescribir) {
                throw new Error(`El destino ya existe y sobrescribir=false: ${destino}`);
            }
        } else if (statsDestino.isDirectory()) {
            throw new Error(`El destino es una carpeta, no un archivo: ${destino}`);
        }
    } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") throw e;
    }

    // Asegurar carpeta padre
    const padre = destino.split("/").slice(0, -1).join("/") || "/";
    await mkdir(padre, { recursive: true });

    const hash = createHash("sha256");
    const { open } = await import("node:fs/promises");
    const [src, dst] = await Promise.all([open(origen, "r"), open(destino, "w")]);
    const buffer = Buffer.alloc(64 * 1024);
    let totalBytes = 0;
    let bytesLeidos: number;
    try {
        do {
            const { bytesRead } = await src.read(buffer, 0, buffer.length, null);
            bytesLeidos = bytesRead;
            if (bytesLeidos > 0) {
                hash.update(buffer.subarray(0, bytesLeidos));
                await dst.write(buffer.subarray(0, bytesLeidos));
                totalBytes += bytesLeidos;
            }
        } while (bytesLeidos > 0);
    } finally {
        await Promise.all([src.close(), dst.close()]);
    }

    const shaCalculado = hash.digest("hex");

    if (shaEsperado && shaCalculado !== shaEsperado.toLowerCase()) {
        // SHA no cuadra: borrar destino y fallar
        await rm(destino, { force: true });
        throw new Error(
            `SHA-256 no coincide: esperado ${shaEsperado}, calculado ${shaCalculado} (${totalBytes} bytes)`,
        );
    }

    return { sha256: shaCalculado, bytes: totalBytes };
}

/**
 * Copia una carpeta recursivamente en flujo, calculando SHA-256 de cada archivo.
 * Si algún SHA no cuadra, borra todo lo copiado y devuelve error.
 */
export async function copiarCarpetaConSha(
    origen: string,
    destino: string,
    shasEsperados?: Record<string, string>,
    sobrescribir = false,
): Promise<{ shas: Record<string, string>; bytes: number }> {
    const statsOrigen = await stat(origen);
    if (!statsOrigen.isDirectory()) throw new Error(`El origen no es una carpeta: ${origen}`);

    // Verificar si existe el destino
    try {
        const statsDestino = await stat(destino);
        if (statsDestino.isDirectory() && !sobrescribir) {
            throw new Error(`El destino ya existe y sobrescribir=false: ${destino}`);
        }
        if (statsDestino.isFile()) {
            throw new Error(`El destino es un archivo, no una carpeta: ${destino}`);
        }
    } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== "ENOENT" && !err.message?.includes("sobrescribir")) throw e;
    }

    await mkdir(destino, { recursive: true });

    const shas: Record<string, string> = {};
    let totalBytes = 0;
    const archivosCopiados: string[] = [];

    async function copiarRecursivo(origenActual: string, destinoActual: string): Promise<void> {
        const entradas = await readdir(origenActual, { withFileTypes: true });
        for (const e of entradas) {
            const src = `${origenActual}/${e.name}`;
            const dst = `${destinoActual}/${e.name}`;
            if (e.isFile()) {
                const rel = src.slice(origen.length + 1);
                const shaEsperado = shasEsperados?.[rel];
                const { sha256, bytes } = await copiarArchivoConSha(src, dst, shaEsperado, sobrescribir);
                shas[rel] = sha256;
                totalBytes += bytes;
                archivosCopiados.push(dst);
            } else if (e.isDirectory()) {
                await mkdir(dst, { recursive: true });
                await copiarRecursivo(src, dst);
            }
        }
    }

    try {
        await copiarRecursivo(origen, destino);
    } catch (e) {
        // Fallo: limpiar lo copiado
        for (const f of archivosCopiados) {
            await rm(f, { force: true }).catch(() => {});
        }
        await rm(destino, { recursive: true, force: true }).catch(() => {});
        throw e;
    }

    return { shas, bytes: totalBytes };
}

/**
 * Función principal: mueve (copia con verificación) un archivo o carpeta entre almacenes.
 * - Verifica que origen y destino están en volúmenes detectados.
 * - Verifica espacio libre en destino con margen 10 %.
 * - Copia en flujo calculando SHA-256.
 * - Compara SHA con el esperado (si se da).
 * - SOLO deja el destino si todo cuadra.
 * - NO borra el origen.
 */
export async function moverPesos(
    entrada: MoverEntrada,
    volumenes: VolumenDetectado[],
): Promise<MoverResultado> {
    const inicio = Date.now();
    const avisos: string[] = [];
    const { origen, destino, sha256Esperado, sobrescribir = false } = entrada;

    // Validar que las rutas están en volúmenes detectados
    if (!rutaEnVolumenes(origen, volumenes)) {
        return {
            ok: false,
            bytesCopiados: 0,
            sha256Calculado: {},
            duracionMs: Date.now() - inicio,
            avisos,
            error: `El origen está fuera de los volúmenes detectados: ${origen}`,
        };
    }
    if (!rutaEnVolumenes(destino, volumenes)) {
        return {
            ok: false,
            bytesCopiados: 0,
            sha256Calculado: {},
            duracionMs: Date.now() - inicio,
            avisos,
            error: `El destino está fuera de los volúmenes detectados: ${destino}`,
        };
    }

    // Verificar que el origen existe
    try {
        await stat(origen);
    } catch {
        return {
            ok: false,
            bytesCopiados: 0,
            sha256Calculado: {},
            duracionMs: Date.now() - inicio,
            avisos,
            error: `El origen no existe: ${origen}`,
        };
    }

    // Calcular tamaño necesario
    const tamañoNecesario = await calcularTamano(origen);

    // Encontrar el volumen del destino para ver espacio libre
    const volDestino = volumenes.find((v) => {
        const m = v.montaje.replace(/\/+$/, "");
        const d = destino.replace(/\/+$/, "");
        return d === m || d.startsWith(m + "/");
    });
    if (!volDestino) {
        return {
            ok: false,
            bytesCopiados: 0,
            sha256Calculado: {},
            duracionMs: Date.now() - inicio,
            avisos,
            error: `No se encontró volumen para el destino: ${destino}`,
        };
    }

    // Verificar espacio libre
    const espacio = await espacioDeMontaje(volDestino.montaje);
    const { cabe, necesarioConMargen } = cabeConMargen(espacio.libreBytes, tamañoNecesario);
    if (!cabe) {
        return {
            ok: false,
            bytesCopiados: 0,
            sha256Calculado: {},
            duracionMs: Date.now() - inicio,
            avisos: [`Espacio libre: ${espacio.libreGb} GB, necesario con margen: ${Math.round((necesarioConMargen / GIB) * 100) / 100} GB`],
            error: `Espacio insuficiente en ${volDestino.nombre} (${volDestino.montaje})`,
        };
    }

    // Construir ruta final de destino
    const destinoFinal = construirRutaDestino(origen, destino);

    // Copiar según sea archivo o carpeta
    const statsOrigen = await stat(origen);
    let shaCalculado: string | Record<string, string>;
    let bytesCopiados = 0;

    try {
        if (statsOrigen.isFile()) {
            const shaEsperado = typeof sha256Esperado === "string" ? sha256Esperado : undefined;
            const resultado = await copiarArchivoConSha(origen, destinoFinal, shaEsperado, sobrescribir);
            shaCalculado = resultado.sha256;
            bytesCopiados = resultado.bytes;
        } else if (statsOrigen.isDirectory()) {
            const shasEsperados = typeof sha256Esperado === "object" ? sha256Esperado : undefined;
            const resultado = await copiarCarpetaConSha(origen, destinoFinal, shasEsperados, sobrescribir);
            shaCalculado = resultado.shas;
            bytesCopiados = resultado.bytes;
        } else {
            return {
                ok: false,
                bytesCopiados: 0,
                sha256Calculado: {},
                duracionMs: Date.now() - inicio,
                avisos,
                error: `El origen no es archivo ni carpeta: ${origen}`,
            };
        }
    } catch (e) {
        const err = e as Error;
        return {
            ok: false,
            bytesCopiados: 0,
            sha256Calculado: {},
            duracionMs: Date.now() - inicio,
            avisos,
            error: err.message,
        };
    }

    return {
        ok: true,
        destino: destinoFinal,
        bytesCopiados,
        sha256Calculado: shaCalculado,
        duracionMs: Date.now() - inicio,
        avisos,
    };
}

/* ───────────────────────────── Utilidad para tests ───────────────────────────── */

/** Crea un archivo temporal con contenido aleatorio para tests. */
export async function crearArchivoTemporal(ruta: string, tamañoBytes: number): Promise<string> {
    await mkdir(ruta.split("/").slice(0, -1).join("/"), { recursive: true });
    const buffer = Buffer.alloc(tamañoBytes);
    for (let i = 0; i < tamañoBytes; i++) buffer[i] = Math.floor(Math.random() * 256);
    await writeFile(ruta, buffer);
    return sha256DeArchivo(ruta);
}

/** Crea una carpeta temporal con varios archivos para tests. */
export async function crearCarpetaTemporal(
    ruta: string,
    archivos: Record<string, number | string>,
): Promise<Record<string, string>> {
    const shas: Record<string, string> = {};
    for (const [nombre, contenido] of Object.entries(archivos)) {
        const rutaArchivo = `${ruta}/${nombre}`;
        await mkdir(rutaArchivo.split("/").slice(0, -1).join("/"), { recursive: true });
        const buffer = typeof contenido === "number"
            ? (() => { const b = Buffer.alloc(contenido); for (let i = 0; i < contenido; i++) b[i] = Math.floor(Math.random() * 256); return b; })()
            : Buffer.from(contenido, "utf8");
        await writeFile(rutaArchivo, buffer);
        shas[nombre] = await sha256DeArchivo(rutaArchivo);
    }
    return shas;
}