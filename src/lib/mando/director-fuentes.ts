/** Fuentes reales del Director del Mando (Ola 318 · p318B): lectores de I/O
 *  tolerantes que alimentan `director-datos.ts`. Solo servidor. */
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import type { LatidoEntrada, TareaLatido, ProgresoEntrada, SaludProveedor, MensajeCanal } from "@/lib/mando/director-datos";
const execFileAsync = promisify(execFile);
async function intentar<T>(f: () => Promise<T>, porDefecto: T): Promise<T> { try { return await f(); } catch { return porDefecto; } }
function objeto(v: unknown): Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; }
function texto(v: unknown): string | undefined { return typeof v === "string" && v.trim() ? v : undefined; }
function num(v: unknown): number | undefined { return typeof v === "number" && Number.isFinite(v) ? v : undefined; }
function arr(v: unknown): string[] | undefined { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined; }
function fechaSeg(v: unknown): number | undefined {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "string" || !v.trim()) return undefined;
    const ms = Date.parse(/[TZ]/.test(v) ? v : `${v.replace(" ", "T")}Z`); return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}
export const leerJsonOpcional = (ruta: string): Promise<unknown> => // JSON opcional; null si falta o está corrupto
    intentar(async () => JSON.parse(await readFile(ruta, "utf-8")) as unknown, null);
const listar = (dir: string, p: string): Promise<string[]> =>
    intentar(async () => (await readdir(dir)).filter((n) => n.startsWith(p) && n.endsWith(".json")), []);
export interface TareaColaFuente { id?: string; ola?: string; titulo?: string; archivos?: string[]; depende?: string[]; modelo?: string; aprobacion?: boolean }
export interface ColaFuente { nombre: string; tareas: TareaColaFuente[] }
export interface ServicioLaunchd { etiqueta: string; pid: number | null; ultimaSalida: number | null } // entrada de `launchctl list`
function tareaLatidoDe(v: unknown): TareaLatido | null {
    const d = objeto(v);
    const fase = texto(d.fase), avance = num(d.avance);
    if (fase === undefined || avance === undefined) return null;
    return { fase, avance, bytes: num(d.bytes), modelo: texto(d.modelo), intento: num(d.intento) };
}
function parsearFechaLocal(s: unknown): number | undefined {
    if (typeof s === "number" && Number.isFinite(s)) return s;
    if (typeof s !== "string" || !s.trim()) return undefined;
    const ms = new Date(s.replace(" ", "T")).getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}
// Nombre del fichero de latido: `latidos-<cola>.json`. De cada tanda (relanzamiento del
// vigilante) queda un fichero con `t` fresca; durante los ~15 min posteriores conviven el
// nuevo y el anterior con los MISMOS ids. Para no duplicar filas, agrupamos por `<cola>` y
// nos quedamos solo con el fichero más reciente de cada cola.
function colaDeNombreLatido(nombre: string): string | null {
    const sinPref = nombre.slice("latidos-".length);
    const base = sinPref.replace(/\.json$/, "");
    return base || null;
}

