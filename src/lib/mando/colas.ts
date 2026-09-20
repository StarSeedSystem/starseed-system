/**
 * Colas de olas: leer, diseñar, guardar y lanzar (Ola 241 · Puente de Mando · solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que Flowise hacía con su lienzo (nodos editables que luego se ejecutan por API),
 * aquí sobre las colas del enjambre: el Diseñador de olas del Mando lee las colas
 * completas (con prompt, archivos, dependencias y modelo), guarda una cola nueva o
 * corregida en `starseed_memory_root/olas/cola-<nombre>.json` y la lanza:
 *
 *   · en ESTA máquina: arranca `~/.local/bin/starseed-enjambre.py` desacoplado;
 *   · en la nube: publica un evento `lanzar` FIRMADO en el bus (`relevo_eventos`) con la
 *     cola entera; el lanzador del contenedor lo recoge y arranca el enjambre allí.
 *
 * ⚠️ Seguridad: solo desde rutas `/api/mando/*` (404 fuera de local). Nombres e ids se
 * validan con listas blancas (sin rutas, sin `..`), el lanzamiento remoto lleva HMAC con
 * `STARSEED_LANZADOR_SECRETO` (solo en archivos de entorno), y nunca se devuelven claves
 * ni rutas absolutas.
 */

import { createHmac } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { openSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    clasificar,
    reencolar,
    objecionDe,
    extraerIdsProgreso,
    obtenerBaseId,
    type TareaAnalizar,
} from "@/lib/mando/reintento-inteligente";

export {
    clasificar,
    reencolar,
    objecionDe,
    extraerIdsProgreso,
    obtenerBaseId,
};

const RAÍZ = raizDelProyecto();
const OLAS = path.join(RAÍZ, "starseed_memory_root", "olas");
/**
 * Id de tarea. Acepta MAYÚSCULAS Y MINÚSCULAS (2026-09-16) porque así son los ids que el
 * enjambre lleva escribiendo desde la ola 300: `p316I`, `p320M`, `zW7`, `zO2`, `p323A`,
 * `p316L2`. El patrón anterior exigía empezar por mayúscula, así que el Mando RECHAZABA las
 * colas que el propio enjambre genera — «Nombre de cola no válido» al intentar aprobar,
 * rechazar, soltar o reencolar cualquiera de ellas. La consola no podía administrar el
 * trabajo de su propio enjambre, que es justo para lo que existe.
 *
 * Es el fallo que la tarea p320M lleva días intentando arreglar y que se comió sus ocho
 * intentos gratuitos. Se arregla aquí porque bloqueaba, hoy y por segunda vez en una tarde,
 * reencolar las tareas atascadas desde el Mando.
 */
const PATRON_ID = /^[A-Za-z][A-Za-z0-9]{0,8}$/;
export const PATRON_NOMBRE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** La rotación del orquestador (lo que el Diseñador ofrece por defecto). */
const ROTACION = [
    "xkiro/qwen/qwen3-coder-plus:free", "nvidia/moonshotai/kimi-k3", "xkiro/minimax/minimax-m3:free",
    "nvidia/deepseek-ai/deepseek-v4-flash-0731", "xkiro/qwen/qwen3.8-max:free", "nvidia/deepseek-ai/deepseek-v4-pro-0813",
    "xkiro/deepseek/deepseek-v4-pro", "xkiro/mistralai/devstral-medium",
];
/**
 * APIs desde las que el orquestador puede ESCRIBIR (opencode las tiene configuradas: xkiro,
 * nvidia=NIM, aihubmix, tokenrouter; openrouter es nativa de opencode). Gemini y Ollama
 * quedan para el asistente y los revisores: opencode no los tiene cableados aquí.
 *
 * `codex` entra el 2026-09-16 y es el tercer candado que tenía la misma puerta. El
 * orquestador SÍ sabe escribir con Codex desde la ola 296 (`es_modelo_codex`,
 * `escribir_con_codex`, `comando_codex`), pero esta lista blanca no lo incluía, así que
 * una tarea con `modelo: "codex/gpt-5.6-sol"` la rechazaba el Mando antes de guardarla:
 * «no es de una API con la que el orquestador pueda escribir». Los otros dos candados eran
 * el interruptor `STARSEED_CODEX_ESCRITOR`, que nadie encendía, y una orden de `codex exec`
 * ilegal que moría en el análisis de argumentos. Tres sitios distintos apagando lo mismo, y
 * ninguno de los tres se enteraba de los otros dos.
 *
 * Codex va contra la SUSCRIPCIÓN de ChatGPT, no contra créditos de API: es capacidad de
 * escritura a coste cero y con un modelo bastante más capaz que la flota libre.
 */
export const APIS_ESCRITORAS = ["xkiro", "nim", "aihubmix", "tokenrouter", "openrouter", "codex"] as const;
const PATRON_MODELO = /^[a-z0-9-]+\/[A-Za-z0-9][A-Za-z0-9._:\/-]{1,120}$/;

/** Id de modelo tal y como lo entiende el orquestador/opencode (`nim/…` → `nvidia/…`). */
export function modeloParaOrquestador(id: string): string {
    return id.startsWith("nim/") ? `nvidia/${id.slice(4)}` : id;
}

/** ¿Es un modelo que el orquestador puede usar para escribir? (id del catálogo o de opencode) */
export function modeloEscritorValido(id: string): boolean {
    if (!PATRON_MODELO.test(id)) return false;
    const api = id.split("/")[0] ?? "";
    return (APIS_ESCRITORAS as readonly string[]).includes(api === "nvidia" ? "nim" : api);
}

/** Una tarea completa de una cola (lo que lee el orquestador). */
export interface TareaCola {
    id: string;
    ola: string;
    titulo: string;
    archivos: string[];
    prompt: string;
    depende: string[];
    /** Modelo preferido para empezar (opcional; si no, la rotación). */
    modelo?: string;
}

