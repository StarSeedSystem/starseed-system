/**
 * Memorias del Puente de Mando — lectura de disco (solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reúne, en las ocho capas de `memorias.ts`, todo lo que StarSeed OS recuerda:
 * el núcleo (principios/instrucciones), la memoria del proyecto, los informes
 * de relevo, los aprendizajes, los recuerdos por tarea (transversal), las
 * preferencias/configuración, los agentes externos (Hermes, mem0, Cognee,
 * Letta, Astraura) y las versiones/enlaces/medios del propio OS.
 *
 * Cada fuente es OPCIONAL: un directorio que no existe da lista vacía, un
 * archivo que no se puede leer se salta, un JSON corrupto se ignora. Nunca
 * lanza y nunca deja media consola caída porque a Alex le falte una carpeta
 * en esta máquina en concreto.
 *
 * ⚠️ Seguridad (innegociable):
 *  • `debeOmitirArchivo` descarta ENTERO cualquier archivo cuyo NOMBRE huela
 *    a secreto, antes de leer una sola línea (nunca se abre `~/.starseed/env`).
 *  • Todo lo demás pasa por `redactarTexto` antes de salir de este módulo.
 *  • Las rutas fuera del repositorio se etiquetan como pseudo-rutas `~/...`;
 *    la ruta ABSOLUTA real del disco del usuario nunca sale de este archivo.
 *  • Cada archivo se acota a 2 MB antes de leerlo (nada de vídeos ni audios) y
 *    cada resumen/preview a ~4 KB (`recortarTexto`); el detalle completo se
 *    acota a 200 KB. Solo local: la ruta `/api/mando/memorias` la protege
 *    `guardianMando` (404 fuera de local/STARSEED_MANDO), igual que el resto.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";
import { serviciosConocidos } from "@/lib/mando/entornos";
import { OS_CANAL, OS_FECHA, OS_VERSION } from "@/lib/version/os-release";
import {
    construirBacklinks,
    construirCapas,
    construirGrafo,
    construirIndice,
    debeOmitirArchivo,
    etiquetasDe,
    extraerResumen,
    extraerTitulo,
    extraerVinculos,
    filtrarCapasPorBusqueda,
    masRecientes,
    recortarTexto,
    redactarTexto,
    resolverVinculos,
    rutaSegura,
    seleccionarRecuerdosDeTarea,
    type ArchivoMemoria,
    type DetalleArchivoMemoria,
    type IdCapa,
    type RespuestaMemorias,
} from "@/lib/mando/memorias";

const RAÍZ = raizDelProyecto();

/** Nada de leer archivos gigantes (medios, binarios, bases de datos sqlite). */
const TAMANO_MAX_ARCHIVO = 2 * 1024 * 1024;
/** Tope del resumen/preview que va en la lista (cabe de sobra en el presupuesto de 1,5 MB). */
const LIMITE_RESUMEN = 400;
/** Tope del texto completo en la vista de detalle. */
const LIMITE_DETALLE = 200_000;
/** Cuántos vínculos como mucho se extraen por archivo. */
const LIMITE_VINCULOS = 40;
/** Cuántos archivos como mucho se leen de un mismo directorio externo (defensa ante árboles enormes). */
const TOPE_ARCHIVOS_POR_FUENTE = 150;

const ORIGENES: Partial<Record<IdCapa, string>> = {
    nucleo: "Raíz del repositorio: CLAUDE.md, AGENTS.md, PUENTE-DE-MANDO.md, DESIGN.md, README.md.",
    proyecto: "memory/*.md",
    relevo: "relevo/ y starseed_memory_root/relevo/",
    aprendizajes: "memory/aprendizaje-olas.md, starseed_memory_root/aprendizaje/ y starseed_memory_root/verificaciones/",
    "recuerdos-tarea": "Referencias cruzadas a tareas y olas encontradas en el resto de capas.",
    preferencias: "~/.starseed/*.json y starseed_memory_root/mando/*.json",
    "agentes-externos": "~/.hermes, ~/.mem0, ~/.cognee, ~/.letta, ~/.astraura y el backend de Astraura 1.58-bit.",
    programas: "Versión del OS (package.json, tauri.conf.json), servicios registrados y carpetas de medios.",
};

