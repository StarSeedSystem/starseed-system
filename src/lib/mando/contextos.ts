/**
 * Contextos por agente del Centro de Mando (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * El orquestador del enjambre deja, por cada tarea, un archivo JSON en la carpeta
 * `starseed_memory_root/olas/contextos/` con la forma:
 *
 *   {
 *     "tarea": "…", "ola": "…", "titulo": "…",
 *     "archivos": ["…"], "t": "…", "caracteres": 0,
 *     "secciones": { "<CABECERA>": "<texto>", … }
 *   }
 *
 * donde las cabeceras de `secciones` son literalmente «ÁREA», «LEE ANTES estos
 * documentos del repositorio (mandan sobre tu criterio)», «REGLA DEL ÁREA»,
 * «HABILIDADES disponibles en la máquina (carpetas .agent/skills y
 * ~/.hermes/skills)», «FUENTES EXTERNAS para esta tarea …», «CONEXIONES vivas»,
 * «DÓNDE VAMOS (relevo)» y «ÚLTIMA REVISIÓN DE ESTOS ARCHIVOS …» (puede faltar
 * cualquiera).
 *
 * Este lector normaliza esas secciones a los campos tipados de `ContextoAgente`:
 * los documentos se parten por comas, las habilidades por comas y las fuentes
 * externas por líneas que empiecen con «- ».
 *
 * ⚠️ Seguridad: módulo solo de servidor. NUNCA devuelve claves, tokens ni rutas
 * absolutas del disco; los textos de las secciones se pasan tal cual (son
 * instrucciones de tarea, no datos sensibles).
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";

/** Contexto que recibió cada tarea del enjambre (normalizado desde `contextos/<id>.json`). */
export interface ContextoAgente {
    /** Id de la tarea (mismo que en la cola de olas). */
    tarea: string;
    /** Ola a la que pertenece la tarea. */
    ola: string;
    /** Título humano de la tarea. */
    titulo: string;
    /** Archivos implicados por la tarea (rutas relativas al repositorio). */
    archivos: string[];
    /** Marca temporal del contexto (para ordenar por lo más reciente). */
    t: string;
    /** Tamaño del contexto en caracteres (lo que midió el orquestador). */
    caracteres: number;
    /** Sección «ÁREA». */
    area: string;
    /** Sección «LEE ANTES…», partida por comas. */
    documentos: string[];
    /** Sección «REGLA DEL ÁREA», una regla por línea. */
    reglas: string[];
    /** Sección «HABILIDADES…», partida por comas. */
    habilidades: string[];
    /** Sección «FUENTES EXTERNAS…», una por línea «- …». */
    fuentes: string[];
    /** Sección «CONEXIONES vivas». */
    conexiones: string;
    /** Sección «DÓNDE VAMOS (relevo)». */
    relevo: string;
    /** Sección «ÚLTIMA REVISIÓN DE ESTOS ARCHIVOS …». */
    revisionPrevia: string;
}

/** Raíz del repositorio (en Next.js `process.cwd()` apunta al proyecto). */
const RAÍZ = raizDelProyecto();

/** True si un texto tiene contenido más allá de espacios. */
function tieneTexto(s: string): boolean {
    return s.trim().length > 0;
}

/** Convierte un valor en texto seguro (nunca `any`). */
function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/** Lee un objeto plano de forma tolerante. */
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};
}

/** Valor numérico seguro: devuelve `alternativo` si `v` no es un número finito. */
function número(v: unknown, alternativo: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : alternativo;
}