/** Una cola completa en disco (o reconstruida del bus si la lanzó la otra máquina). */
export interface ColaCompleta {
    nombre: string;
    archivo: string;
    tareas: TareaCola[];
    modificada: string;
    /** disco · bus (la trajo el evento «arranque» de un orquestador de otra máquina). */
    origen?: "disco" | "bus";
}

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function lista(v: unknown): string[] {
    return Array.isArray(v) ? (v as unknown[]).map((x) => texto(x)).filter(Boolean) : [];
}

/** Modelos que el diseñador ofrece por defecto (la rotación del orquestador). */
export function modelosAsignables(): string[] {
    return [...ROTACION];
}

/** Todas las colas completas del disco, de la más reciente a la más antigua. */
export async function leerColasCompletas(): Promise<ColaCompleta[]> {
    let nombres: string[] = [];
    try {
        nombres = (await readdir(OLAS)).filter((n) => n.startsWith("cola-") && n.endsWith(".json"));
    } catch {
        return [];
    }
    const salida: ColaCompleta[] = [];
    for (const archivo of nombres) {
        try {
            const crudo = JSON.parse(await readFile(path.join(OLAS, archivo), "utf-8")) as unknown;
            const bruto: unknown[] = Array.isArray(crudo)
                ? crudo
                : Array.isArray(objeto(crudo).tareas)
                  ? (objeto(crudo).tareas as unknown[])
                  : [];
            const info = await stat(path.join(OLAS, archivo));
            salida.push({
                nombre: archivo.replace(/^cola-/, "").replace(/\.json$/, ""),
                archivo,
                origen: "disco",
                modificada: info.mtime.toISOString(),
                tareas: bruto.map((b) => {
                    const d = objeto(b);
                    return {
                        id: texto(d.id),
                        ola: texto(d.ola),
                        titulo: texto(d.titulo),
                        archivos: lista(d.archivos),
                        prompt: texto(d.prompt),
                        depende: lista(d.depende ?? d.dependencias),
                        ...(texto(d.modelo) ? { modelo: texto(d.modelo) } : {}),
                    };
                }).filter((t) => t.id),
            });
        } catch {
            // cola ilegible: se salta
        }
    }
    // Colas que solo existen en la otra máquina: se reconstruyen del bus (evento «arranque»).
    const enDisco = new Set(salida.map((c) => c.nombre));
    for (const c of await colasDelBus()) {
        if (!enDisco.has(c.nombre)) salida.push(c);
    }
    return salida.sort((a, b) => b.modificada.localeCompare(a.modificada) || b.nombre.localeCompare(a.nombre, undefined, { numeric: true }));
}

/** Colas publicadas por los orquestadores en sus eventos «arranque» (últimos 30 días). */
async function colasDelBus(): Promise<ColaCompleta[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return [];
    try {
        const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const r = await fetch(
            `${url}/rest/v1/relevo_eventos?select=t,datos&tipo=eq.arranque&t=gte.${encodeURIComponent(desde)}&order=id.desc&limit=200`,
            { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, cache: "no-store", signal: AbortSignal.timeout(800) },
        );
        if (!r.ok) return [];
        const filas = (await r.json()) as Array<{ t: string; datos: unknown }>;
        const vistas = new Map<string, ColaCompleta>();
        for (const f of filas) {
            const d = objeto(f.datos);
            const nombre = texto(d.cola).replace(/^cola-/, "").replace(/\.json$/, "");
            const brutas = Array.isArray(d.tareas) ? (d.tareas as unknown[]) : [];
            if (!nombre || vistas.has(nombre) || brutas.length === 0) continue;
            const tareas: TareaCola[] = brutas.map((b) => {
                const t = objeto(b);
                return {
                    id: texto(t.id),
                    ola: texto(t.ola),
                    titulo: texto(t.titulo),
                    archivos: lista(t.archivos),
                    prompt: texto(t.prompt),
                    depende: lista(t.depende),
                    ...(texto(t.modelo) ? { modelo: texto(t.modelo) } : {}),
                };
            }).filter((t) => t.id);
            // Sin prompt (arranques anteriores al 2026-09-05) no sirve para relanzar.
            if (tareas.some((t) => !t.prompt)) continue;
            vistas.set(nombre, { nombre, archivo: `cola-${nombre}.json`, tareas, modificada: f.t, origen: "bus" });
        }
        return [...vistas.values()];
    } catch {
        return [];
    }
}

