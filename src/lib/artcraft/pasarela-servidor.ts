/**
 * Pasarela ArtCraft en SERVIDOR (contrato: `architecture/artcraft-y-rare.md` §3).
 * Lanza `<app>-cli mcp` SIN shell (spawn con lista de argumentos), sin red si puede
 * (`unshare -n --` en Linux; si no hay aislamiento, el resultado lleva `sinRed: false`),
 * con entorno mínimo (PATH, LANG y HOME = su directorio de trabajo; nunca variables de
 * claves) y raíces de lectura/escritura por neurona (figcraft y deckcraft; GridCraft no
 * tiene banderas: las rutas las inspecciona la política). Un cliente MCP por stdio hace
 * `iniciar()` y UNA `llamar()` (120 s) y mata al hijo al acabar. Como mucho 2 llamadas
 * a la vez (429). Registro: una línea por llamada con huella sha256 (12 hex) de los
 * parámetros, nunca su contenido. SOLO SERVIDOR: ningún componente de cliente puede
 * importar este módulo. El lanzador y el ejecutor se inyectan para las pruebas.
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs, constants as fsc } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ClienteMcpStdio, ErrorMcp, type RelojMcp, type TransporteMcp } from "./mcp-stdio";
import { evaluarLlamada } from "./politica";
import type { AppArtcraft } from "./politica-tablas";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";

/** Tiempo máximo de la llamada a una herramienta dentro del MCP. */
export const TIEMPO_LLAMADA_MS = 120_000;
/** Como mucho estas llamadas a ArtCraft a la vez en esta neurona (más → 429). */
export const MAX_EN_CURSO = 2;
/** Una línea del stdio de más de 32 MiB se corta (FigCraft limita cada línea a 32 MiB). */
export { LIMITE_LINEA } from "./mcp-stdio";
/** Contexto de trabajo: carpeta de ESTA neurona para la sesión (sin «..», sin espacios). */
export const CONTEXTO_VALIDO = /^[a-z0-9-]{1,40}$/;

/** Estado de la CLI en ESTA neurona: «donde» es solo el nombre del sitio, nunca el home real. */
export interface EstadoArtcraft {
    instalado: boolean;
    version: string | null;
    donde: string | null;
}
/** Raíces de trabajo del contexto: «lectura» = entrada/, «escritura» = salida/. */
export interface TrabajoArtcraft {
    raiz: string;
    lectura: string;
    escritura: string;
}
/** Una llamada del agente de la neurona a una herramienta de una Craft App. */
export interface LlamadaPasarela {
    app: AppArtcraft;
    herramienta: string;
    parametros: Record<string, unknown>;
    origen: Origen;
    ambito: Ambito;
    rol: Rol | null;
    contexto: string;
}
/** Estado 403 política · 409 confirmación · 429 ocupado · 500 error · 503 sin CLI · 504 tiempo. */
export interface ResultadoArtcraft {
    ok: boolean;
    resultado?: unknown;
    motivo?: string;
    status?: number;
    ms?: number;
    /** Cierto solo si el hijo corre aislado de la red (`unshare -n`). */
    sinRed?: boolean;
    confirmar?: boolean;
}

/** El hijo MCP reduce a: escribir una línea, oír su salida y morir. Solo servidor. */
export interface HijoMcp {
    escribir(linea: string): void;
    aLaSalida(cb: (t: string) => void): void;
    alFinal(cb: (code: number | null) => void): void;
    terminar(): void;
}
export type Lanzador = (bin: string, args: string[], opciones: { cwd: string; env: Record<string, string> }) => HijoMcp;
type Ejecutor = (bin: string, args: string[], timeout: number) => Promise<{ stdout: string; stderr: string; code: number }>;
type Registrar = (linea: string) => void;

