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

import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import type {
    FotoEnjambre,
    LatidoTarea,
    MedidorAgentes,
    TareaEnFila,
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

/**
 * Dónde vive la carpeta de olas. En este repositorio es `starseed_memory_root/olas`, pero el
 * lector buscaba en `olas/` a secas y por eso las colas, el progreso y los latidos llegaban
 * vacíos al Mando mientras los informes —que sí probaban las dos rutas— sí aparecían.
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
            // se prueba la siguiente
        }
    }
    olasResuelta = "starseed_memory_root/olas";
    return olasResuelta;
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
    // `bitacora.jsonl` no trae `id` en sus líneas: sin esto todos los eventos salían con
    // id "" y React recibía doce hijos con la misma clave. El número de línea es estable
    // (la bitácora solo crece por el final) y único.
    let numeroDeLinea = 0;
    for (const linea of contenido.split("\n")) {
        if (!linea.trim()) continue;
        numeroDeLinea += 1;
        try {
            const bruto = JSON.parse(linea) as unknown;
            const e = objeto(bruto);
            const evento: EventoRelevo = {
                id: texto(e.id ?? e.nodo ?? e.linea) || `bit-${numeroDeLinea}`,
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
    const datos = await leerJson(`${await directorioOlas()}/progreso.json`);
    return typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>) : {};
}

/** Colas de olas: todos los `olas/cola-*.json` → `TareaOla[]`. */
export async function leerColas(): Promise<TareaOla[]> {
    const dirOlas = await directorioOlas();
    const nombres = await listarArchivos(dirOlas, "cola-");
    const tareas: TareaOla[] = [];

    for (const nombre of nombres) {
        const crudo = await leerJson(`${dirOlas}/${nombre}`);
        // Las colas del enjambre son ARRAYS de tareas ([{id, ola, titulo, archivos, prompt, depende}]).
        // Leerlas como un objeto suelto es lo que dejaba el Mando en «0 tareas» con 11 colas en disco.
        const lista: unknown[] = Array.isArray(crudo)
            ? crudo
            : Array.isArray((objeto(crudo) as { tareas?: unknown }).tareas)
              ? ((objeto(crudo) as { tareas: unknown[] }).tareas)
              : [crudo];
        const nombreCola = nombre.replace(/^cola-/, "").replace(/\.json$/, "");

        for (const bruto of lista) {
            const datos = objeto(bruto);
            const id = texto(datos.id);
            if (!tieneTexto(id)) continue;
            const deps = Array.isArray(datos.depende)
                ? (datos.depende as unknown[])
                : Array.isArray(datos.dependencias)
                  ? (datos.dependencias as unknown[])
                  : [];
            tareas.push({
                id,
                ola: texto(datos.ola) || nombreCola,
                titulo: texto(datos.titulo ?? datos.título ?? datos.nombre ?? datos.descripcion),
                dependencias: deps.map((d) => texto(d)).filter((d) => tieneTexto(d)),
                cola: nombreCola,
            });
        }
    }

    return tareas;
}

/**
 * ¿Hay alguna ola en marcha AHORA? No se pregunta a un archivo de estado que alguien tiene que
 * acordarse de actualizar, sino a la máquina: si no hay proceso, no hay ola.
 */
export async function enjambreEnMarcha(): Promise<boolean> {
    try {
        const { stdout } = await promisify(execFile)("ps", ["ax", "-o", "command="], {
            timeout: 5000,
            maxBuffer: 4 * 1024 * 1024,
        });
        return stdout.split("\n").some((l) => l.includes("starseed-enjambre.py"));
    } catch {
        return false;
    }
}

/**
 * Medidor de agentes: cuántos están escribiendo AHORA, cuántos caben y cuánta memoria queda.
 * El techo real de este enjambre no son las APIs, es la RAM: cada `opencode run` pesa, y por
 * debajo del umbral los agentes arrancan igual pero se arrastran.
 */
export async function medirAgentes(): Promise<MedidorAgentes> {
    let activos = 0;
    let orquestadores = 0;
    try {
        const { stdout } = await promisify(execFile)("ps", ["ax", "-o", "command="], {
            timeout: 5000,
            maxBuffer: 4 * 1024 * 1024,
        });
        for (const linea of stdout.split("\n")) {
            if (linea.includes("opencode run")) activos += 1;
            else if (linea.includes("starseed-enjambre.py")) orquestadores += 1;
        }
    } catch {
        // sin ps no se puede medir; se devuelve lo que haya
    }

    let memoriaLibreMb: number | null = null;
    try {
        const { stdout } = await promisify(execFile)("vm_stat", [], { timeout: 5000 });
        let pagina = 4096;
        let libres = 0;
        for (const linea of stdout.split("\n")) {
            const tam = /page size of (\d+) bytes/.exec(linea);
            if (tam) pagina = Number(tam[1]);
            const libre = /^Pages (free|inactive):\s+(\d+)/.exec(linea);
            if (libre) libres += Number(libre[2]);
        }
        memoriaLibreMb = Math.round((libres * pagina) / 1048576);
    } catch {
        // en Linux no hay vm_stat: se queda en null y el panel no lo pinta
    }

    // Cuántos caben: uno por cada ~700 MB libres, con el umbral del enjambre (1400 MB) como
    // suelo. No es una cifra teórica: sale de ver la Mac ahogarse con tres a la vez.
    const capacidad =
        memoriaLibreMb === null ? activos : Math.max(activos, Math.floor(memoriaLibreMb / 700));

    return { activos, orquestadores, capacidad, memoriaLibreMb, holgado: (memoriaLibreMb ?? 0) > 1400 };
}

/**
 * Fila de tareas en orden inteligente: qué debería tocarle al siguiente agente y POR QUÉ.
 * El orden no es el del archivo: primero lo que está listo para empezar (sin dependencias
 * pendientes), después lo que ya falló menos veces, y al final lo bloqueado.
 */
export function colaInteligente(
    tareas: TareaOla[],
    progreso: Record<string, unknown>,
    latidos: LatidoTarea[],
): TareaEnFila[] {
    const estadoDe = (id: string): string => texto(objeto(progreso[id]).estado);
    const terminada = (id: string): boolean =>
        ["commit", "sin_cambios", "sustituida"].includes(estadoDe(id));
    const enMarcha = new Set(latidos.map((l) => l.tarea));

    const fila: TareaEnFila[] = [];
    for (const tarea of tareas) {
        if (terminada(tarea.id)) continue;
        const estado = estadoDe(tarea.id);
        const pendientes = tarea.dependencias.filter((d) => !terminada(d));
        const fallidos = Array.isArray(objeto(progreso[tarea.id]).modelos_fallidos)
            ? (objeto(progreso[tarea.id]).modelos_fallidos as unknown[]).length
            : 0;

        let prioridad: number;
        let motivo: string;
        if (enMarcha.has(tarea.id)) {
            prioridad = 0;
            motivo = "un agente la está escribiendo ahora";
        } else if (pendientes.length > 0) {
            prioridad = 40;
            motivo = `espera a ${pendientes.join(", ")}`;
        } else if (estado.startsWith("fallo") || estado === "conflicto") {
            prioridad = 20;
            motivo = `quedó en ${estado}; reintento con otro modelo`;
        } else if (fallidos > 0) {
            prioridad = 15;
            motivo = `${fallidos} modelo(s) ya fallaron aquí; empieza por otro`;
        } else {
            prioridad = 10;
            motivo = "lista para empezar";
        }

        fila.push({
            id: tarea.id,
            ola: tarea.ola,
            titulo: tarea.titulo,
            estado: estado || "pendiente",
            dependenciasPendientes: pendientes,
            modelosFallidos: fallidos,
            prioridad,
            motivo,
        });
    }

    return fila.sort((a, b) => a.prioridad - b.prioridad || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/**
 * Latidos del BUS: los orquestadores —de esta Mac y del contenedor de Cowork— publican cada
 * 2 min un evento `latido` en `relevo_eventos` con la foto completa en `datos`: tareas, fase,
 * modelo, tokens reales, proveedores y memoria. Sin esto el Mando solo veía la máquina donde
 * corre, y los agentes de la nube «no aparecían».
 */
export async function leerLatidosDelBus(): Promise<{ latidos: LatidoTarea[]; enjambres: FotoEnjambre[] }> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return { latidos: [], enjambres: [] };
    let filas: Array<{ t: string; tipo: string; texto: string; datos: unknown }> = [];
    try {
        const desde = new Date(Date.now() - 4 * 60 * 1000).toISOString();
        // También `cola_terminada` y `detenida`: un latido de hace 3 min con «P2 escribiendo»
        // ya no vale si después la cola terminó o la pararon (el orquestador muerto no
        // publica más latidos, y la ventana de 4 min lo dejaba «en curso» hasta caducar).
        const r = await fetch(
            `${url}/rest/v1/relevo_eventos?select=t,tipo,texto,datos&tipo=in.(latido,cola_terminada,detenida)&t=gte.${encodeURIComponent(desde)}&order=id.desc&limit=60`,
            { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, cache: "no-store" },
        );
        if (!r.ok) return { latidos: [], enjambres: [] };
        filas = (await r.json()) as typeof filas;
    } catch {
        return { latidos: [], enjambres: [] };
    }
    // Un latido por (donde, cola): el más reciente manda; si lo más reciente de esa cola es
    // su cierre, no hay nada vivo que mostrar.
    const vistos = new Set<string>();
    const latidos: LatidoTarea[] = [];
    const enjambres: FotoEnjambre[] = [];
    for (const fila of filas) {
        const d = objeto(fila.datos);
        const donde = texto(d.donde) || "nube";
        const cola = texto(d.cola).replace(/\.json$/, "");
        const clave2 = `${donde}|${cola}`;
        if (!cola || vistos.has(clave2)) continue;
        vistos.add(clave2);
        if (fila.tipo !== "latido") continue;
        // El último latido de un orquestador («cola terminada · sin tareas activas») solo sirve
        // para apagar el anterior: no es un enjambre vivo que mostrar.
        if (/^cola terminada/.test(fila.texto) && !(Array.isArray(d.tareas) && (d.tareas as unknown[]).length)) continue;
        const medio = texto(d.medio) || undefined;
        enjambres.push({
            donde,
            cola,
            agentesActivos: número(d.agentesActivos, 0),
            memoriaMb: typeof d.memoriaMb === "number" ? d.memoriaMb : null,
            integradas: número(d.integradas, 0),
            proveedores: (objeto(d.proveedores) as FotoEnjambre["proveedores"]) ?? {},
            t: fila.t,
            medio,
        });
        const tareas = Array.isArray(d.tareas) ? (d.tareas as unknown[]) : [];
        for (const bruto of tareas) {
            const tk = objeto(bruto);
            const tokens = objeto(tk.tokens);
            latidos.push({
                tarea: texto(tk.id),
                cola,
                fase: texto(tk.fase),
                modelo: texto(tk.modelo),
                minutos: número(tk.minutos, 0),
                quietoSegundos: número(tk.quietoS, 0),
                donde,
                proveedor: texto(tk.proveedor),
                ventana: typeof tk.ventana === "number" ? tk.ventana : null,
                tokens: Object.keys(tokens).length
                    ? {
                          entrada: número(tokens.entrada, 0),
                          salida: número(tokens.salida, 0),
                          razonamiento: número(tokens.razonamiento, 0),
                          cacheLeida: número(tokens.cacheLeida, 0),
                          llamadas: número(tokens.llamadas, 0),
                      }
                    : null,
                bytesLog: número(tk.bytesLog, 0),
                intento: número(tk.intento, 1),
                medio: texto(tk.medio) || medio,
            });
        }
    }
    return { latidos, enjambres };
}

/**
 * Eventos del BUS (no latidos): lo que los orquestadores de la Mac y de la nube, Hermes y
 * Claude van anotando en `relevo_eventos`. La bitácora local solo ve esta máquina; sin esto
 * «Últimos eventos» se quedaba en las notas de hace dos días mientras la nube integraba.
 */
export async function leerEventosDelBus(limite = 20): Promise<EventoRelevo[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return [];
    try {
        const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const r = await fetch(
            `${url}/rest/v1/relevo_eventos?select=id,t,quien,tipo,tarea,texto,datos&tipo=not.in.(latido,tunel,paso)&t=gte.${encodeURIComponent(desde)}&order=id.desc&limit=${Math.max(1, Math.min(100, limite))}`,
            { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, cache: "no-store" },
        );
        if (!r.ok) return [];
        const filas = (await r.json()) as unknown;
        if (!Array.isArray(filas)) return [];
        return (filas as unknown[]).map((f) => {
            const d = objeto(f);
            const datos = objeto(d.datos);
            const donde = texto(datos.donde);
            return {
                id: `bus-${número(d.id, 0)}`,
                t: texto(d.t),
                quien: texto(d.quien) + (donde ? ` · ${donde}` : ""),
                tipo: texto(d.tipo),
                tarea: texto(d.tarea),
                texto: texto(d.texto),
                datos: d.datos,
            };
        });
    } catch {
        return [];
    }
}

/**
 * Latidos: qué está haciendo CADA tarea ahora mismo. Los escribe el vigilante del enjambre en
 * `olas/latidos-<cola>.json` cada 20 s, con la fase real y el modelo que la está escribiendo.
 */
export async function leerLatidos(): Promise<LatidoTarea[]> {
    const dirOlas = await directorioOlas();
    const nombres = await listarArchivos(dirOlas, "latidos-");
    const ahora = Date.now();
    const latidos: LatidoTarea[] = [];

    for (const nombre of nombres) {
        // Un orquestador que muere de golpe deja su archivo de latidos con la última tarea
        // marcada como «escribiendo» para siempre. El vigilante lo reescribe cada 20 s, así que
        // si el archivo no se ha tocado en 3 minutos, esa ola ya no está viva: se ignora.
        try {
            const info = await stat(path.join(RAÍZ, dirOlas, nombre));
            if (ahora - info.mtimeMs > 3 * 60 * 1000) continue;
        } catch {
            continue;
        }
        const datos = objeto(await leerJson(`${dirOlas}/${nombre}`));
        const cola = (texto(datos.cola) || nombre.replace(/^latidos-/, "")).replace(/\.json$/, "");
        const medioArchivo = texto(datos.medio) || undefined;
        const porTarea = objeto(datos.tareas);
        for (const [tarea, bruto] of Object.entries(porTarea)) {
            const d = objeto(bruto);
            const fase = texto(d.fase);
            if (!tieneTexto(fase) || fase === "hecho") continue;
            const desde = número(d.desde, 0) * 1000;
            const avance = número(d.avance, 0) * 1000;
            latidos.push({
                tarea,
                cola,
                fase,
                modelo: texto(d.modelo),
                minutos: desde > 0 ? Math.max(0, Math.round((ahora - desde) / 60000)) : 0,
                quietoSegundos: avance > 0 ? Math.max(0, Math.round((ahora - avance) / 1000)) : 0,
                donde: "mac",
                medio: medioArchivo,
            });
        }
    }

    return latidos.sort((a, b) => a.tarea.localeCompare(b.tarea));
}

export function resumirOlas(tareas: TareaOla[], progreso: Record<string, unknown> = {}): OlaResumen[] {
    const porOla = new Map<string, TareaOla[]>();
    for (const tarea of tareas) {
        const clave = tarea.ola || tarea.id;
        const actual = porOla.get(clave) ?? [];
        actual.push(tarea);
        porOla.set(clave, actual);
    }

    const estadoDe = (id: string): string => texto(objeto(progreso[id]).estado);

    const resúmenes: OlaResumen[] = [];
    for (const [ola, lista] of porOla) {
        // Antes se daba todo por procesado y `restantes` era 0 fijo, así que el Mando decía
        // «0 tareas en curso» aunque hubiera una ola escribiendo. Ahora se cruza con progreso.json.
        let procesadas = 0;
        let sinCambios = 0;
        let bloqueantes = 0;
        let restantes = 0;
        for (const tarea of lista) {
            const estado = estadoDe(tarea.id);
            if (estado === "commit") procesadas += 1;
            else if (estado === "sin_cambios" || estado === "sustituida") sinCambios += 1;
            else if (estado.startsWith("fallo") || estado === "conflicto") bloqueantes += 1;
            else restantes += 1;
        }
        resúmenes.push({
            id: ola,
            titulo: lista[0]?.titulo ?? ola,
            seccion: ola,
            procesadas,
            sinCambios,
            bloqueantes,
            restantes,
            total: lista.length,
        });
    }
    return resúmenes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
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