/** Valida una cola diseñada. Devuelve los errores (vacío = válida) y la cola normalizada. */
export function validarCola(nombre: string, bruto: unknown): { errores: string[]; tareas: TareaCola[] } {
    const errores: string[] = [];
    if (!PATRON_NOMBRE.test(nombre)) errores.push("Nombre de cola no válido: usa «241-lo-que-sea» (número y palabras en minúscula).");
    const entradas = Array.isArray(bruto) ? (bruto as unknown[]) : [];
    if (entradas.length === 0) errores.push("La cola no tiene tareas.");
    if (entradas.length > 40) errores.push("Demasiadas tareas (máximo 40 por cola).");
    const tareas: TareaCola[] = [];
    const ids = new Set<string>();
    for (const e of entradas) {
        const d = objeto(e);
        const id = texto(d.id).trim();
        if (!PATRON_ID.test(id)) errores.push(`Id «${id || "(vacío)"}» no válido: mayúsculas y dígitos, hasta 9 caracteres (VZ1, MD12).`);
        if (ids.has(id)) errores.push(`Id repetido: ${id}.`);
        ids.add(id);
        const titulo = texto(d.titulo).trim();
        if (!titulo) errores.push(`${id}: falta el título.`);
        const prompt = texto(d.prompt).trim();
        if (prompt.length < 20) errores.push(`${id}: el prompt es demasiado corto (mínimo 20 caracteres).`);
        if (prompt.length > 12000) errores.push(`${id}: el prompt es demasiado largo (máximo 12000).`);
        const archivos = lista(d.archivos).map((a) => a.trim()).filter(Boolean);
        for (const a of archivos) {
            if (a.includes("..") || a.startsWith("/") || /\s/.test(a)) errores.push(`${id}: ruta de archivo no permitida «${a}».`);
        }
        const modelo = modeloParaOrquestador(texto(d.modelo).trim());
        if (modelo && !modeloEscritorValido(modelo)) errores.push(`${id}: modelo «${modelo}» no es de una API con la que el orquestador pueda escribir (${APIS_ESCRITORAS.join(", ")}).`);
        tareas.push({
            id,
            ola: texto(d.ola).trim() || `Ola ${nombre.split("-")[0]} · ${nombre.split("-").slice(1).join(" ")}`.trim(),
            titulo: titulo.slice(0, 200),
            archivos: archivos.slice(0, 20),
            prompt,
            depende: lista(d.depende).map((x) => x.trim()),
            ...(modelo ? { modelo } : {}),
        });
    }
    for (const t of tareas) {
        for (const dep of t.depende) {
            if (!ids.has(dep)) errores.push(`${t.id}: depende de «${dep}», que no está en la cola.`);
            if (dep === t.id) errores.push(`${t.id}: no puede depender de sí misma.`);
        }
    }
    // ciclos
    const estado = new Map<string, number>();
    const porId = new Map(tareas.map((t) => [t.id, t]));
    const visita = (id: string): boolean => {
        const s = estado.get(id) ?? 0;
        if (s === 1) return true;
        if (s === 2) return false;
        estado.set(id, 1);
        for (const dep of porId.get(id)?.depende ?? []) if (porId.has(dep) && visita(dep)) return true;
        estado.set(id, 2);
        return false;
    };
    for (const t of tareas) if (visita(t.id)) { errores.push(`Ciclo de dependencias que pasa por ${t.id}.`); break; }
    return { errores, tareas };
}

export interface InfoLatidoTarea {
    tarea: string;
    cola: string;
    mtimeMs: number;
}

/**
 * Busca latidos de una tarea en disco local y en el bus, filtrados por frescura (umbralMs).
 */
export async function buscarLatidosFrescosTarea(
    tareaId: string,
    umbralMs: number,
    ahoraMs = Date.now()
): Promise<InfoLatidoTarea[]> {
    const latidos: InfoLatidoTarea[] = [];
    const vistas = new Set<string>();

    try {
        const archivos = (await readdir(OLAS)).filter((n) => n.startsWith("latidos-") && n.endsWith(".json"));
        for (const archivo of archivos) {
            try {
                const ruta = path.join(OLAS, archivo);
                const info = await stat(ruta);
                const edadMs = ahoraMs - info.mtimeMs;
                if (edadMs > umbralMs) continue;

                const crudo = JSON.parse(await readFile(ruta, "utf-8")) as Record<string, unknown>;
                const nombreCola = (
                    typeof crudo.cola === "string" && crudo.cola
                        ? crudo.cola
                        : archivo.replace(/^latidos-/, "")
                ).replace(/\.json$/, "").replace(/^cola-/, "");

                const tareasObj =
                    typeof crudo.tareas === "object" && crudo.tareas !== null
                        ? (crudo.tareas as Record<string, unknown>)
                        : {};

                if (tareasObj[tareaId]) {
                    const clave = `${nombreCola}|${tareaId}`;
                    if (!vistas.has(clave)) {
                        vistas.add(clave);
                        latidos.push({ tarea: tareaId, cola: nombreCola, mtimeMs: info.mtimeMs });
                    }
                }
            } catch {
                // ignorar errores de lectura individual
            }
        }
    } catch {
        // ignorar error de lectura del directorio
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && clave) {
        try {
            const desde = new Date(ahoraMs - umbralMs).toISOString();
            const r = await fetch(
                `${url}/rest/v1/relevo_eventos?select=t,datos&tipo=eq.latido&t=gte.${encodeURIComponent(desde)}&order=id.desc&limit=100`,
                { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, cache: "no-store", signal: AbortSignal.timeout(800) }
            );
            if (r.ok) {
                const filas = (await r.json()) as Array<{ t: string; datos: unknown }>;
                for (const f of filas) {
                    const tMs = new Date(f.t).getTime();
                    if (ahoraMs - tMs > umbralMs) continue;
                    const d = typeof f.datos === "object" && f.datos !== null ? (f.datos as Record<string, unknown>) : {};
                    const nombreCola = typeof d.cola === "string" ? d.cola.replace(/^cola-/, "").replace(/\.json$/, "") : "";
                    const tareasObj = typeof d.tareas === "object" && d.tareas !== null ? (d.tareas as Record<string, unknown>) : {};
                    if (nombreCola && tareasObj[tareaId]) {
                        const key = `${nombreCola}|${tareaId}`;
                        if (!vistas.has(key)) {
                            vistas.add(key);
                            latidos.push({ tarea: tareaId, cola: nombreCola, mtimeMs: tMs });
                        }
                    }
                }
            }
        } catch {
            // ignorar error de red en el bus
        }
    }

    return latidos;
}

export interface OpcionesResolverNombre {
    nombre?: string;
    tarea?: string;
    /** Umbral máximo de antigüedad para el latido en ms (por defecto: 5 minutos = 300,000 ms). */
    umbralMs?: number;
}