// ─── Lectura de un archivo ──────────────────────────────────────────────────

interface LecturaArchivo {
    /** Pseudo-ruta segura para el cliente (relativa al repo, o `~/...`). */
    ruta: string;
    titulo: string;
    tamano: number;
    actualizado: string;
    resumen: string;
    vinculos: string[];
    /** Texto completo YA redactado y acotado, para la vista de detalle. */
    textoCompleto: string;
    redactado: boolean;
}

/** Lee y normaliza un archivo de memoria. `null` si no existe, es un directorio, pesa demasiado o su nombre lo prohíbe. */
async function leerArchivoMemoria(absoluta: string, rutaEtiqueta: string): Promise<LecturaArchivo | null> {
    const nombre = path.basename(absoluta);
    // Se pasa la RUTA (no solo el nombre) para que la carpeta también cuente:
    // `~/.astraura/keys/agent_apis.json` se omite por vivir en `keys/`, aunque
    // su nombre de archivo por sí solo no diga nada.
    if (debeOmitirArchivo(absoluta)) return null;

    let info;
    try {
        info = await stat(absoluta);
    } catch {
        return null;
    }
    if (!info.isFile() || info.size > TAMANO_MAX_ARCHIVO) return null;

    let crudo: string;
    try {
        crudo = await readFile(absoluta, "utf-8");
    } catch {
        return null;
    }

    const textoRedactado = redactarTexto(crudo);
    return {
        ruta: rutaEtiqueta,
        titulo: extraerTitulo(textoRedactado, nombre),
        tamano: info.size,
        actualizado: info.mtime.toISOString(),
        resumen: extraerResumen(textoRedactado, LIMITE_RESUMEN),
        vinculos: extraerVinculos(textoRedactado, LIMITE_VINCULOS),
        textoCompleto: recortarTexto(textoRedactado, LIMITE_DETALLE),
        redactado: textoRedactado !== crudo,
    };
}

function aArchivoMemoria(l: LecturaArchivo, capa: IdCapa): ArchivoMemoria {
    return {
        ruta: l.ruta,
        titulo: l.titulo,
        tamano: l.tamano,
        actualizado: l.actualizado,
        resumen: l.resumen,
        vinculos: l.vinculos,
        etiquetas: etiquetasDe({ ruta: l.ruta, redactado: l.redactado, vinculos: l.vinculos }),
        capa,
    };
}

// ─── Directorios ────────────────────────────────────────────────────────────

interface OpcionesListado {
    extensiones?: string[];
    /** Solo archivos cuyo nombre empiece por este prefijo. */
    prefijo?: string;
    recursivo?: boolean;
    profundidadMax?: number;
}

/** Lista archivos de un directorio (tolerante: no existe → `[]`). Nunca lanza. */
async function listarDirectorio(dirAbs: string, opciones: OpcionesListado = {}): Promise<string[]> {
    const { extensiones = [".md"], prefijo, recursivo = false, profundidadMax = 2 } = opciones;
    const resultado: string[] = [];

    async function recorrer(dir: string, profundidad: number): Promise<void> {
        if (resultado.length >= TOPE_ARCHIVOS_POR_FUENTE) return;
        let entradas;
        try {
            entradas = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entradas) {
            if (resultado.length >= TOPE_ARCHIVOS_POR_FUENTE) return;
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (recursivo && profundidad < profundidadMax) await recorrer(abs, profundidad + 1);
                continue;
            }
            if (!e.isFile()) continue;
            if (prefijo && !e.name.startsWith(prefijo)) continue;
            if (extensiones.length > 0 && !extensiones.includes(path.extname(e.name).toLowerCase())) continue;
            resultado.push(abs);
        }
    }

    await recorrer(dirAbs, 0);
    return resultado;
}

/** Lee todos los archivos de un directorio como memorias de una capa (best-effort, tolerante). */
async function lecturasDeDirectorio(
    dirAbs: string,
    etiquetaBase: string,
    opciones: OpcionesListado = {},
): Promise<LecturaArchivo[]> {
    const rutas = await listarDirectorio(dirAbs, opciones);
    const lecturas: LecturaArchivo[] = [];
    for (const abs of rutas) {
        const relativa = path.relative(dirAbs, abs).split(path.sep).join("/");
        const etiqueta = etiquetaBase ? `${etiquetaBase}/${relativa}` : relativa;
        const l = await leerArchivoMemoria(abs, etiqueta);
        if (l) lecturas.push(l);
    }
    return lecturas;
}

