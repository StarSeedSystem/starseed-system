/**
 * Publicación del Puente de Mando (Ola 239 · «Pestaña Publicar»)
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
import { readFile, writeFile, mkdir } from "node:fs/promises";
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
 */
export function interpretarComprobaciones(
    lineas: string[],
): { tsc: "ok" | "falla" | null; vitest: "ok" | "falla" | null } {
    let tsc: "ok" | "falla" | null = null;
    let vitest: "ok" | "falla" | null = null;
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

/** Lee el último `verificado`/`verificacion_fallida` de `eventos.jsonl` y traduce a comprobaciones. */
async function leerComprobaciones(): Promise<Comprobaciones> {
    let resultado = { tsc: "desconocido", vitest: "desconocido" } as Comprobaciones;
    // Las revisiones bloqueantes se leen aparte (archivo de texto, no el jsonl).
    const bloqueantes = await obtenerRevisionesBloqueantes();
    try {
        const crudo = await readFile(path.join(raizDelProyecto(), ARCHIVO_EVENTOS), "utf8");
        const interpretado = interpretarComprobaciones(crudo.split("\n"));
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