/**
 * Resuelve unívocamente el nombre de la cola para una acción (Aprobar/Rechazar/Soltar/Reasignar).
 * Si `nombre` viene especificado, lo valida contra PATRON_NOMBRE y `leerColasCompletas()`.
 * Si `nombre` está vacío, busca latidos FRESCOS de la `tarea`. Si no hay latidos frescos o el
 * latido expiró, NO adivina ni usa latidos rancios.
 */
export async function resolverNombreColaActual(
    opts: OpcionesResolverNombre
): Promise<{ ok: boolean; nombre?: string; error?: string }> {
    const umbralMs = opts.umbralMs ?? 5 * 60 * 1000;
    const colas = await leerColasCompletas();
    const nombresExistentes = new Set(colas.map((c) => c.nombre));

    if (opts.nombre && opts.nombre.trim()) {
        const n = opts.nombre.trim().toLowerCase().replace(/^cola-/, "").replace(/\.json$/, "");
        if (!PATRON_NOMBRE.test(n)) {
            return { ok: false, error: "Nombre de cola no válido." };
        }
        if (!nombresExistentes.has(n)) {
            return { ok: false, error: `No encuentro cola-${n} en disco ni en el bus.` };
        }
        return { ok: true, nombre: n };
    }

    if (!opts.tarea || !opts.tarea.trim()) {
        return { ok: false, error: "Falta el nombre de la cola o la tarea." };
    }
    const tareaId = opts.tarea.trim();

    const latidosFrescos = await buscarLatidosFrescosTarea(tareaId, umbralMs);
    const latidosValidos = latidosFrescos.filter((l) => nombresExistentes.has(l.cola));
    const colasUnicasFrescas = Array.from(new Set(latidosValidos.map((l) => l.cola)));

    if (colasUnicasFrescas.length === 1) {
        return { ok: true, nombre: colasUnicasFrescas[0] };
    }

    if (colasUnicasFrescas.length > 1) {
        return {
            ok: false,
            error: `Hay varios latidos activos para la tarea ${tareaId} en diferentes colas (${colasUnicasFrescas.join(", ")}). Especifica el nombre de la cola.`,
        };
    }

    // No hay latidos frescos: comprobar si existen latidos expirados (más viejos que el umbral)
    const latidosHistoricos = await buscarLatidosFrescosTarea(tareaId, 30 * 24 * 3600 * 1000);
    const latidosHistoricosValidos = latidosHistoricos.filter((l) => nombresExistentes.has(l.cola));
    if (latidosHistoricosValidos.length > 0) {
        return {
            ok: false,
            error: `El latido de la tarea ${tareaId} ha expirado (más viejo que el umbral de ${Math.round(umbralMs / 1000)} s). Especifica el nombre de la cola.`,
        };
    }

    const candidatas = colas.filter((c) => c.tareas.some((t) => t.id === tareaId));
    if (candidatas.length === 1) {
        return { ok: true, nombre: candidatas[0].nombre };
    }

    if (candidatas.length > 1) {
        return {
            ok: false,
            error: `La tarea ${tareaId} figura en varias colas (${candidatas.map((c) => c.nombre).join(", ")}) y no hay latidos activos. Especifica el nombre de la cola.`,
        };
    }

    return { ok: false, error: `No encuentro la tarea ${tareaId} en ninguna cola.` };
}

/**
 * Reintento inteligente desde el Mando (Ola 339+ · Alex, 2026-09-17).
 * Cuándo: una tarea quedó en estado fallida / bloqueada / sin_cambios y Alex le da
 * al botón «Reintentar» (o «Reintentar útiles»). En vez de volver a lanzar a ciegas:
 *  1) se descarta si es INÚTIL — duplicada (el mismo `titulo` ya existe en otra
 *     tarea de la cola o en una cola reciente; ya fue integrada) o si su propio
 *     prompt/título contiene pistas de no-aplica (`NO APLICA`, archivo inexistente…);
 *  2) si es útil se re-encola en una cola nueva `cola-<nombre>-rt<id>` con la tarea
 *     en `pendiente`, un `modelo` distinto al que falló y el MOTIVO del fallo
 *     añadido al prompt (cambio inteligente: el enjambre no repite el error).
 * Devuelve qué se descartó y qué se relanzó, para que el Mando lo pinte honrado.
 */
export interface PeticionReintentar {
    /** Cola (sin `cola-`). Opcional: si no se especifica, se resuelve automáticamente. */
    nombre?: string;
    /** Ids a reintentar. */
    tareas: string[];
    /** Estados id → estado de la ola (commit/bloqueante/fallo/sin_cambios…). */
    estados?: Record<string, string>;
    /** Diseños/prompts ya existentes para detectar duplicados. */
    existentes?: string[];
    /** Motivo textual del fallo (opcional; se añade al prompt si hay). */
    motivo?: string;
}