const realLanzador: Lanzador = (bin, args, op) => {
    const hijo = spawn(bin, args, { cwd: op.cwd, env: { ...op.env } as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"] as const, windowsHide: true });
    return {
        escribir: (l) => hijo.stdin.write(`${l}\n`),
        aLaSalida: (cb) => hijo.stdout.on("data", (d: string | Buffer) => cb(String(d))),
        alFinal: (cb) => hijo.on("close", (code: number | null) => cb(code)),
        terminar: () => hijo.kill(),
    };
};
let lanzador: Lanzador = realLanzador;
/** Solo pruebas: sustituye el arranque del proceso hijo. */
export function _ponerLanzador(l: Lanzador | null): void {
    lanzador = l ?? realLanzador;
}

const ejecutorReal: Ejecutor = (bin, args, timeout) =>
    new Promise((resolver) => {
        execFile(bin, args, { timeout, maxBuffer: 64 * 1024, windowsHide: true }, (err, stdout, stderr) => {
            const code = err && typeof (err as { code?: unknown }).code === "number" ? Number((err as { code: number }).code) : err ? 1 : 0;
            resolver({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code });
        });
    });
let ejecutor: Ejecutor = ejecutorReal;
const cacheEstado = new Map<AppArtcraft, { t: number; v: EstadoArtcraft & { ruta: string | null } }>();
/** Solo pruebas: sustituye la ejecución de `--version` (y limpia la caché de estado). */
export function _ponerEjecutor(e: Ejecutor | null): void {
    ejecutor = e ?? ejecutorReal;
    cacheEstado.clear();
}

let registrar: Registrar = (linea) => console.info(linea);
/** Solo pruebas: sustituye el destino del registro. */
export function _ponerRegistro(r: Registrar | null): void {
    registrar = r ?? ((linea) => console.info(linea));
}

/** Huella sha256 (12 hex) de los parámetros, para el registro. */
export function huellaDe(parametros: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(parametros)).digest("hex").slice(0, 12);
}

/** Primer ejecutable con el nombre dado en el PATH (sin shell, sin búsqueda); null si no hay. */
async function buscarEjecutable(nombre: string): Promise<string | null> {
    const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    for (const d of dirs) {
        const c = path.join(d, nombre);
        try {
            await fs.access(c, fsc.X_OK);
            return c;
        } catch {
            /* siguiente sitio */
        }
    }
    return null;
}

/** Estado de `<app>-cli` en ESTA neurona: lo busca recorriendo el PATH, sin shell (caché 60 s). */
export async function estadoArtcraft(app: AppArtcraft, fresco = false): Promise<EstadoArtcraft & { ruta: string | null }> {
    const hit = cacheEstado.get(app);
    if (!fresco && hit && Date.now() - hit.t < 60_000) return hit.v;
    const ruta = await buscarEjecutable(`${app}-cli`);
    let version: string | null = null;
    if (ruta) {
        const r = await ejecutor(ruta, ["--version"], 5_000);
        version = r.code === 0 ? r.stdout.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/)?.[1] ?? null : null;
    }
    const home = os.homedir();
    const dirDeRuta = ruta ? path.dirname(ruta) : null;
    const v = {
        instalado: Boolean(ruta && version),
        version,
        donde: dirDeRuta === null ? null : dirDeRuta.startsWith(home) ? `~${dirDeRuta.slice(home.length)}` : dirDeRuta,
        ruta: ruta && version ? ruta : null,
    };
    cacheEstado.set(app, { t: Date.now(), v });
    return v;
}

/** `<STARSEED_DATOS_DIR o ~/.starseed>/artcraft/<contexto>/` con `entrada/` y `salida/` en 0o700. */
export async function directorioTrabajo(_app: AppArtcraft | null, contexto: string): Promise<TrabajoArtcraft | null> {
    if (!CONTEXTO_VALIDO.test(contexto)) return null;
    const base = process.env.STARSEED_DATOS_DIR?.trim() || path.join(os.homedir(), ".starseed");
    const raiz = path.join(base, "artcraft", contexto);
    const lectura = path.join(raiz, "entrada");
    const escritura = path.join(raiz, "salida");
    for (const d of [raiz, lectura, escritura]) await fs.mkdir(d, { recursive: true, mode: 0o700 });
    return { raiz, lectura, escritura };
}

/** ¿Hay `unshare` en el PATH? (Linux: sin red, antepuesto al hijo). */
export function unshareDisponible(): Promise<string | null> {
    return buscarEjecutable("unshare");
}

/** Entorno mínimo del hijo: nunca una variable de claves; HOME es su directorio de trabajo. */
function envMinimo(hogar: string): Record<string, string> {
    return {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        LANG: process.env.LANG ?? "C.UTF-8",
        HOME: hogar,
    };
}

/** Adapta el hijo MCP al transporte puro `{ escribir, alRecibir, cerrar }`. Solo servidor. */
function transporteDeHijo(hijo: HijoMcp): { transporte: TransporteMcp; alCerrarProceso: (cb: () => void) => void } {
    const receptores: ((texto: string) => void)[] = [];
    const cierres: (() => void)[] = [];
    let cerrado = false;
    hijo.aLaSalida((t) => {
        if (!cerrado) for (const cb of receptores) cb(t);
    });
    hijo.alFinal(() => {
        if (cerrado) return;
        cerrado = true;
        for (const cb of cierres) cb();
    });
    return {
        transporte: {
            escribir: (linea) => hijo.escribir(linea),
            alRecibir: (cb) => {
                receptores.push(cb);
            },
            cerrar: () => {
                if (cerrado) return;
                cerrado = true;
                hijo.terminar();
            },
        },
        alCerrarProceso: (cb) => {
            cierres.push(cb);
        },
    };
}