// ─── Capas reales (archivos en disco) ───────────────────────────────────────

/** «Núcleo»: principios e instrucciones en la raíz del repositorio. */
async function lecturasNucleo(): Promise<LecturaArchivo[]> {
    const nombres = ["CLAUDE.md", "AGENTS.md", "PUENTE-DE-MANDO.md", "DESIGN.md", "README.md"];
    const salida: LecturaArchivo[] = [];
    for (const nombre of nombres) {
        const l = await leerArchivoMemoria(path.join(RAÍZ, nombre), nombre);
        if (l) salida.push(l);
    }
    return salida;
}

/** «Proyecto»: `memory/*.md`. */
async function lecturasProyecto(): Promise<LecturaArchivo[]> {
    return lecturasDeDirectorio(path.join(RAÍZ, "memory"), "memory", { extensiones: [".md"] });
}

/** «Relevo e informes»: informes de cierre y bitácora, en las dos carpetas donde han vivido. */
async function lecturasRelevo(): Promise<LecturaArchivo[]> {
    const [a, b] = await Promise.all([
        lecturasDeDirectorio(path.join(RAÍZ, "relevo"), "relevo", { extensiones: [".md"] }),
        lecturasDeDirectorio(path.join(RAÍZ, "starseed_memory_root", "relevo"), "starseed_memory_root/relevo", {
            extensiones: [".md"],
        }),
    ]);
    return [...a, ...b];
}

/** «Aprendizajes»: el corpus de aprendizaje continuo y las verificaciones. */
async function lecturasAprendizajes(): Promise<LecturaArchivo[]> {
    const explicito = await leerArchivoMemoria(
        path.join(RAÍZ, "memory", "aprendizaje-olas.md"),
        "memory/aprendizaje-olas.md",
    );
    const [aprendizaje, verificaciones] = await Promise.all([
        lecturasDeDirectorio(path.join(RAÍZ, "starseed_memory_root", "aprendizaje"), "starseed_memory_root/aprendizaje", {
            extensiones: [".md"],
            recursivo: true,
            profundidadMax: 1,
        }),
        lecturasDeDirectorio(
            path.join(RAÍZ, "starseed_memory_root", "verificaciones"),
            "starseed_memory_root/verificaciones",
            { extensiones: [".md"], recursivo: true, profundidadMax: 1 },
        ),
    ]);
    return [...(explicito ? [explicito] : []), ...aprendizaje, ...verificaciones];
}

/** «Preferencias y configuración»: `~/.starseed/*.json` (nunca `env`) y `starseed_memory_root/mando/*.json`. */
async function lecturasPreferencias(): Promise<LecturaArchivo[]> {
    const [starseed, mando] = await Promise.all([
        lecturasDeDirectorio(path.join(homedir(), ".starseed"), "~/.starseed", { extensiones: [".json"] }),
        lecturasDeDirectorio(path.join(RAÍZ, "starseed_memory_root", "mando"), "starseed_memory_root/mando", {
            extensiones: [".json"],
        }),
    ]);
    return [...starseed, ...mando];
}

/** «Agentes externos»: memorias de Hermes, mem0, Cognee, Letta y el backend de Astraura, fuera del repositorio. */
async function lecturasAgentesExternos(): Promise<LecturaArchivo[]> {
    const home = homedir();
    const fuentes: { etiqueta: string; dirAbs: string }[] = [
        { etiqueta: "~/.hermes", dirAbs: path.join(home, ".hermes") },
        { etiqueta: "~/.mem0", dirAbs: path.join(home, ".mem0") },
        { etiqueta: "~/.cognee", dirAbs: path.join(home, ".cognee") },
        { etiqueta: "~/.letta", dirAbs: path.join(home, ".letta") },
        { etiqueta: "~/.astraura", dirAbs: path.join(home, ".astraura") },
        {
            etiqueta: "~/Documents/IA 1.58 bit/backend/data",
            dirAbs: path.join(home, "Documents", "IA 1.58 bit", "backend", "data"),
        },
        {
            etiqueta: "~/Documents/IA 1.58 bit/backend/memory",
            dirAbs: path.join(home, "Documents", "IA 1.58 bit", "backend", "memory"),
        },
    ];

    const listas = await Promise.all(
        fuentes.map((f) =>
            lecturasDeDirectorio(f.dirAbs, f.etiqueta, { extensiones: [".md", ".json"], recursivo: true, profundidadMax: 2 }),
        ),
    );
    return listas.flat();
}