export async function reintentarTarea(p: PeticionReintentar): Promise<{
    ok: boolean;
    error?: string;
    detalle?: string;
    relanzadas: string[];
    descartadas: string[];
    colaNueva?: string;
}> {
    const resNombre = await resolverNombreColaActual({ nombre: p.nombre, tarea: p.tareas[0] });
    if (!resNombre.ok || !resNombre.nombre) {
        return { ok: false, error: resNombre.error ?? "No se pudo resolver la cola.", relanzadas: [], descartadas: [] };
    }
    const nombreCola = resNombre.nombre;
    const colas = await leerColasCompletas();
    const cola = colas.find((c) => c.nombre === nombreCola);
    if (!cola) return { ok: false, error: `No encuentro cola-${nombreCola} en disco.`, relanzadas: [], descartadas: [] };

    // Leer progreso.json y revisiones.md para la clasificación e inteligibilidad del reintento
    let progresoRaw = "";
    try {
        progresoRaw = await readFile(path.join(OLAS, "progreso.json"), "utf-8");
    } catch {
        try {
            progresoRaw = await readFile(path.join(RAÍZ, "olas", "progreso.json"), "utf-8");
        } catch {}
    }

    let revisionesMd = "";
    try {
        revisionesMd = await readFile(path.join(OLAS, "revisiones.md"), "utf-8");
    } catch {
        try {
            revisionesMd = await readFile(path.join(RAÍZ, "olas", "revisiones.md"), "utf-8");
        } catch {}
    }

    let progreso: unknown = {};
    try {
        progreso = JSON.parse(progresoRaw);
    } catch {}

    const relanzadas: string[] = [];
    const descartadas: string[] = [];
    const aReintentar: TareaCola[] = [];

    for (const id of p.tareas) {
        const tarea = cola.tareas.find((t) => t.id === id);
        if (!tarea) { descartadas.push(`${id} (no está en la cola)`); continue; }

        const estadoP = (p.estados ?? {})[id] ?? "";
        const estadoProgreso = (progreso as Record<string, { estado?: string }>)?.[id]?.estado ?? "";
        const estadoFinal = estadoP || estadoProgreso || "rechazada";

        const notaProgreso = (progreso as Record<string, { nota?: string }>)?.[id]?.nota ?? "";
        const notaFinal = p.motivo || notaProgreso || "";

        const tareaAnalizar: TareaAnalizar = {
            id: tarea.id,
            ola: tarea.ola,
            titulo: tarea.titulo,
            archivos: tarea.archivos,
            prompt: tarea.prompt,
            depende: tarea.depende,
            modelo: tarea.modelo,
            estado: estadoFinal,
            nota: notaFinal,
            motivo: p.motivo || notaFinal,
        };

        const clasificacion = clasificar(tareaAnalizar, progreso, revisionesMd);

        if (clasificacion.accion === "reintentar") {
            const baseId = obtenerBaseId(tarea.id);
            const objecion =
                objecionDe(revisionesMd, tarea.id) ??
                objecionDe(revisionesMd, baseId) ??
                clasificacion.motivo ??
                p.motivo ??
                "Reintento inteligente pedido desde el Mando";

            const tareaNueva = reencolar(tareaAnalizar, objecion, progreso);

            aReintentar.push({
                id: tareaNueva.id,
                ola: tareaNueva.ola ?? tarea.ola,
                titulo: tareaNueva.titulo ?? tarea.titulo,
                archivos: tareaNueva.archivos ?? tarea.archivos,
                prompt: tareaNueva.prompt,
                depende: tareaNueva.depende ?? tarea.depende,
                ...(tarea.modelo ? { modelo: tarea.modelo } : {}),
            });
            relanzadas.push(tareaNueva.id);
        } else {
            descartadas.push(`${id} (${clasificacion.motivo})`);
        }
    }

    if (aReintentar.length === 0) {
        return { ok: true, relanzadas: [], descartadas, detalle: "Todas las tareas se descartaron (duplicadas o no aplican)." };
    }

    const nombreNuevo = `${nombreCola}-rt${Date.now().toString().slice(-4)}`.slice(0, 60).replace(/-+$/, "");
    if (!PATRON_NOMBRE.test(nombreNuevo)) {
        return { ok: false, error: "No puedo derivar un nombre de cola válido para el reintento.", relanzadas: [], descartadas };
    }
    const g = await guardarCola(nombreNuevo, aReintentar, true);
    if (!g.ok) return { ok: false, error: g.error, relanzadas: [], descartadas };
    const l = await lanzarAqui(nombreNuevo, Math.min(2, aReintentar.length));
    if (!l.ok) return { ok: false, error: l.error, relanzadas, descartadas };

    return { ok: true, relanzadas, descartadas, colaNueva: nombreNuevo };
}

/** Guarda la cola en disco. No pisa una existente salvo `sobrescribir`. */
export async function guardarCola(nombre: string, tareas: TareaCola[], sobrescribir: boolean): Promise<{ ok: boolean; archivo: string; error?: string }> {
    const archivo = `cola-${nombre}.json`;
    const ruta = path.join(OLAS, archivo);
    await mkdir(OLAS, { recursive: true });
    if (!sobrescribir) {
        try {
            await stat(ruta);
            return { ok: false, archivo, error: "Ya existe una cola con ese nombre. Elige otro o marca «sobrescribir»." };
        } catch {
            // no existe: bien
        }
    }
    await writeFile(ruta, JSON.stringify(tareas, null, 2) + "\n", "utf-8");
    return { ok: true, archivo };
}

/** Firma HMAC del lanzamiento remoto (secreto solo en el entorno). */
export function firmarLanzamiento(cola: string, t: string): string | null {
    const secreto = process.env.STARSEED_LANZADOR_SECRETO;
    if (!secreto) return null;
    return createHmac("sha256", secreto).update(`${cola}|${t}`).digest("hex");
}

/**
 * Cuántos agentes caben ahora mismo, con honestidad (2026-09-08, Ola 286 · F3).
 * Máximo 8; un agente por cada ~1200 MB libres (mínimo 1); nunca más de
 * `proveedoresVivos * 2`, y se descuentan los que ya están `enCurso`. El motivo
 * explica en una frase cuál de los tres límites mandó.
 *
 * Vive en `trabajadores.ts` (módulo cliente-seguro) para que el Diseñador de olas
 * pueda importarlo sin arrastrar los built-ins de Node de este archivo; aquí solo
 * se re-exporta para quien quiera usarlo desde servidor.
 */
export { trabajadoresRecomendados } from "@/lib/mando/trabajadores";
export type { EntradaRecomendacion, RecomendacionTrabajadores } from "@/lib/mando/trabajadores";

