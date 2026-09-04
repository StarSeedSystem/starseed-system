/**
 * Lectura del estado real del desarrollo (Ola 231 · solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee y normaliza los archivos donde vive el estado del desarrollo y la
 * orquestación multiagéntica. Cada función es TOLERANTE: si el archivo o el
 * directorio no existen, o el JSON está mal formado, devuelve un valor neutral
 * (nunca lanza) para que la consola de mando siga funcionando.
 *
 * ⚠️ Seguridad: este módulo solo debe importarse desde rutas de servidor. Las
 * salidas que llegan al cliente se recortan a rutas RELATIVAS al repositorio y
 * jamás incluyen claves, tokens ni rutas absolutas del disco del usuario.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
    EventoRelevo,
    InformeOla,
    OlaResumen,
    ProveedorUso,
    RelevoEvento,
    RelevoInfo,
    RevisionRef,
    TareaOla,
} from "@/lib/mando/tipos";

/** Raíz del repositorio (en Next.js `process.cwd()` apunta al proyecto). */
const RAÍZ = process.cwd();

/** Texto vacío por defecto cuando falta el archivo. */
const VACÍO = "";

/** Lee un JSON tolerante a que el archivo no exista o esté corrupto. */
async function leerJson(rutaRelativa: string): Promise<unknown | null> {
    try {
        const contenido = await readFile(path.join(RAÍZ, rutaRelativa), "utf-8");
        return JSON.parse(contenido) as unknown;
    } catch {
        return null;
    }
}

/** Lista los archivos que empiezan por un prefijo en un directorio (si existe). */
async function listarArchivos(dirRelativa: string, prefijo: string): Promise<string[]> {
    try {
        const entradas = await readdir(path.join(RAÍZ, dirRelativa), { withFileTypes: true });
        return entradas
            .filter((e) => e.isFile() && e.name.startsWith(prefijo))
            .map((e) => e.name);
    } catch {
        return [];
    }
}

/** Valor numérico seguro: devuelve `alternativo` si `v` no es finito. */
function número(v: unknown, alternativo: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : alternativo;
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

/**
 * Estado de relevo: `starseed_memory_root/relevo/estado.json` más la bitácora
 * `bitacora.jsonl` del mismo directorio (si existe).
 */
export async function leerEstadoRelevo(): Promise<RelevoInfo> {
    const datos = objeto(await leerJson("starseed_memory_root/relevo/estado.json"));

    const git = objeto(datos.git);
    const ultimo = objeto(datos.ultimoRelevo ?? objeto(datos.handoff ?? null));

    const evento: RelevoEvento = {
        de: texto(ultimo.de),
        a: texto(ultimo.a),
        fecha: texto(ultimo.fecha),
        resumen: texto(ultimo.resumen),
    };

    return {
        ultimoRelevo: tieneTexto(evento.de) || tieneTexto(evento.a) ? evento : null,
        actualizado: texto(datos.actualizado),
        adenda: texto(datos.adenda),
        descripcion: texto(datos.descripcion),
        git: {
            head: texto(git.head),
            sinPush: "sinPush" in git ? número(git.sinPush, null as never) : null,
        },
        enjambreActivo: Boolean(datos.enjambreActivo),
        eventos: await leerBitacora(),
    };
}

/** True si un texto tiene contenido más allá de espacios. */
function tieneTexto(s: string): boolean {
    return s.trim().length > 0;
}

/** Lee la bitácora de relevo (`bitacora.jsonl`), una línea JSON por evento. */
async function leerBitacora(): Promise<EventoRelevo[]> {
    let contenido: string;
    try {
        contenido = await readFile(path.join(RAÍZ, "starseed_memory_root/relevo/bitacora.jsonl"), "utf-8");
    } catch {
        return [];
    }

    const eventos: EventoRelevo[] = [];
    for (const linea of contenido.split("\n")) {
        if (!linea.trim()) continue;
        try {
            const bruto = JSON.parse(linea) as unknown;
            const e = objeto(bruto);
            const evento: EventoRelevo = {
                id: texto(e.id ?? e.nodo ?? e.linea),
                t: texto(e.t ?? e.fecha ?? e.timestamp),
                quien: texto(e.quien ?? e.de ?? e.agente),
                tipo: texto(e.tipo),
                tarea: texto(e.tarea),
                texto: texto(e.texto ?? e.resumen ?? e.nota),
            };
            if (tieneTexto(evento.tipo) || tieneTexto(evento.texto)) eventos.push(evento);
        } catch {
            // Línea corrupta: se ignora para no romper el mando.
        }
    }
    return eventos;
}

/** Progreso de olas: `olas/progreso.json`. */
export async function leerProgreso(): Promise<Record<string, unknown>> {
    const datos = await leerJson("olas/progreso.json");
    return typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>) : {};
}