// ─── «Programas, enlaces, medios y versiones» (capa sintética) ─────────────

async function leerJsonSeguro(absoluta: string): Promise<Record<string, unknown> | null> {
    try {
        const contenido = await readFile(absoluta, "utf-8");
        const datos = JSON.parse(contenido) as unknown;
        return typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

async function contarArchivos(dirAbs: string): Promise<number | null> {
    try {
        const entradas = await readdir(dirAbs, { withFileTypes: true });
        return entradas.filter((e) => e.isFile()).length;
    } catch {
        return null;
    }
}

/** Entrada sintética (no es un archivo real): versión, servicio o recuento de una carpeta de medios. */
function entradaSintetica(
    ruta: string,
    titulo: string,
    resumen: string,
    etiquetas: string[],
    actualizado: string,
): ArchivoMemoria {
    return { ruta, titulo, tamano: 0, actualizado, resumen, vinculos: [], etiquetas, capa: "programas", sintetico: true };
}

async function capaProgramas(): Promise<ArchivoMemoria[]> {
    const ahora = new Date().toISOString();
    const archivos: ArchivoMemoria[] = [];

    const [pkg, tauri] = await Promise.all([
        leerJsonSeguro(path.join(RAÍZ, "package.json")),
        leerJsonSeguro(path.join(RAÍZ, "native", "src-tauri", "tauri.conf.json")),
    ]);
    const versiones = [`StarSeed OS ${OS_VERSION} (${OS_FECHA}, canal ${OS_CANAL})`];
    if (pkg && typeof pkg.version === "string") versiones.push(`package.json ${pkg.version}`);
    if (tauri && typeof tauri.version === "string") versiones.push(`Nativo (Tauri) ${tauri.version}`);
    archivos.push(
        entradaSintetica("version:os", "Versiones de StarSeed OS", versiones.join(" · "), ["version"], ahora),
    );

    for (const s of serviciosConocidos()) {
        const resumen = [s.url, s.enlacePanel, s.nota].filter((v): v is string => Boolean(v)).join(" · ");
        archivos.push(entradaSintetica(`servicio:${s.id}`, s.nombre, resumen, ["servicio", s.tipo], ahora));
    }

    const carpetasMedios = ["media", "creaciones", "publicaciones", "exports", "respaldos"];
    for (const carpeta of carpetasMedios) {
        const cuenta = await contarArchivos(path.join(RAÍZ, "starseed_memory_root", carpeta));
        if (cuenta === null) continue;
        archivos.push(
            entradaSintetica(
                `medios:${carpeta}`,
                `Carpeta ${carpeta}`,
                `${cuenta} archivo(s) en starseed_memory_root/${carpeta}.`,
                ["medios"],
                ahora,
            ),
        );
    }

    return archivos;
}

// ─── Catálogo completo y respuestas de la API ───────────────────────────────

interface Catalogo {
    /** Todos los archivos REALES (no sintéticos, sin «recuerdos por tarea» todavía). */
    base: ArchivoMemoria[];
    /** ruta → texto completo redactado (para la vista de detalle); solo archivos reales. */
    textos: Map<string, string>;
}

/**
 * Memo corto del catálogo (20 s): abrir una memoria o volver a la pestaña no relee
 * los ~700 archivos cada vez (en la Mac con swap alto eso eran 6-20 s por clic).
 * «Actualizar» lo salta con `forzar`. Nunca guarda nada en disco.
 */
const MEMO_CATALOGO_MS = 20_000;
let memoCatalogo: { en: number; promesa: Promise<Catalogo> } | null = null;

function catalogoBase(forzar = false): Promise<Catalogo> {
    const ahora = Date.now();
    if (!forzar && memoCatalogo && ahora - memoCatalogo.en < MEMO_CATALOGO_MS) return memoCatalogo.promesa;
    const promesa = construirCatalogoBase();
    memoCatalogo = { en: ahora, promesa };
    promesa.catch(() => {
        if (memoCatalogo?.promesa === promesa) memoCatalogo = null;
    });
    return promesa;
}

/** Construye el catálogo base leyendo TODAS las fuentes en paralelo. Nunca lanza. */
async function construirCatalogoBase(): Promise<Catalogo> {
    const grupos: { capa: IdCapa; lecturas: LecturaArchivo[] }[] = await Promise.all([
        lecturasNucleo().then((lecturas) => ({ capa: "nucleo" as const, lecturas })),
        lecturasProyecto().then((lecturas) => ({ capa: "proyecto" as const, lecturas })),
        lecturasRelevo().then((lecturas) => ({ capa: "relevo" as const, lecturas })),
        lecturasAprendizajes().then((lecturas) => ({ capa: "aprendizajes" as const, lecturas })),
        lecturasPreferencias().then((lecturas) => ({ capa: "preferencias" as const, lecturas })),
        lecturasAgentesExternos().then((lecturas) => ({ capa: "agentes-externos" as const, lecturas })),
    ]);

    const base: ArchivoMemoria[] = [];
    const textos = new Map<string, string>();
    for (const { capa, lecturas } of grupos) {
        for (const l of lecturas) {
            base.push(aArchivoMemoria(l, capa));
            textos.set(l.ruta, l.textoCompleto);
        }
    }
    return { base, textos };
}

/** Añade la capa sintética «Programas…» y la capa virtual «Recuerdos por tarea» al catálogo base. */
async function catalogoCompleto(base: ArchivoMemoria[]): Promise<ArchivoMemoria[]> {
    const programas = await capaProgramas();
    const recuerdosTarea = seleccionarRecuerdosDeTarea(base).map((a) => ({ ...a, capa: "recuerdos-tarea" as const }));
    return [...base, ...programas, ...recuerdosTarea];
}

/**
 * Todo lo que sabe el Mando sobre las memorias del proyecto, en las ocho
 * capas de `memorias.ts`. `consulta` (opcional) filtra los archivos de cada
 * capa por título/ruta/resumen — el conteo por capa y las «últimas
 * actualizaciones» siempre reflejan el catálogo COMPLETO, no lo filtrado.
 */
export async function leerMemorias(consulta?: string, forzar = false): Promise<RespuestaMemorias> {
    const { base } = await catalogoBase(forzar);
    const todos = await catalogoCompleto(base);

    const capas = construirCapas(todos, ORIGENES);
    const capasVisibles = consulta && consulta.trim() ? filtrarCapasPorBusqueda(capas, consulta) : capas;

    return {
        capas: capasVisibles,
        ultimasActualizaciones: masRecientes(base, 20),
        grafo: construirGrafo(base),
        totalArchivos: todos.length,
        generadoEn: new Date().toISOString(),
    };
}

/**
 * El detalle de UNA memoria por su `ruta` (tal y como aparece en el catálogo):
 * texto completo redactado, vínculos resueltos (navegables o no) y quién más
 * la menciona («mencionado por»). `{ error: "no encontrado" }` si la ruta no
 * es segura o no está en el catálogo — nunca lee un archivo fuera de él.
 */
export async function leerDetalleArchivo(ruta: string): Promise<DetalleArchivoMemoria | { error: string }> {
    if (!rutaSegura(ruta)) return { error: "no encontrado" };

    const { base, textos } = await catalogoBase();
    const todos = await catalogoCompleto(base);
    const archivo = todos.find((a) => a.ruta === ruta);
    if (!archivo) return { error: "no encontrado" };

    const indice = construirIndice(base);
    const grafo = construirGrafo(base);
    const backlinks = construirBacklinks(grafo);

    return {
        ruta: archivo.ruta,
        titulo: archivo.titulo,
        capa: archivo.capa,
        actualizado: archivo.actualizado,
        tamano: archivo.tamano,
        texto: textos.get(ruta) ?? archivo.resumen,
        vinculosResueltos: resolverVinculos(archivo.vinculos, indice),
        mencionadoPor: backlinks.get(ruta) ?? [],
    };
}
