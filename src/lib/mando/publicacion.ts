/**
 * Publicación de Genesis (Ola 239 · «Pestaña Publicar»)
 * ─────────────────────────────────────────────────────────────────────────────
 * PREPARA y DOCUMENTA la publicación, pero NUNCA la ejecuta (nada de `git push`
 * ni despliegues: eso lo hace Alex desde su terminal). `leerPublicacion()`
 * reúne el estado real —rama, HEAD, commits sin publicar, áreas tocadas y las
 * comprobaciones tsc/vitest/revisiones— y `prepararPublicacion(nota)` lo vuelca
 * a `starseed_memory_root/relevo/publicacion-pendiente.json` para el visto bueno.
 *
 * ⚠️ Seguridad: este módulo es SOLO de servidor; jamás devuelve claves, tokens
 * ni rutas absolutas del disco (las rutas salen recortadas o relativas).
 */

import { execFile } from "node:child_process";
import { open, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";

const execFileAsync = promisify(execFile);

/** Commit sin publicar, tal como lo muestra la pestaña «Publicar». */
export type CommitPublicacion = {
    sha: string;
    titulo: string;
    /** Identificador de la ola («226» en «Ola 226 · …») si el asunto lo trae. */
    ola?: string;
};

/** Resultado de una comprobación de publicación. */
export type EstadoComprobacion = "desconocido" | "ok" | "falla";

/** Comprobaciones previas: tsc, vitest y revisiones bloqueantes. */
export type Comprobaciones = {
    tsc: EstadoComprobacion;
    vitest: EstadoComprobacion;
    revisionesBloqueantes: number;
};

/** Estado completo de publicación que devuelve `leerPublicacion()`. */
export type EstadoPublicacion = {
    generadoEn: string;
    rama: string | null;
    head: string | null;
    sinPublicar: number;
    commits: CommitPublicacion[];
    archivosCambiados: number;
    /** Áreas tocadas: primer segmento bajo `src/` de cada archivo, con su conteo. */
    areas: Record<string, number>;
    comprobaciones: Comprobaciones;
    comando: string;
};

/** El manifiesto que `prepararPublicacion()` escribe y devuelve. */
export type ManifiestoPublicacion = EstadoPublicacion & {
    nota: string;
    fecha: string;
    archivo: string;
};

const COMANDO_PUSH = "git push origin main";

/** Ruta relativa (nunca absoluta) del manifiesto pendiente de publicar. */
const ARCHIVO_MANIFIESTO = path.join("starseed_memory_root", "relevo", "publicacion-pendiente.json");

/** Ruta relativa del archivo de eventos de las olas (comprobaciones). */
const ARCHIVO_EVENTOS = path.join("starseed_memory_root", "olas", "eventos.jsonl");

/** Lo que `interpretarComprobaciones` sabe de tsc y vitest (null = ninguna verificación aún). */
export type EstadoVerificaciones = { tsc: "ok" | "falla" | null; vitest: "ok" | "falla" | null };

/**
 * Función pura: cuenta las áreas tocadas a partir de una lista de rutas git
 * (`git diff … --name-only`). El área es el primer segmento bajo `src/`;
 * cualquier ruta fuera de `src/` (migraciones, docs, scripts) cae en «raíz».
 */
export function contarAreas(rutas: string[]): Record<string, number> {
    const areas: Record<string, number> = {};
    for (const ruta of rutas) {
        const limpia = ruta.trim();
        if (!limpia) continue;
        const m = /^src\/([^/]+)/.exec(limpia);
        const area = m ? m[1] : "raíz";
        areas[area] = (areas[area] ?? 0) + 1;
    }
    return areas;
}

/**
 * Función pura: extrae el identificador de ola de un asunto de commit
 * («Ola 226 · X4F2: título…» → «226»; sin coincidencia, `undefined`).
 */
export function olaDeAsunto(asunto: string): string | undefined {
    const m = /(?:^Ola\s+|\bola\s+)(\d{2,4})\b/i.exec(asunto);
    return m ? m[1] : undefined;
}

/**
 * Función pura: parsea las líneas JSONL (`eventos.jsonl`) y devuelve el resultado
 * de tsc y vitest a partir del ÚLTIMO evento `verificado`/`verificacion_fallida`.
 * Por línea: el tipo del evento está en `tipo`; el test o la puerta en `texto`/`tarea`.
 * Devuelve `null` si ninguna línea es una verificación (→ «desconocido» arriba).
 * Con `previo` sigue desde lo ya leído (el lector incremental de abajo lo usa así).
 */
export function interpretarComprobaciones(
    lineas: string[],
    previo?: EstadoVerificaciones,
): EstadoVerificaciones {
    let tsc: "ok" | "falla" | null = previo?.tsc ?? null;
    let vitest: "ok" | "falla" | null = previo?.vitest ?? null;
    for (const linea of lineas) {
        const bruta = linea.trim();
        if (!bruta) continue;
        let dato: Record<string, unknown>;
        try {
            const valor = JSON.parse(bruta) as unknown;
            dato = typeof valor === "object" && valor !== null && !Array.isArray(valor)
                ? (valor as Record<string, unknown>)
                : {};
        } catch {
            continue;
        }
        const tipo = typeof dato.tipo === "string" ? dato.tipo : "";
        if (tipo !== "verificado" && tipo !== "verificacion_fallida") continue;
        const falla = tipo === "verificacion_fallida";
        const texto = `${typeof dato.texto === "string" ? dato.texto : ""} ${typeof dato.tarea === "string" ? dato.tarea : ""}`.toLowerCase();
        // El último evento manda: se sobrescribe en cada aparición.
        if (texto.includes("tsc")) tsc = falla ? "falla" : "ok";
        else if (texto.includes("vitest") || texto.includes("test")) vitest = falla ? "falla" : "ok";
    }
    return { tsc, vitest };
}

// ─── Lector incremental de eventos.jsonl (SUP0511A, 05-11) ───────────────────
// POR QUÉ. `leerComprobaciones` hacía `readFile` de `eventos.jsonl` ENTERO (31,5 MB el 05-11,
// y crece cada día), lo partía en ~200 000 líneas y hacía un `JSON.parse` de cada una para
// encontrar el último `verificado` (del 09-10). `/metagenesis` pide `/api/mando/publicacion`
// cada 30 s por cliente abierto: con eso el montón de Genesis subía de 392 a 1085 MB en un
// minuto (`large_object_space` de 108 a 705 MB) y next-server murió seis veces entre el 04-11
// y el 05-11 con «Reached heap limit». Regla de la supervisión: un registro que crece no se
// lee entero; se lee lo añadido.
// QUÉ HACE. Lee por trozos (1 MB) solo lo añadido desde la última vez, en bytes; solo decodifica
// y parsea las líneas que contienen «verifica» (las únicas que pueden ser `verificado` o
// `verificacion_fallida`); guarda la línea a medias del final hasta que se complete y vuelve a
// empezar si el archivo encoge o es otro (rotado). El resultado es el mismo que interpretar el
// archivo entero de una vez.

/** Tamaño de cada lectura de `eventos.jsonl`. */
const TROZO_EVENTOS = 1024 * 1024;
/** Una línea a medias más larga que esto no es un evento: se descarta en vez de crecer. */
const MAX_LINEA_A_MEDIAS = 1024 * 1024;
const SALTO = 0x0a;
const MARCA_VERIFICA = Buffer.from("verifica", "utf8");

/** PURA: las líneas completas de `bloque` (sin el salto final) que contienen «verifica». */
export function lineasConVerificacion(bloque: Buffer): string[] {
    const lineas: string[] = [];
    let desde = 0;
    while (desde < bloque.length) {
        const i = bloque.indexOf(MARCA_VERIFICA, desde);
        if (i < 0) break;
        const inicio = i > 0 ? bloque.lastIndexOf(SALTO, i - 1) + 1 : 0;
        let fin = bloque.indexOf(SALTO, i);
        if (fin < 0) fin = bloque.length;
        lineas.push(bloque.subarray(inicio, fin).toString("utf8"));
        desde = fin + 1;
    }
    return lineas;
}

/** Lo que el lector recuerda entre llamadas. */
type MemoriaEventos = {
    ruta: string;
    ino: number;
    offset: number;
    /** Los primeros bytes del archivo: si cambian, lo reescribieron y se lee desde el principio. */
    cabeza: Buffer;
    aMedias: Buffer;
    estado: EstadoVerificaciones;
};

const BYTES_CABEZA = 256;

function memoriaNueva(ruta: string, ino: number): MemoriaEventos {
    return { ruta, ino, offset: 0, cabeza: Buffer.alloc(0), aMedias: Buffer.alloc(0), estado: { tsc: null, vitest: null } };
}

/**
 * Crea un lector de verificaciones de un `eventos.jsonl` que solo lee lo añadido desde la
 * llamada anterior. Lanza si el archivo no existe (quien llama lo traduce a «desconocido»).
 * Las llamadas a la vez comparten la misma lectura. `trozo` solo lo cambian las pruebas.
 */
export function crearLectorVerificaciones(
    opciones: { trozo?: number } = {},
): (ruta: string) => Promise<EstadoVerificaciones> {
    const trozo = Math.max(16, opciones.trozo ?? TROZO_EVENTOS);
    let memoria: MemoriaEventos | null = null;
    let enVuelo: { ruta: string; promesa: Promise<EstadoVerificaciones> } | null = null;

    async function leer(ruta: string): Promise<EstadoVerificaciones> {
        const info = await stat(ruta);
        const ino = Number(info.ino);
        let actual: MemoriaEventos =
            memoria && memoria.ruta === ruta && memoria.ino === ino && info.size >= memoria.offset
                ? memoria
                : memoriaNueva(ruta, ino);
        if (info.size === actual.offset) {
            memoria = actual;
            return actual.estado;
        }
        const archivo = await open(ruta, "r");
        try {
            if (actual.offset > 0 && actual.cabeza.length > 0) {
                const vista = Buffer.alloc(actual.cabeza.length);
                const { bytesRead } = await archivo.read(vista, 0, vista.length, 0);
                if (bytesRead !== vista.length || !vista.equals(actual.cabeza)) actual = memoriaNueva(ruta, ino);
            }
            const buffer = Buffer.allocUnsafe(trozo);
            let { offset, cabeza, aMedias, estado } = actual;
            while (offset < info.size) {
                const { bytesRead } = await archivo.read(buffer, 0, Math.min(trozo, info.size - offset), offset);
                if (bytesRead <= 0) break;
                if (offset === 0) cabeza = Buffer.from(buffer.subarray(0, Math.min(bytesRead, BYTES_CABEZA)));
                offset += bytesRead;
                const leido = buffer.subarray(0, bytesRead);
                const bloque = aMedias.length > 0 ? Buffer.concat([aMedias, leido]) : leido;
                const ultimoSalto = bloque.lastIndexOf(SALTO);
                const resto = ultimoSalto < 0 ? bloque : bloque.subarray(ultimoSalto + 1);
                if (ultimoSalto >= 0) {
                    estado = interpretarComprobaciones(lineasConVerificacion(bloque.subarray(0, ultimoSalto)), estado);
                }
                // Copia: `buffer` se reutiliza en la vuelta siguiente.
                aMedias = resto.length > MAX_LINEA_A_MEDIAS ? Buffer.alloc(0) : Buffer.from(resto);
            }
            memoria = { ruta, ino, offset, cabeza, aMedias, estado };
            return estado;
        } finally {
            await archivo.close();
        }
    }

    return (ruta: string) => {
        if (enVuelo && enVuelo.ruta === ruta) return enVuelo.promesa;
        const anterior = enVuelo?.promesa;
        const promesa = (anterior ? anterior.catch(() => null).then(() => leer(ruta)) : leer(ruta)).finally(() => {
            if (enVuelo?.promesa === promesa) enVuelo = null;
        });
        enVuelo = { ruta, promesa };
        return promesa;
    };
}

/** El lector de Genesis: uno por proceso, así cada petición solo lee lo añadido. */
const lectorVerificaciones = crearLectorVerificaciones();

/** Ejecuta una orden `git` de solo lectura con tope de 15 s; devuelve `stdout` o `""`. */
async function git(args: string[]): Promise<string> {
    try {
        const { stdout } = await execFileAsync("git", args, {
            cwd: raizDelProyecto(),
            timeout: 15_000,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
        });
        return stdout;
    } catch {
        return "";
    }
}

/** Cuenta las revisiones bloqueantes del último informe de revisión, si existe. */
async function obtenerRevisionesBloqueantes(): Promise<number> {
    // El orquestador anota el dictamen en `olas/revisiones.md`; un marcador «bloqueante»
    // o «sí, bloqueante» indica que esa revisión impide publicar. Se cuentan por sección.
    for (const ruta of ["starseed_memory_root/olas/revisiones.md", "olas/revisiones.md"]) {
        try {
            const texto = await readFile(path.join(raizDelProyecto(), ruta), "utf8");
            return texto.split("\n").filter((l) => /bloqueante/i.test(l)).length;
        } catch {
            // se prueba la siguiente ruta
        }
    }
    return 0;
}

/**
 * Lee el último `verificado`/`verificacion_fallida` de `eventos.jsonl` y traduce a comprobaciones.
 * (SUP0511A) Nunca lo lee entero: el lector incremental solo lee lo añadido desde la última vez.
 */
async function leerComprobaciones(): Promise<Comprobaciones> {
    let resultado = { tsc: "desconocido", vitest: "desconocido" } as Comprobaciones;
    // Las revisiones bloqueantes se leen aparte (archivo de texto, no el jsonl).
    const bloqueantes = await obtenerRevisionesBloqueantes();
    try {
        const interpretado = await lectorVerificaciones(path.join(raizDelProyecto(), ARCHIVO_EVENTOS));
        resultado = {
            tsc: interpretado.tsc ?? "desconocido",
            vitest: interpretado.vitest ?? "desconocido",
            revisionesBloqueantes: bloqueantes,
        };
    } catch {
        resultado = { tsc: "desconocido", vitest: "desconocido", revisionesBloqueantes: bloqueantes };
    }
    return resultado;
}

/**
 * Reúne el estado de publicación: rama, HEAD, commits sin publicar (respecto a
 * `origin/main`), archivos y áreas tocadas, comprobaciones y el comando exacto.
 * TODO es solo lectura de git y de disco; nunca ejecuta push ni despliegues.
 */
export async function leerPublicacion(): Promise<EstadoPublicacion> {
    const [rama, head, sinPublicarRaw, logRaw, diffRaw, archivosRaw, comprobaciones] =
        await Promise.all([
            git(["rev-parse", "--abbrev-ref", "HEAD"]),
            git(["rev-parse", "--short", "HEAD"]),
            git(["rev-list", "--count", "origin/main..HEAD"]),
            git(["log", "--format=%h%x09%s", "origin/main..HEAD"]),
            git(["diff", "--stat", "origin/main..HEAD"]),
            git(["diff", "--name-only", "origin/main..HEAD"]),
            leerComprobaciones(),
        ]);

    const sinPublicar = Number.parseInt(sinPublicarRaw.trim(), 10);
    const commits: CommitPublicacion[] = logRaw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
            const [sha = "", asunto = ""] = l.split("\t");
            return { sha, titulo: asunto, ola: olaDeAsunto(asunto) };
        });

    const rutasArchivos = archivosRaw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const archivosCambiados = rutasArchivos.length;
    // La suma de cambios la da `git diff --shortstat`; si no hay, 0.
    const suma = /(\d+)\s+files? changed/.exec(diffRaw);
    void suma;

    return {
        generadoEn: new Date().toISOString(),
        rama: rama.trim() || null,
        head: head.trim() || null,
        sinPublicar: Number.isFinite(sinPublicar) ? sinPublicar : 0,
        commits,
        archivosCambiados,
        areas: contarAreas(rutasArchivos),
        comprobaciones,
        comando: COMANDO_PUSH,
    };
}

/**
 * Escribe `publicacion-pendiente.json` con todo el estado, la nota y la fecha,
 * y devuelve ese manifiesto. NO hace push: solo deja constancia para que Alex
 * acepte y publique desde su terminal.
 */
export async function prepararPublicacion(nota: string): Promise<ManifiestoPublicacion> {
    const estado = await leerPublicacion();
    const manifiesto: ManifiestoPublicacion = {
        ...estado,
        nota: nota.trim(),
        fecha: new Date().toISOString(),
        archivo: ARCHIVO_MANIFIESTO,
    };
    const rutaAbsoluta = path.join(raizDelProyecto(), ARCHIVO_MANIFIESTO);
    await mkdir(path.dirname(rutaAbsoluta), { recursive: true });
    await writeFile(rutaAbsoluta, JSON.stringify(manifiesto, null, 2), "utf8");
    return manifiesto;
}