/**
 * Lanza una cola en esta máquina: `starseed-enjambre.py <cola> --workers N`, desacoplado,
 * con su salida en `olas/logs/lanzamiento-<cola>.log`. Devuelve el pid.
 */
export async function lanzarAqui(nombre: string, workers: number, extra: string[] = []): Promise<{ ok: boolean; pid?: number; error?: string }> {
    const archivo = `cola-${nombre}.json`;
    try {
        await stat(path.join(OLAS, archivo));
    } catch {
        return { ok: false, error: "Esa cola no existe en disco." };
    }
    const orquestador = path.join(homedir(), ".local", "bin", "starseed-enjambre.py");
    try {
        await stat(orquestador);
    } catch {
        return { ok: false, error: "No hay orquestador instalado en esta máquina (~/.local/bin/starseed-enjambre.py)." };
    }
    const logs = path.join(OLAS, "logs");
    await mkdir(logs, { recursive: true });
    const registro = openSync(path.join(logs, `lanzamiento-${nombre}.log`), "a");
    // Techo de trabajadores: pasó de 4 a 8 (2026-09-08, Ola 286 · F3). Con más
    // proveedores vivos caben más agentes en paralelo; el cuello real es la
    // memoria de la máquina y el cupo de los proveedores, no el orquestador.
    const n = Math.min(8, Math.max(1, Math.round(workers)));
    const permitidos = extra.filter((x) => ["--sin-revision", "--reanudar", "--aprobacion"].includes(x));
    // `-u` NO es cosmético: `orquestador_vivo()` del vigilante solo reconoce como
    // orquestador un proceso cuya orden EMPIEZA por un python seguido de `-u`
    // (scripts/puente/vigilante_logica.py). Sin esa bandera, lo que lanza el Mando es
    // INVISIBLE para el vigilante, que a los noventa segundos lanza un segundo
    // orquestador sobre la misma cola. Eso pasó en la ola 325: el Mando lanzó a las
    // 19:34:59 y el vigilante lanzó otro a las 19:35:47, y los dos se pelearon por los
    // arriendos («el arriendo de PS8 ya pertenece a otro medio»), con el doble de
    // memoria en una Mac de 8 GB. La regla de oro es UN orquestador con N trabajadores.
    const hijo = spawn("python3", ["-u", orquestador, path.join("starseed_memory_root", "olas", archivo), "--workers", String(n), ...permitidos], {
        cwd: RAÍZ,
        detached: true,
        stdio: ["ignore", registro, registro],
        env: { ...process.env, STARSEED_ROOT: RAÍZ, STARSEED_DONDE: "mac", STARSEED_MEDIO: "mando" },
    });
    hijo.unref();
    return { ok: true, pid: hijo.pid };
}

/** Publica en el bus la orden firmada de lanzar la cola en la nube (con la cola entera). */
export async function lanzarEnNube(nombre: string, tareas: TareaCola[], workers: number, aprobacion = false): Promise<{ ok: boolean; error?: string }> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return { ok: false, error: "Sin acceso al bus (variables de Supabase)." };
    const t = new Date().toISOString();
    const firma = firmarLanzamiento(`cola-${nombre}`, t);
    if (!firma) return { ok: false, error: "Falta STARSEED_LANZADOR_SECRETO en el entorno de esta máquina: sin firma no se lanza nada en la nube." };
    try {
        const r = await fetch(`${url}/rest/v1/relevo_eventos`, {
            method: "POST",
            headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({
                quien: "mando",
                tipo: "lanzar",
                tarea: "",
                texto: `lanzar cola-${nombre} en la nube · ${tareas.length} tareas · ${workers} trabajadores${aprobacion ? " · con visto bueno antes de integrar" : ""}`,
                datos: { donde: "nube", cola: `cola-${nombre}`, workers, t, firma, tareas, aprobacion, categoria: "ola" },
            }),
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) return { ok: false, error: `El bus rechazó la orden (HTTP ${r.status}).` };
        return { ok: true };
    } catch {
        return { ok: false, error: "No se pudo escribir en el bus." };
    }
}

const execFileAsync = promisify(execFile);

/** Detiene el orquestador de una cola en esta máquina (SIGTERM a los python3 con esa cola). */
export async function detenerAqui(nombre: string): Promise<{ ok: boolean; detenidos: number; error?: string }> {
    try {
        const { stdout } = await execFileAsync("pgrep", ["-af", "starseed-enjambre.py"], { timeout: 5000, windowsHide: true });
        const pids = stdout
            .split("\n")
            .filter((l) => l.includes(`cola-${nombre}.json`) && !l.includes("pgrep"))
            .map((l) => Number.parseInt(l.trim().split(/\s+/)[0] ?? "", 10))
            .filter((n) => Number.isFinite(n) && n > 1);
        for (const pid of pids) {
            try { process.kill(pid, "SIGTERM"); } catch { /* ya no está */ }
        }
        return pids.length ? { ok: true, detenidos: pids.length } : { ok: false, detenidos: 0, error: "No hay ningún orquestador con esa cola en esta máquina." };
    } catch {
        return { ok: false, detenidos: 0, error: "No se pudo consultar los procesos." };
    }
}

/** Publica en el bus la orden firmada de detener la cola en la nube. */
export async function detenerEnNube(nombre: string): Promise<{ ok: boolean; error?: string }> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return { ok: false, error: "Sin acceso al bus (variables de Supabase)." };
    const t = new Date().toISOString();
    const firma = firmarLanzamiento(`cola-${nombre}`, t);
    if (!firma) return { ok: false, error: "Falta STARSEED_LANZADOR_SECRETO en el entorno de esta máquina." };
    try {
        const r = await fetch(`${url}/rest/v1/relevo_eventos`, {
            method: "POST",
            headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ quien: "mando", tipo: "detener", tarea: "", texto: `detener cola-${nombre} en la nube`, datos: { donde: "nube", cola: `cola-${nombre}`, t, firma, categoria: "ola" } }),
            signal: AbortSignal.timeout(3000),
        });
        return r.ok ? { ok: true } : { ok: false, error: `El bus rechazó la orden (HTTP ${r.status}).` };
    } catch {
        return { ok: false, error: "No se pudo escribir en el bus." };
    }
}