/** Convierte un valor en lista de cadenas, ignorando vacíos. */
function listaDeCadenas(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) => texto(x))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Parte una cadena por comas, recortando espacios y descartando vacíos. */
function porComas(v: string): string[] {
    return v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Parte una cadena por líneas, recortando y descartando vacías. */
function porLineas(v: string): string[] {
    return v
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Líneas que empiezan por «- » (fuentes externas), sin el guion inicial. */
function porGuiones(v: string): string[] {
    return v
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.startsWith("- "))
        .map((s) => s.slice(2).trim())
        .filter((s) => s.length > 0);
}

/**
 * Normaliza una cabecera para poder compararlas sin importar tildes, mayúsculas,
 * paréntesis ni puntuación: «LEE ANTES estos documentos del repositorio (mandan
 * sobre tu criterio)» → `leeantesestosdocumentosdelrepositoriomandansobretucriterio`.
 */
function normalizarCabecera(cabecera: string): string {
    return cabecera
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Devuelve el valor de la primera sección cuya cabecera normalizada cumple el
 * predicado, o `""` si ninguna. `lectorLocal` permite cabeceras ligeramente
 * distintas según el orquestador, así que se busca por coincidencia de término
 * (p. ej. «area» exacto para ÁREA, «regla» para REGLA DEL ÁREA).
 */
function seccion(
    secciones: Record<string, unknown>,
    es: (normal: string) => boolean,
): string {
    for (const [cabecera, valor] of Object.entries(secciones)) {
        if (es(normalizarCabecera(cabecera))) return texto(valor);
    }
    return "";
}

/**
 * Resuelve la carpeta de olas (`starseed_memory_root/olas` por defecto, con
 * `olas` como alternativa), igual que `directorioOlas()` de `lector-local.ts`.
 */
let olasResuelta: string | null = null;
async function directorioOlas(): Promise<string> {
    if (olasResuelta) return olasResuelta;
    for (const candidata of ["starseed_memory_root/olas", "olas"]) {
        try {
            await readdir(path.join(RAÍZ, candidata));
            olasResuelta = candidata;
            return candidata;
        } catch {
            // se prueba la siguiente candidata
        }
    }
    olasResuelta = "starseed_memory_root/olas";
    return olasResuelta;
}

/** Lee el JSON de un contexto de forma tolerante (null si no existe o está corrupto). */
async function leerContexto(rutaRelativa: string): Promise<Record<string, unknown> | null> {
    try {
        const contenido = await readFile(path.join(RAÍZ, rutaRelativa), "utf-8");
        return objeto(JSON.parse(contenido) as unknown);
    } catch {
        return null;
    }
}

/**
 * Lee todos los contextos de `starseed_memory_root/olas/contextos/` y los
 * normaliza a `ContextoAgente[]`, ordenados por `t` descendente (más reciente
 * primero). Tolerante: si la carpeta no existe o un archivo está corrupto, se
 * salta sin romper el mando.
 */
export async function leerContextos(): Promise<ContextoAgente[]> {
    const dirOlas = await directorioOlas();
    const dirContextos = `${dirOlas}/contextos`;
    let nombres: string[];
    try {
        nombres = (await readdir(path.join(RAÍZ, dirContextos))).filter((n) =>
            n.endsWith(".json"),
        );
    } catch {
        return [];
    }

    const contextos: ContextoAgente[] = [];
    for (const nombre of nombres) {
        const datos = await leerContexto(`${dirContextos}/${nombre}`);
        if (!datos) continue;

        const secciones = objeto(datos.secciones);
        const area = seccion(secciones, (n) => n === "area");
        const reglas = porLineas(seccion(secciones, (n) => n.includes("regla")));
        const documentos = porComas(
            seccion(secciones, (n) => n.includes("documentos")),
        );
        const habilidades = porComas(
            seccion(secciones, (n) => n.includes("habilidades")),
        );
        const fuentes = porGuiones(
            seccion(secciones, (n) => n.includes("fuentesexternas")),
        );

        contextos.push({
            tarea: texto(datos.tarea),
            ola: texto(datos.ola),
            titulo: texto(datos.titulo),
            archivos: listaDeCadenas(datos.archivos),
            t: texto(datos.t),
            caracteres: número(datos.caracteres, 0),
            area,
            documentos,
            reglas,
            habilidades,
            fuentes,
            conexiones: seccion(secciones, (n) => n.includes("conexionesvivas")),
            relevo: seccion(secciones, (n) => n.includes("dondevamos")),
            revisionPrevia: seccion(secciones, (n) => n.includes("ultimarevision")),
        });
    }

    return contextos.sort((a, b) => (a.t > b.t ? -1 : a.t < b.t ? 1 : 0));
}