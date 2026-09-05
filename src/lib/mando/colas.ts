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

const RAÍZ = process.cwd();
const OLAS = path.join(RAÍZ, "starseed_memory_root", "olas");
const PATRON_ID = /^[A-Z][A-Z0-9]{0,7}[0-9]?$/;
const PATRON_NOMBRE = /^[0-9]{2,4}(-[a-z0-9]+){0,6}$/;
const MODELOS_PERMITIDOS = new Set([
    "", "xkiro/qwen/qwen3-coder-plus:free", "nvidia/moonshotai/kimi-k3", "xkiro/minimax/minimax-m3:free",
    "nvidia/deepseek-ai/deepseek-v4-flash-0731", "xkiro/qwen/qwen3.8-max:free", "nvidia/deepseek-ai/deepseek-v4-pro-0813",
    "xkiro/deepseek/deepseek-v4-pro", "xkiro/mistralai/devstral-medium",
]);

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

/** Una cola completa en disco. */
export interface ColaCompleta {
    nombre: string;
    archivo: string;
    tareas: TareaCola[];
    modificada: string;
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

/** Modelos que el diseñador puede asignar (mismos que la rotación del orquestador). */
export function modelosAsignables(): string[] {
    return [...MODELOS_PERMITIDOS].filter(Boolean);
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
    return salida.sort((a, b) => b.nombre.localeCompare(a.nombre, undefined, { numeric: true }));
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
        const modelo = texto(d.modelo).trim();
        if (!MODELOS_PERMITIDOS.has(modelo)) errores.push(`${id}: modelo «${modelo}» fuera de la rotación.`);
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