export async function leerLatidos(raiz: string, ahora = Date.now() / 1000): Promise<LatidoEntrada[]> {
    const dir = path.join(raiz, "starseed_memory_root", "olas");
    // Por cada cola conservamos el nombre del fichero con mayor `t` (aún sin leer su contenido).
    const masRecientePorCola = new Map<string, { nombre: string; t: number }>();
    for (const nombre of await listar(dir, "latidos-")) {
        const crudo = objeto(await leerJsonOpcional(path.join(dir, nombre)));
        const t = parsearFechaLocal(crudo.t);
        if (!t) continue;
        const cola = colaDeNombreLatido(nombre);
        if (!cola) continue;
        const vigente = masRecientePorCola.get(cola);
        if (!vigente || t > vigente.t) masRecientePorCola.set(cola, { nombre, t });
    }
    const latidos: LatidoEntrada[] = [];
    for (const { nombre } of masRecientePorCola.values()) {
        const crudo = objeto(await leerJsonOpcional(path.join(dir, nombre)));
        const t = parsearFechaLocal(crudo.t);
        if (!t || ahora - t > 900) continue; // descarta más antiguos que 15 minutos (900 s)
        const tareas: Record<string, TareaLatido> = {};
        for (const [id, v] of Object.entries(objeto(crudo.tareas))) {
            const tarea = tareaLatidoDe(v);
            if (tarea) tareas[id] = tarea;
        }
        latidos.push({ tareas });
    }
    return latidos;
}
export async function leerProgreso(raiz: string): Promise<Record<string, ProgresoEntrada>> { // olas/progreso.json
    const crudo = objeto(await leerJsonOpcional(path.join(raiz, "starseed_memory_root", "olas", "progreso.json"))), progreso: Record<string, ProgresoEntrada> = {};
    for (const [id, v] of Object.entries(crudo)) {
        const d = objeto(v);
        progreso[id] = { estado: texto(d.estado), nota: texto(d.nota), depende_de: arr(d.depende_de) };
    }
    return progreso;
}
function tareaColaDe(bruto: unknown): TareaColaFuente {
    const d = objeto(bruto);
    return { id: texto(d.id), ola: texto(d.ola), titulo: texto(d.titulo), archivos: arr(d.archivos),
        depende: arr(d.depende), modelo: texto(d.modelo), aprobacion: typeof d.aprobacion === "boolean" ? d.aprobacion : undefined };
}
export async function leerColasFuente(raiz: string): Promise<ColaFuente[]> { // olas/cola-*.json sin cola-auto-*
    const dir = path.join(raiz, "starseed_memory_root", "olas"), colas: ColaFuente[] = [];
    for (const nombre of await listar(dir, "cola-")) {
        if (nombre.startsWith("cola-auto-")) continue;
        const crudo = await leerJsonOpcional(path.join(dir, nombre));
        const lista: unknown[] = Array.isArray(crudo) ? crudo
            : Array.isArray(objeto(crudo).tareas) ? (objeto(crudo).tareas as unknown[]) : [];
        colas.push({ nombre, tareas: lista.map(tareaColaDe) });
    }
    return colas;
}
export async function leerSalud(home: string): Promise<Record<string, SaludProveedor>> { // ~/.starseed/salud-proveedores.json
    const crudo = objeto(await leerJsonOpcional(path.join(home, ".starseed", "salud-proveedores.json"))), salud: Record<string, SaludProveedor> = {};
    for (const [prov, v] of Object.entries(crudo)) {
        if (prov === "ultimo_revisor_ok") continue;
        const d = objeto(v);
        if (!Object.keys(d).length) continue;
        salud[prov] = { estado: texto(d.estado), sin_cupo_hasta: fechaSeg(d.sin_cupo_hasta), motivo: texto(d.motivo) };
    }
    return salud;
}
export async function leerModelos(raiz: string): Promise<string[]> { // MODELOS = […] de starseed-enjambre.py, por regex
    const ruta = path.join(raiz, "scripts", "enjambre", "starseed-enjambre.py");
    const contenido = await intentar(() => readFile(ruta, "utf-8"), ""), inicio = contenido.indexOf("MODELOS = [");
    if (inicio === -1) return [];
    const cierre = contenido.indexOf("\n]", inicio);
    const bloque = cierre === -1 ? contenido.slice(inicio) : contenido.slice(inicio, cierre), modelos: string[] = [];
    for (const linea of bloque.split("\n")) {
        if (linea.trim().startsWith("#")) continue;
        for (const m of linea.matchAll(/"([^"#]+\/[^"#]+)"/g)) modelos.push(m[1]);
    }
    return modelos;
}
function servicioDeLinea(linea: string): ServicioLaunchd | null {
    const c = linea.trim().split(/\s+/);
    if (c.length < 3 || !c[2].startsWith("com.starseed.")) return null;
    const pid = Number.parseInt(c[0], 10), salidaCodigo = Number.parseInt(c[1], 10);
    return { etiqueta: c[2].replace(/^com\.starseed\./, ""),
        pid: Number.isNaN(pid) ? null : pid, ultimaSalida: Number.isNaN(salidaCodigo) ? null : salidaCodigo };
}
export async function leerServicios(): Promise<ServicioLaunchd[]> { // launchctl list; sin el binario (Linux/CI) → []
    const stdout = await intentar(async () => (await execFileAsync("launchctl", ["list"], { timeout: 5000 })).stdout, "");
    return stdout.split("\n").map(servicioDeLinea).filter((s): s is ServicioLaunchd => s !== null);
}
export async function leerCanal(raiz: string, n = 60): Promise<MensajeCanal[]> { // últimas n líneas de mando/canal.jsonl
    const ruta = path.join(raiz, "starseed_memory_root", "mando", "canal.jsonl");
    const contenido = await intentar(() => readFile(ruta, "utf-8"), ""), mensajes: MensajeCanal[] = [];
    for (const linea of contenido.split("\n").filter((l) => l.trim()).slice(-n)) {
        try {
            const d = objeto(JSON.parse(linea));
            mensajes.push({ quien: texto(d.quien), texto: texto(d.texto), hora: fechaSeg(d.epoch) ?? texto(d.t) });
        } catch {
            // línea corrupta: se ignora
        }
    }
    return mensajes;
}
export async function leerAsuntosMain(raiz: string, n = 800): Promise<string[]> { // últimos n asuntos de git log main
    const cmd = ["log", "main", "--format=%s", "-n", String(n)], opts = { cwd: raiz, timeout: 8000, maxBuffer: 4 * 1024 * 1024 };
    const stdout = await intentar(async () => (await execFileAsync("git", cmd, opts)).stdout, "");
    return stdout.split("\n").filter((l) => l.trim());
}
