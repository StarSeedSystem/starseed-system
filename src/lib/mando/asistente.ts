/**
 * Asistente técnico del Puente de Mando (solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * La orbe del Mando y la sección «Asistente» de la pestaña Chat hablan con ESTE módulo:
 * un administrador técnico de la orquestación multiagéntica que responde con cualquier
 * modelo disponible y que ve, en cada turno, el estado vivo del sistema:
 *
 *   · briefing: repositorio, olas y tareas (con estado y dónde corrieron), agentes vivos
 *     con tokens y fase, salud de proveedores, fila inteligente, últimas notas del relevo
 *     y últimos eventos del bus;
 *   · contexto por palabras: trozos de las memorias (memory/*.md, CLAUDE.md, relevo,
 *     progreso, revisiones, informes, índice del memory root) que casan con la pregunta;
 *   · acciones propuestas: el modelo puede pedir `{"accion": …}` en un bloque JSON y la
 *     interfaz las ejecuta (lanzar/detener con confirmación humana; leer y ver_tarea al
 *     momento). Nunca ejecuta nada por su cuenta.
 *
 * Los chats se guardan en `starseed_memory_root/mando/chats/<id>.json` (no se versionan) y
 * son los MISMOS para la orbe y para la pestaña.
 */

import { mkdir, readdir, readFile, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

import { construirRamificacion } from "@/lib/mando/ramificacion";
import { leerEstadoRelevo, leerEventosDelBus, leerProgreso, colaInteligente, leerColas } from "@/lib/mando/lector-local";
import { llamarModelo, type MensajeModelo } from "@/lib/mando/modelos-disponibles";

const RAÍZ = process.cwd();
const CARPETA_CHATS = path.join(RAÍZ, "starseed_memory_root", "mando", "chats");

/** Archivos que el asistente puede leer (rutas relativas al repositorio, sin `..`). */
const LECTURA_PERMITIDA = [
    /^CLAUDE\.md$/,
    /^memory\/[a-z0-9_-]+\.md$/,
    /^architecture\/[a-z0-9_-]+\.md$/,
    /^starseed_memory_root\/(index|sync|state)\.md$/,
    /^starseed_memory_root\/(soul|ego|memory|dream|tasks|logs|skills|style)\/[a-z0-9_.-]+\.md$/,
    /^starseed_memory_root\/relevo\/(relevo|estado|PROMPT-[A-Z]+)\.(md|json)$/,
    /^starseed_memory_root\/olas\/(progreso|revisiones)\.(md|json)$/,
    /^starseed_memory_root\/olas\/cola-[a-z0-9-]+\.json$/,
    /^starseed_memory_root\/olas\/logs\/[A-Z0-9]+\.log$/,
    /^starseed_memory_root\/relevo\/informe-[a-z0-9-]+\.md$/,
    /^starseed_memory_root\/fuentes\/fuentes-externas\.json$/,
];

export interface MensajeChat {
    rol: "usuario" | "asistente" | "herramienta";
    texto: string;
    t: string;
    modelo?: string;
    tokens?: { entrada: number; salida: number } | null;
    latenciaMs?: number;
}

export interface ChatMando {
    id: string;
    titulo: string;
    creado: string;
    actualizado: string;
    modelo: string;
    mensajes: MensajeChat[];
}

export interface AccionPropuesta {
    accion: "lanzar" | "detener" | "ver_tarea" | "leer";
    cola?: string;
    donde?: string;
    workers?: number;
    id?: string;
    ruta?: string;
}

function ahora(): string {
    return new Date().toISOString();
}

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ── Chats ───────────────────────────────────────────────────────────────────

function rutaChat(id: string): string {
    if (!/^[a-z0-9-]{6,40}$/.test(id)) throw new Error("Id de chat no válido.");
    return path.join(CARPETA_CHATS, `${id}.json`);
}

export async function listarChats(): Promise<Array<Omit<ChatMando, "mensajes"> & { mensajes: number; ultimo: string }>> {
    let nombres: string[] = [];
    try {
        nombres = (await readdir(CARPETA_CHATS)).filter((n) => n.endsWith(".json"));
    } catch {
        return [];
    }
    const salida: Array<Omit<ChatMando, "mensajes"> & { mensajes: number; ultimo: string }> = [];
    for (const n of nombres) {
        try {
            const c = JSON.parse(await readFile(path.join(CARPETA_CHATS, n), "utf-8")) as ChatMando;
            const ultimo = c.mensajes[c.mensajes.length - 1];
            salida.push({
                id: c.id,
                titulo: c.titulo,
                creado: c.creado,
                actualizado: c.actualizado,
                modelo: c.modelo,
                mensajes: c.mensajes.length,
                ultimo: ultimo ? ultimo.texto.slice(0, 120) : "",
            });
        } catch {
            // chat corrupto: se ignora
        }
    }
    return salida.sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

export async function leerChat(id: string): Promise<ChatMando | null> {
    try {
        return JSON.parse(await readFile(rutaChat(id), "utf-8")) as ChatMando;
    } catch {
        return null;
    }
}

export async function guardarChat(chat: ChatMando): Promise<void> {
    await mkdir(CARPETA_CHATS, { recursive: true });
    chat.actualizado = ahora();
    await writeFile(rutaChat(chat.id), JSON.stringify(chat, null, 2), "utf-8");
}

export async function crearChat(titulo: string, modelo: string): Promise<ChatMando> {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const chat: ChatMando = { id, titulo: titulo.trim().slice(0, 80) || "Chat con el asistente", creado: ahora(), actualizado: ahora(), modelo, mensajes: [] };
    await guardarChat(chat);
    return chat;
}

export async function borrarChat(id: string): Promise<boolean> {
    try {
        await unlink(rutaChat(id));
        return true;
    } catch {
        return false;
    }
}

// ── Lectura de archivos permitidos ──────────────────────────────────────────

export function rutaPermitida(ruta: string): boolean {
    const limpia = ruta.replace(/^\.?\//, "");
    return !limpia.includes("..") && LECTURA_PERMITIDA.some((re) => re.test(limpia));
}

export async function leerArchivoPermitido(ruta: string, maxChars = 12_000): Promise<{ ok: boolean; ruta: string; contenido: string; bytes: number }> {
    const limpia = ruta.replace(/^\.?\//, "");
    if (!rutaPermitida(limpia)) return { ok: false, ruta: limpia, contenido: "Ruta fuera de la lista de lectura permitida.", bytes: 0 };
    try {
        const info = await stat(path.join(RAÍZ, limpia));
        const contenido = await readFile(path.join(RAÍZ, limpia), "utf-8");
        // Las bitácoras crecen por el final: se leen por el final (lo reciente). El resto, por el principio.
        const porElFinal = limpia.endsWith(".log") || /revisiones\.md$|memory\/state\.md$|relevo\/relevo\.md$|logs\/logs\.md$|progreso\.md$/.test(limpia);
        const recorte = porElFinal ? contenido.slice(-maxChars) : contenido.slice(0, maxChars);
        return { ok: true, ruta: limpia, contenido: recorte, bytes: info.size };
    } catch {
        return { ok: false, ruta: limpia, contenido: "No existe en esta máquina.", bytes: 0 };
    }
}

// ── Briefing vivo ───────────────────────────────────────────────────────────

/** Estado vivo del sistema en texto compacto (≈2-4k tokens). */
export async function construirBriefing(): Promise<string> {
    const [rama, relevo, eventos, progreso, tareas] = await Promise.all([
        construirRamificacion(4).catch(() => null),
        leerEstadoRelevo().catch(() => null),
        leerEventosDelBus(12).catch(() => []),
        leerProgreso().catch(() => ({})),
        leerColas().catch(() => []),
    ]);
    const lineas: string[] = [];
    lineas.push(`Fecha y hora: ${ahora()}`);
    if (relevo) {
        lineas.push(`Repositorio: HEAD ${relevo.git.head || "?"} · commits sin publicar: ${relevo.git.sinPush ?? "?"} · adenda actual: ${relevo.adenda || "?"}`);
        if (relevo.ultimoRelevo) lineas.push(`Último relevo: ${relevo.ultimoRelevo.de} → ${relevo.ultimoRelevo.a} (${relevo.ultimoRelevo.fecha}): ${relevo.ultimoRelevo.resumen.slice(0, 300)}`);
    }
    if (rama) {
        lineas.push(`Agentes vivos ahora: ${rama.latidos.length}`);
        for (const l of rama.latidos) {
            lineas.push(`  · ${l.donde} · ${l.tarea} · ${l.fase} · ${l.modelo} (${l.proveedor ?? "?"}) · ${l.minutos} min · tokens in/out ${l.tokens?.entrada ?? "?"}/${l.tokens?.salida ?? "?"} · ventana ${l.ventana ?? "?"}`);
        }
        for (const e of rama.enjambres) {
            const caidos = Object.entries(e.proveedores ?? {}).filter(([, v]) => v.estado === "caido").map(([p]) => p);
            lineas.push(`Orquestador ${e.donde} · ${e.cola} · ${e.agentesActivos} escribiendo · ${e.integradas} integradas · memoria libre ${e.memoriaMb ?? "?"} MB · proveedores caídos: ${caidos.join(", ") || "ninguno"}`);
        }
        lineas.push("Olas recientes:");
        for (const o of rama.olas) {
            lineas.push(`  ${o.id}: ${o.hechas}/${o.total} integradas · ${o.enCurso} en curso · ${o.fallidas} fallidas · ${o.sinCambios} sin cambios · ${o.pendientes} pendientes`);
            for (const t of o.tareas) {
                lineas.push(`    - ${t.id} [${t.estado}${t.donde ? ` · ${t.donde}` : ""}] ${t.titulo.slice(0, 90)}${t.dependencias.length ? ` (depende de ${t.dependencias.join(", ")})` : ""}${t.modelo ? ` · ${t.modelo.split("/").slice(-1)[0]}` : ""}${t.sha ? ` · ${t.sha}` : ""}${t.nota ? ` · ${t.nota.slice(0, 80)}` : ""}`);
            }
        }
    }
    try {
        const fila = colaInteligente(tareas, progreso, rama?.latidos ?? []).slice(0, 8);
        if (fila.length) {
            lineas.push("Fila inteligente (siguientes):");
            for (const f of fila) lineas.push(`  ${f.prioridad}. ${f.id} (${f.ola}) · ${f.estado || "pendiente"} · ${f.motivo}`);
        }
    } catch {
        // sin fila
    }
    if (eventos.length) {
        lineas.push("Últimos eventos del bus:");
        for (const e of eventos.slice(0, 12)) lineas.push(`  ${e.t.slice(11, 16)} ${e.quien} ${e.tipo} ${e.tarea} · ${e.texto.slice(0, 140)}`);
    }
    return lineas.join("\n");
}

/** Trozos de memoria relevantes para la pregunta (por palabras clave; máximo ~6k). */
export async function contextoPorPalabras(pregunta: string, maxChars = 6000): Promise<string> {
    const q = pregunta.toLowerCase();
    const candidatos: Array<{ ruta: string; pistas: string[] }> = [
        { ruta: "starseed_memory_root/relevo/relevo.md", pistas: ["relevo", "handoff", "nota", "hermes", "claude", "sigue", "pendiente", "estado"] },
        { ruta: "memory/state.md", pistas: ["estado", "cambio", "bitácora", "bitacora", "historia", "adenda"] },
        { ruta: "memory/orquestacion-economica.md", pistas: ["orquest", "económ", "econom", "crédito", "credito", "proveedor", "modelo", "api", "cupo", "flota", "coste"] },
        { ruta: "CLAUDE.md", pistas: ["regla", "cómo", "como", "arquitect", "ruta", "medio", "dock", "voz", "enjambre", "supervisor", "fuente", "mando"] },
        { ruta: "starseed_memory_root/olas/progreso.md", pistas: ["progreso", "tarea", "ola", "commit", "fallo", "integr"] },
        { ruta: "starseed_memory_root/olas/revisiones.md", pistas: ["revisi", "bloquea", "revisor", "riesgo"] },
        { ruta: "memory/roadmap.md", pistas: ["roadmap", "fase", "plan", "futuro", "siguiente"] },
        { ruta: "memory/architecture.md", pistas: ["arquitect", "decisi", "diseño", "componente"] },
        { ruta: "starseed_memory_root/index.md", pistas: ["memoria", "memory root", "índice", "indice", "raíz"] },
        { ruta: "starseed_memory_root/tasks/tasks.md", pistas: ["tarea", "tareas", "pendiente", "to-do", "todo"] },
        { ruta: "architecture/astraura-inteligencia.md", pistas: ["astraura", "router", "aurora", "inteligencia", "sentidos"] },
    ];
    const elegidos = candidatos.filter((c) => c.pistas.some((p) => q.includes(p))).slice(0, 4);
    const partes: string[] = [];
    let total = 0;
    for (const c of elegidos) {
        const r = await leerArchivoPermitido(c.ruta, Math.min(3000, maxChars - total));
        if (!r.ok || !r.contenido.trim()) continue;
        partes.push(`### ${c.ruta}\n${r.contenido}`);
        total += r.contenido.length;
        if (total >= maxChars) break;
    }
    return partes.join("\n\n");
}

const SISTEMA = `Eres el ASISTENTE TÉCNICO DE ADMINISTRACIÓN del Puente de Mando de StarSeed OS: administras la orquestación multiagéntica (el «enjambre»: olas de tareas que escriben agentes opencode con modelos gratuitos de xKiro, NVIDIA NIM y otros; revisión cruzada; tsc + vitest; integración en main; un orquestador en la Mac de Alex y otro en el contenedor de la nube; el bus de eventos en Supabase; el relevo Claude ⇄ Hermes).
Hablas en español, con precisión técnica y sin rodeos. Te basas SOLO en el estado vivo y en los archivos que se te dan; si algo no está, dilo y propón leerlo. Nunca inventes shas, tareas o estados.
Reglas permanentes del proyecto: ningún proveedor debe agotar sus créditos; las claves solo viven en archivos de entorno (nunca en repo, documentos ni memorias); no se hace git push sin la palabra de Alex; todo cambio se verifica funcionalmente en localhost antes de darse por hecho.
Puedes PROPONER acciones para que la interfaz las ejecute. Escríbelas como un bloque JSON en una línea propia (puede haber varias):
{"accion":"ver_tarea","id":"VZ6"}                         → abre la ficha de esa tarea en la ramificación
{"accion":"leer","ruta":"memory/state.md"}                 → te devuelve ese archivo en el siguiente turno (solo rutas de memorias, relevo, olas, informes, CLAUDE.md, architecture/)
{"accion":"lanzar","cola":"241-x","donde":"nube","workers":2} → lanza una cola existente (pide confirmación humana)
{"accion":"detener","cola":"241-x","donde":"nube"}           → detiene el orquestador de esa cola (pide confirmación humana)
Cuando el usuario pida crear o corregir una ola, describe las tareas con id, título, archivos, prompt y dependencias y remítelo al Diseñador de olas del Mando (botón «Diseñar ola»), o propón la cola en JSON con ese formato.
No añadas líneas de «uso» ni digas qué modelo eres: la interfaz muestra el modelo real, los tokens y la latencia de cada turno.`;

/** Extrae las acciones propuestas (bloques JSON) del texto del modelo. */
export function extraerAcciones(textoModelo: string): AccionPropuesta[] {
    const acciones: AccionPropuesta[] = [];
    const re = /\{[^{}\n]*"accion"\s*:\s*"(lanzar|detener|ver_tarea|leer)"[^{}\n]*\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(textoModelo)) !== null) {
        try {
            const d = objeto(JSON.parse(m[0]));
            const accion = texto(d.accion) as AccionPropuesta["accion"];
            const a: AccionPropuesta = { accion };
            if (texto(d.cola)) a.cola = texto(d.cola).replace(/^cola-/, "").replace(/\.json$/, "");
            if (texto(d.donde)) a.donde = texto(d.donde) === "mac" ? "mac" : "nube";
            if (typeof d.workers === "number") a.workers = Math.min(4, Math.max(1, Math.round(d.workers)));
            if (texto(d.id)) a.id = texto(d.id);
            if (texto(d.ruta)) a.ruta = texto(d.ruta);
            acciones.push(a);
        } catch {
            // bloque mal formado: se ignora
        }
    }
    return acciones.slice(0, 6);
}

/**
 * Un turno completo: guarda el mensaje del usuario, construye el contexto (briefing +
 * memorias relevantes + últimos 12 turnos), llama al modelo y guarda la respuesta.
 */
export async function responder(
    chat: ChatMando,
    mensajeUsuario: string,
    modelo: string,
): Promise<{ chat: ChatMando; respuesta: MensajeChat; acciones: AccionPropuesta[] }> {
    const limpio = mensajeUsuario.trim().slice(0, 6000);
    chat.mensajes.push({ rol: "usuario", texto: limpio, t: ahora() });
    chat.modelo = modelo;
    if (chat.mensajes.length === 1 && chat.titulo === "Chat con el asistente") chat.titulo = limpio.slice(0, 60);

    const [briefing, memorias] = await Promise.all([construirBriefing(), contextoPorPalabras(limpio)]);
    const sistema = `${SISTEMA}\n\n## ESTADO VIVO DEL SISTEMA\n${briefing}${memorias ? `\n\n## MEMORIAS RELEVANTES\n${memorias}` : ""}`;
    const historial: MensajeModelo[] = chat.mensajes.slice(-12).map((m) => ({
        rol: m.rol === "asistente" ? "assistant" : "user",
        texto: m.rol === "herramienta" ? `[archivo leído]\n${m.texto}` : m.texto,
    }));
    const r = await llamarModelo(modelo, [{ rol: "system", texto: sistema }, ...historial]);
    const respuesta: MensajeChat = { rol: "asistente", texto: r.texto || "(sin respuesta)", t: ahora(), modelo, tokens: r.tokens, latenciaMs: r.latenciaMs };
    chat.mensajes.push(respuesta);
    await guardarChat(chat);
    return { chat, respuesta, acciones: extraerAcciones(r.texto) };
}