/** Reloj real, pero ningún plazo supera el tope de la llamada (también el handshake). */
function relojAcotado(tope: number): RelojMcp {
    return { tras: (ms, cb) => { const t = setTimeout(cb, Math.min(ms, tope)); return () => clearTimeout(t); } };
}

let enCurso = 0;
let topeLlamada = TIEMPO_LLAMADA_MS;
/** Solo pruebas: sienta el tope de tiempo de la llamada (por defecto, 120 s). */
export function _ponerTopes(llamada: number | null): void {
    topeLlamada = llamada ?? TIEMPO_LLAMADA_MS;
}

/** Estado de cada llamada en el registro: denegado, confirmar, ocupado, sin-motor, hecho, error, tiempo-agotado. */
type EstadoRegistro = "denegado" | "confirmar" | "ocupado" | "sin-motor" | "hecho" | "error" | "tiempo-agotado";
function anotar(e: LlamadaPasarela, estado: EstadoRegistro): void {
    registrar(`artcraft app=${e.app} herramienta=${e.herramienta} huella=${huellaDe(e.parametros)} estado=${estado}`);
}

/** Llama a una herramienta del MCP de una Craft App; nunca lanza, contesta honesto. */
export async function llamarArtcraft(e: LlamadaPasarela): Promise<ResultadoArtcraft> {
    const t0 = Date.now();
    const dir = await directorioTrabajo(e.app, e.contexto);
    if (!dir) return { ok: false, status: 400, motivo: "El contexto de trabajo no es válido (solo a-z, 0-9 y -, ≤ 40)." };
    const veredicto = evaluarLlamada({
        app: e.app,
        herramienta: e.herramienta,
        parametros: e.parametros,
        origen: e.origen,
        ambito: e.ambito,
        rol: e.rol,
        raices: { lectura: [dir.lectura], escritura: [dir.escritura] },
    });
    if (veredicto.decision !== "permitir") {
        anotar(e, veredicto.decision === "confirmar" ? "confirmar" : "denegado");
        return veredicto.decision === "confirmar"
            ? { ok: false, status: 409, confirmar: true, motivo: veredicto.motivo }
            : { ok: false, status: 403, motivo: veredicto.motivo };
    }
    if (enCurso >= MAX_EN_CURSO) {
        anotar(e, "ocupado");
        return { ok: false, status: 429, motivo: "Ya hay llamadas a ArtCraft en esta neurona; prueba en unos segundos." };
    }
    const est = await estadoArtcraft(e.app);
    if (!est.ruta) {
        anotar(e, "sin-motor");
        return { ok: false, status: 503, motivo: `${e.app}-cli no está instalado en esta neurona.` };
    }
    enCurso++;
    let hijo: HijoMcp | null = null;
    let sinRed = false;
    try {
        const un = process.platform === "linux" ? await unshareDisponible() : null;
        sinRed = !!un;
        const cli: string[] = [
            ...(un ? [un, "-n", "--"] : []),
            est.ruta,
            "mcp",
            ...(e.app === "gridcraft" ? [] : ["--automation-read-root", dir.lectura, "--automation-read-root", dir.escritura, "--automation-write-root", dir.escritura]),
        ];
        hijo = lanzador(cli[0], cli.slice(1), { cwd: dir.raiz, env: envMinimo(dir.raiz) });
        const { transporte, alCerrarProceso } = transporteDeHijo(hijo);
        const cliente = new ClienteMcpStdio(transporte, relojAcotado(topeLlamada));
        alCerrarProceso(() => cliente.cerrar());
        await cliente.iniciar();
        const resultado = await cliente.llamar(e.herramienta, e.parametros, topeLlamada);
        hijo.terminar();
        anotar(e, "hecho");
        return { ok: true, resultado, ms: Date.now() - t0, sinRed };
    } catch (err) {
        hijo?.terminar();
        const mensaje = err instanceof Error ? err.message : "Error en la llamada al MCP de ArtCraft.";
        const tarde = err instanceof ErrorMcp && err.tipo === "tiempo";
        const enorme = err instanceof ErrorMcp && err.tipo === "enorme";
        anotar(e, tarde ? "tiempo-agotado" : "error");
        return {
            ok: false,
            status: tarde ? 504 : 500,
            motivo: tarde
                ? "La herramienta tardó demasiado (más de 120 s)."
                : enorme
                    ? "El MCP devolvió una línea mayor de 32 MiB."
                    : mensaje.slice(0, 200),
            ms: Date.now() - t0,
            sinRed,
        };
    } finally {
        enCurso--;
    }
}