// ── Reasignar una tarea: otro modelo/API, u otro servidor, sin romper el flujo ─────────

/** Orden por tarea para el orquestador (archivo `control-<cola>.json`, lo lee cada 20 s). */
interface OrdenControl {
    accion: "reasignar" | "soltar" | "aprobar" | "rechazar";
    modelo?: string;
    dondeNuevo?: string;
}

/** Deja la orden en el archivo de control de esta máquina (o anota el modelo en la cola si no corre). */
async function controlAqui(nombre: string, tarea: string, orden: OrdenControl): Promise<{ ok: boolean; error?: string }> {
    const hayOrquestador = await orquestadorAqui(nombre);
    if (!hayOrquestador) {
        if (orden.accion === "aprobar" || orden.accion === "rechazar") return { ok: false, error: "El orquestador de esa cola ya no está: la rama quedó como pendiente_aprobacion. Intégrala a mano (git merge --ff-only ola/<tarea>) o relanza la tarea con --solo." };
        if (orden.accion !== "reasignar" || !orden.modelo) return { ok: false, error: "No hay ningún orquestador con esa cola en esta máquina." };
        const ruta = path.join(OLAS, `cola-${nombre}.json`);
        try {
            const crudo = JSON.parse(await readFile(ruta, "utf-8")) as unknown;
            if (!Array.isArray(crudo)) return { ok: false, error: "La cola en disco no tiene el formato esperado." };
            for (const t of crudo as Array<Record<string, unknown>>) if (t.id === tarea) t.modelo = orden.modelo;
            await writeFile(ruta, JSON.stringify(crudo, null, 2) + "\n", "utf-8");
            return { ok: true };
        } catch {
            return { ok: false, error: "Esa cola no está en disco ni corriendo aquí." };
        }
    }
    const ruta = path.join(OLAS, `control-cola-${nombre}.json`);
    let actual: Record<string, unknown> = {};
    try { actual = objeto(JSON.parse(await readFile(ruta, "utf-8")) as unknown); } catch { /* no había */ }
    actual[tarea] = { accion: orden.accion, modelo: orden.modelo ?? "", donde: orden.dondeNuevo ?? "", t: new Date().toISOString(), quien: "mando" };
    await mkdir(OLAS, { recursive: true });
    await writeFile(ruta, JSON.stringify(actual, null, 2) + "\n", "utf-8");
    return { ok: true };
}

/** Publica en el bus la orden firmada de control para el orquestador de la nube. */
async function controlEnNube(nombre: string, tarea: string, orden: OrdenControl): Promise<{ ok: boolean; error?: string }> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return { ok: false, error: "Sin acceso al bus (variables de Supabase)." };
    const t = new Date().toISOString();
    const firma = firmarLanzamiento(`cola-${nombre}`, t);
    if (!firma) return { ok: false, error: "Falta STARSEED_LANZADOR_SECRETO en el entorno de esta máquina." };
    try {
        const r = await fetch(`${url}/rest/v1/relevo_eventos`, {
            method: "POST",
            headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({
                quien: "mando",
                tipo: "control",
                tarea,
                texto: `${orden.accion} ${tarea} de cola-${nombre} en la nube${orden.modelo ? ` → ${orden.modelo}` : ""}${orden.dondeNuevo ? ` → ${orden.dondeNuevo}` : ""}`,
                datos: { donde: "nube", cola: `cola-${nombre}`, tarea, accion: orden.accion, modelo: orden.modelo ?? "", donde_nuevo: orden.dondeNuevo ?? "", t, firma, categoria: "ola" },
            }),
            signal: AbortSignal.timeout(3000),
        });
        return r.ok ? { ok: true } : { ok: false, error: `El bus rechazó la orden (HTTP ${r.status}).` };
    } catch {
        return { ok: false, error: "No se pudo escribir en el bus." };
    }
}

async function orquestadorAqui(nombre: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync("pgrep", ["-af", "starseed-enjambre.py"], { timeout: 5000, windowsHide: true });
        return stdout.split("\n").some((l) => l.includes(`cola-${nombre}.json`) && !l.includes("pgrep"));
    } catch {
        return false;
    }
}

export interface PeticionReasignar {
    /** Cola (sin `cola-`). Opcional: si no se especifica, se resuelve automáticamente. */
    nombre?: string;
    tarea: string;
    /** Dónde corre ahora la tarea (mac · nube); si no se sabe, mac. */
    dondeActual: "mac" | "nube";
    /** Servidor deseado; igual al actual = solo cambia el modelo. */
    donde?: "mac" | "nube";
    /** Modelo deseado (id del catálogo o de opencode); vacío = rotación. */
    modelo?: string;
    /** Estados actuales de las tareas de la cola (id → estado), para mover solo las no terminadas. */
    estados?: Record<string, string>;
}

/**
 * Cambia el modelo/API de una tarea —en marcha o pendiente— o la mueve al otro servidor.
 *   · mismo servidor: orden `reasignar` (archivo de control aquí, o bus firmado en la nube);
 *     el orquestador corta la escritura actual si la hay y sigue el MISMO flujo con el nuevo
 *     modelo (tsc → tests → revisión → integración).
 *   · otro servidor: la tarea y sus dependientes aún no terminados se sueltan aquí y se
 *     lanzan allí como una cola nueva `cola-<nombre>-<tarea>` (con el modelo elegido), para
 *     que la cadena de dependencias siga entera.
 */
