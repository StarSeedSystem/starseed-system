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

const RAÍZ = raizDelProyecto();
const OLAS = path.join(RAÍZ, "starseed_memory_root", "olas");
const PATRON_ID = /^[A-Z][A-Z0-9]{0,7}[0-9]?$/;
const PATRON_NOMBRE = /^[0-9]{2,4}(-[a-z0-9]+){0,6}$/;
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
 */
export const APIS_ESCRITORAS = ["xkiro", "nim", "aihubmix", "tokenrouter", "openrouter"] as const;
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
    return salida.sort((a, b) => b.nombre.localeCompare(a.nombre, undefined, { numeric: true }));
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
            { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, cache: "no-store" },
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
    const n = Math.min(4, Math.max(1, Math.round(workers)));
    const permitidos = extra.filter((x) => ["--sin-revision", "--reanudar"].includes(x));
    const hijo = spawn("python3", [orquestador, path.join("starseed_memory_root", "olas", archivo), "--workers", String(n), ...permitidos], {
        cwd: RAÍZ,
        detached: true,
        stdio: ["ignore", registro, registro],
        env: { ...process.env, STARSEED_ROOT: RAÍZ, STARSEED_DONDE: "mac", STARSEED_MEDIO: "mando" },
    });
    hijo.unref();
    return { ok: true, pid: hijo.pid };
}

/** Publica en el bus la orden firmada de lanzar la cola en la nube (con la cola entera). */
export async function lanzarEnNube(nombre: string, tareas: TareaCola[], workers: number): Promise<{ ok: boolean; error?: string }> {
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
                texto: `lanzar cola-${nombre} en la nube · ${tareas.length} tareas · ${workers} trabajadores`,
                datos: { donde: "nube", cola: `cola-${nombre}`, workers, t, firma, tareas, categoria: "ola" },
            }),
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
        });
        return r.ok ? { ok: true } : { ok: false, error: `El bus rechazó la orden (HTTP ${r.status}).` };
    } catch {
        return { ok: false, error: "No se pudo escribir en el bus." };
    }
}

// ── Reasignar una tarea: otro modelo/API, u otro servidor, sin romper el flujo ─────────

/** Orden por tarea para el orquestador (archivo `control-<cola>.json`, lo lee cada 20 s). */
interface OrdenControl {
    accion: "reasignar" | "soltar";
    modelo?: string;
    dondeNuevo?: string;
}

/** Deja la orden en el archivo de control de esta máquina (o anota el modelo en la cola si no corre). */
async function controlAqui(nombre: string, tarea: string, orden: OrdenControl): Promise<{ ok: boolean; error?: string }> {
    const hayOrquestador = await orquestadorAqui(nombre);
    if (!hayOrquestador) {
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
    /** Cola (sin `cola-`). */
    nombre: string;
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
    if (!PATRON_NOMBRE.test(p.nombre)) return { ok: false, error: "Nombre de cola no válido." };
    if (!PATRON_ID.test(p.tarea)) return { ok: false, error: "Id de tarea no válido." };
    const modelo = p.modelo ? modeloParaOrquestador(p.modelo.trim()) : "";
    if (modelo && !modeloEscritorValido(modelo)) return { ok: false, error: `Con «${modelo}» el orquestador no puede escribir: elige una API de ${APIS_ESCRITORAS.join(", ")}.` };
    const destino = p.donde ?? p.dondeActual;

    if (destino === p.dondeActual) {
        if (!modelo) return { ok: false, error: "Elige un modelo o un servidor distinto: no hay nada que cambiar." };
        const orden: OrdenControl = { accion: "reasignar", modelo };
        const r = p.dondeActual === "nube" ? await controlEnNube(p.nombre, p.tarea, orden) : await controlAqui(p.nombre, p.tarea, orden);
        return r.ok ? { ok: true, detalle: `${p.tarea} seguirá con ${modelo} en ${p.dondeActual}; el flujo (tsc → tests → revisión → integración) no cambia.` } : r;
    }

    // Mover de servidor: la tarea y sus dependientes no terminados viajan juntos.
    const cola = (await leerColasCompletas()).find((c) => c.nombre === p.nombre);
    if (!cola) return { ok: false, error: "No encuentro esa cola ni en disco ni en el bus." };
    const porId = new Map(cola.tareas.map((t) => [t.id, t]));
    if (!porId.has(p.tarea)) return { ok: false, error: `La tarea ${p.tarea} no está en cola-${p.nombre}.` };
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
    const nombreNuevo = `${p.nombre}-${p.tarea.toLowerCase()}`.slice(0, 60);
    if (!PATRON_NOMBRE.test(nombreNuevo)) return { ok: false, error: "No puedo derivar un nombre de cola válido para el traslado." };

    // 1) Soltar aquí/allí (si hay orquestador; si no, no pasa nada).
    const soltadas: string[] = [];
    for (const id of mover) {
        const orden: OrdenControl = { accion: "soltar", dondeNuevo: destino };
        const r = p.dondeActual === "nube" ? await controlEnNube(p.nombre, id, orden) : await controlAqui(p.nombre, id, orden);
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