/** Colas de olas: todos los `olas/cola-*.json` → `TareaOla[]`. */
export async function leerColas(): Promise<TareaOla[]> {
    const nombres = await listarArchivos("olas", "cola-");
    const tareas: TareaOla[] = [];

    for (const nombre of nombres) {
        const datos = objeto(await leerJson(`olas/${nombre}`));
        const derps = Array.isArray(datos.dependencias) ? (datos.dependencias as unknown[]) : [];

        const tarea: TareaOla = {
            id: texto(datos.id ?? nombre.replace(/^cola-/, "").replace(/\.json$/, "")),
            ola: texto(datos.ola ?? datos.numero),
            titulo: texto(datos.titulo ?? datos.título ?? datos.nombre ?? datos.descripcion),
            dependencias: derps
                .map((d) => texto(d))
                .filter((d) => d.trim().length > 0),
        };
        if (olatareaValida(tarea)) tareas.push(tarea);
    }

    return tareas.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Heurística: una tarea solo cuenta si tiene ola o título. */
function olatareaValida(tarea: TareaOla): boolean {
    return tieneTexto(tarea.ola) || tieneTexto(tarea.titulo);
}

/** Resúmenes por ola derivados de las colas leídas. */
export function resumirOlas(tareas: TareaOla[]): OlaResumen[] {
    const porOla = new Map<string, TareaOla[]>();
    for (const tarea of tareas) {
        const clave = tarea.ola || tarea.id;
        const actual = porOla.get(clave) ?? [];
        actual.push(tarea);
        porOla.set(clave, actual);
    }

    const resúmenes: OlaResumen[] = [];
    for (const [ola, lista] of porOla) {
        resúmenes.push({
            id: ola,
            titulo: lista[0]?.titulo ?? ola,
            seccion: ola,
            procesadas: lista.length,
            sinCambios: 0,
            bloqueantes: 0,
            restantes: 0,
            total: lista.length,
        });
    }
    return resúmenes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Informes de ola: `relevo/informe-*.md`. */
export async function leerInformes(): Promise<InformeOla[]> {
    const directorios = ["relevo", "starseed_memory_root/relevo"];
    const informes: InformeOla[] = [];

    for (const dir of directorios) {
        const nombres = await listarArchivos(dir, "informe-");
        for (const nombre of nombres) {
            const markdown = await leerMarkdown(path.join(dir, nombre));
            if (!markdown.trim()) continue;
            informes.push({
                nombre,
                titulo: extraerTitulo(markdown, nombre),
                markdown: recortar(markdown, 12000),
                fecha: nombre.replace(/^informe-/, "").replace(/\.md$/, ""),
            });
        }
    }

    return informes.sort((a, b) => a.nombre.localeCompare(b.nombre)).reverse();
}

/** Lee un archivo de texto devolviendo cadena vacía si no existe. */
async function leerMarkdown(rutaRelativa: string): Promise<string> {
    try {
        return await readFile(path.join(RAÍZ, rutaRelativa), "utf-8");
    } catch {
        return VACÍO;
    }
}

/** Extrae el primer encabezado `# …` del markdown como título. */
function extraerTitulo(markdown: string, nombre: string): string {
    const cabeza = markdown.split("\n").find((l) => l.trim().startsWith("# "));
    if (cabeza) return cabeza.replace(/^#\s+/, "").trim();
    return nombre;
}

/** Uso diario por proveedor: `starseed_memory_root/subagentes-libres/uso-diario.json`. */
export async function leerUsoDiario(): Promise<ProveedorUso[]> {
    const datos = await leerJson("starseed_memory_root/subagentes-libres/uso-diario.json");
    const hoy = new Date().toISOString().slice(0, 10);
    const uso: ProveedorUso[] = [];

    const porDia = objeto(objeto(datos).porDia);
    const raízHoy = porDia[hoy] !== undefined ? objeto(porDia[hoy]) : objeto(datos);
    for (const [proveedor, valor] of Object.entries(raízHoy)) {
        if (typeof valor === "number") {
            uso.push({ proveedor, model: VACÍO, usado: valor, limite: null, dia: hoy });
        } else if (typeof valor === "object" && valor !== null) {
            const v = valor as Record<string, unknown>;
            uso.push({
                proveedor,
                model: texto(v.model ?? v.modelo),
                usado: número(v.usado ?? v.tokens ?? v.llamadas, 0),
                limite: "limite" in v ? número(v.limite, null as never) : null,
                dia: texto(v.dia) || hoy,
            });
        }
    }
    return uso;
}

/**
 * Revisiónes: últimas 20 secciones de `olas/revisiones.md`, cada una con su
 * veredicto de seguimiento (sí/no + bloqueante si procede).
 */
export async function leerRevisiones(): Promise<RevisionRef[]> {
    const markdown = await leerMarkdown("olas/revisiones.md");
    if (!markdown.trim()) return [];

    const secciones = partirSecciones(markdown).slice(0, 20);
    return secciones.map((sección) => {
        const título = sección.líneas[0] ?? "";
        return {
            titulo: título.trim(),
            fecha: extraerFecha(secciones.indexOf(sección), sección.líneas),
            seguimiento: extraerSeguimiento(sección.líneas),
            markdown: recortar(sección.texto, 8000),
        };
    });
}

interface SecciónMd {
    líneas: string[];
    texto: string;
}

/** Divide un markdown en secciones por encabezados `##` (o `#`/`###`). */
function partirSecciones(markdown: string): SecciónMd[] {
    const líneas = markdown.split("\n");
    const secciones: SecciónMd[] = [];
    let actual: string[] = [];

    const esEncabezado = (l: string): boolean => /^#{1,3}\s+/.test(l.trim());

    for (const línea of líneas) {
        if (esEncabezado(línea)) {
            if (actual.length > 0) {
                secciones.push({ líneas: actual, texto: actual.join("\n") });
            }
            actual = [línea];
        } else {
            actual.push(línea);
        }
    }
    if (actual.length > 0) secciones.push({ líneas: actual, texto: actual.join("\n") });
    return secciones;
}

/** Extrae la fecha de una sección buscando la fecha en su título o primeras líneas. */
function extraerFecha(_índice: number, líneas: string[]): string {
    const unión = líneas.slice(0, 3).join(" ");
    const coincide = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(unión);
    return coincide ? coincide[0] : "";
}

/** Extrae el veredicto de seguimiento de una sección (busca "Sí", "No", "bloqueante"). */
function extraerSeguimiento(líneas: string[]): string {
    const textoCompleto = líneas.join("\n");
    const coincide = /Seguimiento[:：]\s*(.*)/i.exec(textoCompleto);
    return coincide ? coincide[1].trim() : "";
}

/** Recorta un texto a un máximo de caracteres añadiendo elipsis. */
function recortar(textoCompleto: string, máximo: number): string {
    if (textoCompleto.length <= máximo) return textoCompleto;
    return `${textoCompleto.slice(0, máximo)}…`;
}