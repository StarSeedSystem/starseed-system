/**
 * Las tareas INTEGRADAS, contadas desde `main` y no desde lo que alguien anotó.
 *
 * (2026-09-23) Alex: «aún tampoco aparece la información correcta de muchos medidores, como
 * la de las tareas integradas con su información de los cambios y enlaces a las funciones
 * implementadas en su estado actual». La pastilla «Integradas» era un número sin ventana, y
 * `progreso.json` no sirve para abrirla: de 425 tareas en «commit», solo 194 tienen `sha` y
 * de las más recientes NINGUNO de esos sha está en `main` («reconcilia», o el commit
 * salvavidas de la rama). La verdad está en `main`: cada tarea integrada deja commits cuyo
 * asunto lleva su id —`Ola 237 · … · DEDUPE: título` y `salvavidas · DEDUPE: trabajo…`—, y el
 * código de verdad suele venir en el salvavidas, no en el de integración (que a veces va
 * vacío). Así que se juntan TODOS los commits de la tarea.
 *
 * Todo aquí es PURO: entra texto de git y el contenido de los archivos tal y como están hoy,
 * sale la lista. La ruta es quien llama a git y lee el disco.
 */

export interface ArchivoCambiado {
    ruta: string;
    mas: number;
    menos: number;
}

export interface Definicion {
    ruta: string;
    nombre: string;
    tipo: "función" | "clase" | "tipo" | "constante";
}

export interface CommitDeTarea {
    sha: string;
    fecha: string;
    asunto: string;
    /** «integración» o «trabajo del agente» (el salvavidas). */
    clase: "integración" | "trabajo del agente";
    archivos: ArchivoCambiado[];
    definiciones: Definicion[];
}

export interface Integrada {
    id: string;
    titulo: string;
    ola?: string;
    fecha: string;
    commits: CommitDeTarea[];
}

/** Dónde vive HOY cada cosa implementada: la línea en `main`, o que ya no está. */
export interface Ubicacion {
    ruta: string;
    nombre: string;
    tipo: Definicion["tipo"];
    linea: number | null;
}

/**
 * Del asunto de un commit a la tarea que integra. `conocidas` son los ids que existen de
 * verdad (progreso y colas): sin ese filtro, «mando: dos procesos…» contaría como la tarea
 * «mando».
 */
export function tareaDeAsunto(
    asunto: string,
    conocidas: Set<string>,
): { id: string; ola?: string; titulo: string; salvavidas: boolean } | null {
    const m = /^(?:(.*?)\s*·\s*)?([A-Za-z][A-Za-z0-9_-]{0,23})\s*:\s*(.*)$/.exec(asunto.trim());
    if (!m) return null;
    const [, prefijo, id, resto] = m;
    if (!conocidas.has(id)) return null;
    const salvavidas = (prefijo ?? "").trim().toLowerCase() === "salvavidas";
    return {
        id,
        ola: salvavidas ? undefined : prefijo?.trim() || undefined,
        titulo: salvavidas ? "" : resto.trim(),
        salvavidas,
    };
}

const PATRONES: { re: RegExp; tipo: Definicion["tipo"] }[] = [
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, tipo: "función" },
    { re: /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, tipo: "función" },
    { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, tipo: "clase" },
    { re: /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, tipo: "tipo" },
    { re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, tipo: "función" },
    { re: /^\s*class\s+([A-Za-z_]\w*)\s*[(:]/, tipo: "clase" },
];

/** ¿Esta línea de código define algo con nombre? PURA. */
export function definicionDeLinea(linea: string): { nombre: string; tipo: Definicion["tipo"] } | null {
    for (const { re, tipo } of PATRONES) {
        const m = re.exec(linea);
        if (m) return { nombre: m[1], tipo };
    }
    return null;
}

const ES_CODIGO = /\.(tsx?|jsx?|mjs|cjs|py)$/;
/** Lo que no es producto: memoria, colas y registros que el enjambre escribe solo. */
const RUIDO = /^(starseed_memory_root|enjambre\/colas)\//;

/**
 * Lee la salida de
 *   git show --numstat -U0 --no-color --format=%x1e%H%x1f%cI%x1f%s <sha…>
 * y devuelve cada commit con sus archivos (+/−) y lo que DEFINE en las líneas que añadió.
 * PURA.
 */