export async function reasignarTarea(p: PeticionReasignar): Promise<{ ok: boolean; error?: string; detalle?: string; colaNueva?: string }> {
    const resNombre = await resolverNombreColaActual({ nombre: p.nombre, tarea: p.tarea });
    if (!resNombre.ok || !resNombre.nombre) return { ok: false, error: resNombre.error ?? "No se pudo resolver la cola." };
    const nombre = resNombre.nombre;
    if (!PATRON_ID.test(p.tarea)) return { ok: false, error: "Id de tarea no válido." };
    const modelo = p.modelo ? modeloParaOrquestador(p.modelo.trim()) : "";
    if (modelo && !modeloEscritorValido(modelo)) return { ok: false, error: `Con «${modelo}» el orquestador no puede escribir: elige una API de ${APIS_ESCRITORAS.join(", ")}.` };
    const destino = p.donde ?? p.dondeActual;

    if (destino === p.dondeActual) {
        if (!modelo) return { ok: false, error: "Elige un modelo o un servidor distinto: no hay nada que cambiar." };
        const orden: OrdenControl = { accion: "reasignar", modelo };
        const r = p.dondeActual === "nube" ? await controlEnNube(nombre, p.tarea, orden) : await controlAqui(nombre, p.tarea, orden);
        return r.ok ? { ok: true, detalle: `${p.tarea} seguirá con ${modelo} en ${p.dondeActual}; el flujo (tsc → tests → revisión → integración) no cambia.` } : r;
    }

    // Mover de servidor: la tarea y sus dependientes no terminados viajan juntos.
    const cola = (await leerColasCompletas()).find((c) => c.nombre === nombre);
    if (!cola) return { ok: false, error: "No encuentro esa cola ni en disco ni en el bus." };
    const porId = new Map(cola.tareas.map((t) => [t.id, t]));
    if (!porId.has(p.tarea)) return { ok: false, error: `La tarea ${p.tarea} no está en cola-${nombre}.` };
    const terminal = (id: string): boolean => {
        const e = p.estados?.[id] ?? "";
        return e === "commit" || e === "bloqueante" || e === "sin_cambios" || e === "sustituida";
    };
    const mover = new Set<string>([p.tarea]);
    let creció = true;
    while (creció) {
        creció = false;
        for (const t of cola.tareas) {
            if (mover.has(t.id) || terminal(t.id)) continue;
            if (t.depende.some((d) => mover.has(d))) { mover.add(t.id); creció = true; }
        }
    }
    const tareas: TareaCola[] = cola.tareas
        .filter((t) => mover.has(t.id))
        .map((t) => ({
            ...t,
            // Dependencias que se quedan (ya integradas) se quitan: en el otro servidor no están en la cola.
            depende: t.depende.filter((d) => mover.has(d)),
            ...(t.id === p.tarea && modelo ? { modelo } : {}),
        }));
    const nombreNuevo = `${nombre}-${p.tarea.toLowerCase()}`.slice(0, 60).replace(/-+$/, "");
    if (!PATRON_NOMBRE.test(nombreNuevo)) return { ok: false, error: "No puedo derivar un nombre de cola válido para el traslado." };

    // 1) Soltar aquí/allí (si hay orquestador; si no, no pasa nada).
    const soltadas: string[] = [];
    for (const id of mover) {
        const orden: OrdenControl = { accion: "soltar", dondeNuevo: destino };
        const r = p.dondeActual === "nube" ? await controlEnNube(nombre, id, orden) : await controlAqui(nombre, id, orden);
        if (r.ok) soltadas.push(id);
    }
    // 2) Lanzar en el destino como cola nueva.
    if (destino === "mac") {
        const g = await guardarCola(nombreNuevo, tareas, true);
        if (!g.ok) return { ok: false, error: g.error };
        const r = await lanzarAqui(nombreNuevo, Math.min(2, tareas.length));
        if (!r.ok) return { ok: false, error: r.error };
    } else {
        const r = await lanzarEnNube(nombreNuevo, tareas, Math.min(2, tareas.length));
        if (!r.ok) return { ok: false, error: r.error };
    }
    return {
        ok: true,
        colaNueva: nombreNuevo,
        detalle: `${[...mover].join(", ")} → ${destino} como cola-${nombreNuevo}${modelo ? ` (${p.tarea} con ${modelo})` : ""}${soltadas.length ? `; soltadas en ${p.dondeActual}: ${soltadas.join(", ")}` : ""}.`,
    };
}

/** Visto bueno humano: aprueba (integra) o rechaza (conserva la rama) una tarea que espera. */
export async function decidirTarea(p: { nombre?: string; tarea: string; dondeActual: "mac" | "nube"; decision: "aprobar" | "rechazar" }): Promise<{ ok: boolean; error?: string; detalle?: string }> {
    const resNombre = await resolverNombreColaActual({ nombre: p.nombre, tarea: p.tarea });
    if (!resNombre.ok || !resNombre.nombre) return { ok: false, error: resNombre.error ?? "No se pudo resolver la cola." };
    const nombre = resNombre.nombre;
    if (!PATRON_ID.test(p.tarea)) return { ok: false, error: "Id de tarea no válido." };
    const orden: OrdenControl = { accion: p.decision };
    const r = p.dondeActual === "nube" ? await controlEnNube(nombre, p.tarea, orden) : await controlAqui(nombre, p.tarea, orden);
    return r.ok
        ? { ok: true, detalle: p.decision === "aprobar" ? `${p.tarea}: el orquestador de ${p.dondeActual} la integra en main en su próxima vuelta (≤ 20 s).` : `${p.tarea}: rechazada; la rama ola/${p.tarea} se conserva en ${p.dondeActual}.` }
        : r;
}