export function parsearCommits(salida: string): Omit<CommitDeTarea, "clase">[] {
    const fuera: Omit<CommitDeTarea, "clase">[] = [];
    for (const bloque of salida.split("\x1e")) {
        if (!bloque.trim()) continue;
        const nl = bloque.indexOf("\n");
        const cabecera = nl === -1 ? bloque : bloque.slice(0, nl);
        const cuerpo = nl === -1 ? "" : bloque.slice(nl + 1);
        const [sha, fecha, asunto] = cabecera.split("\x1f");
        if (!sha) continue;
        const archivos: ArchivoCambiado[] = [];
        const definiciones: Definicion[] = [];
        let rutaActual = "";
        for (const l of cuerpo.split("\n")) {
            const num = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l);
            if (num) {
                const ruta = num[3].trim();
                if (!RUIDO.test(ruta)) {
                    archivos.push({
                        ruta,
                        mas: num[1] === "-" ? 0 : Number(num[1]),
                        menos: num[2] === "-" ? 0 : Number(num[2]),
                    });
                }
                continue;
            }
            if (l.startsWith("+++ ")) {
                rutaActual = l.replace(/^\+\+\+ (?:b\/)?/, "").trim();
                continue;
            }
            if (l.startsWith("+") && !l.startsWith("+++") && ES_CODIGO.test(rutaActual) && !RUIDO.test(rutaActual)) {
                const d = definicionDeLinea(l.slice(1));
                if (d && !definiciones.some((x) => x.ruta === rutaActual && x.nombre === d.nombre)) {
                    definiciones.push({ ruta: rutaActual, ...d });
                }
            }
        }
        fuera.push({ sha, fecha: fecha ?? "", asunto: asunto ?? "", archivos, definiciones });
    }
    return fuera;
}

/**
 * De la lista de asuntos de `main` (`%H\x1f%cI\x1f%s` por línea, del más nuevo al más viejo)
 * a los commits de cada tarea integrada, las más recientes primero. PURA.
 */
export function tareasIntegradasEnMain(
    lineas: string,
    conocidas: Set<string>,
): { id: string; ola?: string; titulo: string; fecha: string; commits: { sha: string; salvavidas: boolean }[] }[] {
    const porId = new Map<
        string,
        { id: string; ola?: string; titulo: string; fecha: string; commits: { sha: string; salvavidas: boolean }[] }
    >();
    for (const linea of lineas.split("\n")) {
        const [sha, fecha, asunto] = linea.split("\x1f");
        if (!sha || !asunto) continue;
        const t = tareaDeAsunto(asunto, conocidas);
        if (!t) continue;
        const previa = porId.get(t.id);
        if (!previa) {
            porId.set(t.id, {
                id: t.id,
                ola: t.ola,
                titulo: t.titulo,
                fecha: fecha ?? "",
                commits: [{ sha, salvavidas: t.salvavidas }],
            });
        } else {
            previa.commits.push({ sha, salvavidas: t.salvavidas });
            if (!previa.ola && t.ola) previa.ola = t.ola;
            if (!previa.titulo && t.titulo) previa.titulo = t.titulo;
        }
    }
    return [...porId.values()];
}

/**
 * Dónde está HOY cada definición: se busca en el archivo tal y como está en `main`. Si no
 * aparece, `linea` es null y la ficha lo dice: la enlazaría a un sitio que ya no existe. PURA.
 */
export function ubicarDefiniciones(
    definiciones: Definicion[],
    contenidoActual: (ruta: string) => string | null,
): Ubicacion[] {
    const cache = new Map<string, string[] | null>();
    return definiciones.map((d) => {
        if (!cache.has(d.ruta)) {
            const c = contenidoActual(d.ruta);
            cache.set(d.ruta, c === null ? null : c.split("\n"));
        }
        const lineas = cache.get(d.ruta);
        let linea: number | null = null;
        if (lineas) {
            const i = lineas.findIndex((l) => definicionDeLinea(l)?.nombre === d.nombre);
            if (i >= 0) linea = i + 1;
        }
        return { ...d, linea };
    });
}

/** «+120 −4 en 3 archivos». PURA. */
export function resumenDeCambios(archivos: ArchivoCambiado[]): string {
    const unicos = new Map<string, ArchivoCambiado>();
    for (const a of archivos) {
        const p = unicos.get(a.ruta);
        unicos.set(a.ruta, p ? { ruta: a.ruta, mas: p.mas + a.mas, menos: p.menos + a.menos } : { ...a });
    }
    const mas = [...unicos.values()].reduce((n, a) => n + a.mas, 0);
    const menos = [...unicos.values()].reduce((n, a) => n + a.menos, 0);
    return unicos.size
        ? `+${mas} −${menos} en ${unicos.size} archivo${unicos.size === 1 ? "" : "s"}`
        : "sin cambios de código (solo memoria o registros)";
}
