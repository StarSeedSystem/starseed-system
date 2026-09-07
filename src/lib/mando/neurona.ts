/**
 * SALUD DE LA NEURONA (Ola 258 · 2026-09-06) — solo servidor
 * ─────────────────────────────────────────────────────────────────────────────
 * El Puente de Mando necesita ver, de un vistazo, si esta máquina (la Mac de
 * Alex, 8 GB) está en condiciones de atender: memoria libre y swap, el demonio
 * de voz despierto o cediendo memoria, el llama-server BitNet vivo o caído y
 * qué tiene cargado Ollama. Hoy hubo que medirlo a mano durante horas (26
 * informes de crash de `llama-server-*.ips` en `~/Library/Logs/DiagnosticReports`);
 * esta sonda lo trae a la cabecera del Mando.
 *
 * Seguridad (innegociable): este módulo solo debe importarse desde rutas de
 * servidor. NUNCA devuelve rutas absolutas de la casa del usuario: los crashes
 * se resumen al NOMBRE del archivo, sin ruta. Las tres sondas (voz, BitNet y
 * Ollama) van en paralelo con `Promise.allSettled` y cada una es tolerante:
 * `medirNeurona()` JAMÁS lanza.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";

const execFileAsync = promisify(execFile);

/**
 * Resultado de la última verificación de la neurona (Ola 269 · 2026-09-07).
 * Lo escribe `scripts/verificar-neurona.mjs` en `starseed_memory_root/verificaciones/ultimo.json`;
 * el Mando lo muestra como tarjeta «Última verificación» de un vistazo.
 */
export interface VerificacionNeurona {
    /** Marca de tiempo de la verificación (ISO). */
    t: string;
    commit: string;
    puntuacion: number;
    fallos: number;
    avisos: number;
    regresiones: string[];
    mejoras: string[];
}

/** Salud completa de la neurona que devuelve `GET /api/mando/neurona`. */
export interface SaludNeurona {
    /** Marca de tiempo de la medición (ISO). */
    t: string;
    memoria: {
        libreMb: number;
        inactivaMb: number | null;
        comprimidaMb: number | null;
        totalMb: number;
        swapUsadoMb: number | null;
        swapTotalMb: number | null;
        paginaBytes: number | null;
    };
    voz: {
        vivo: boolean;
        ready: boolean | null;
        despertando: boolean | null;
        memoriaLibreMb: number | null;
        oido: {
            instalado: boolean;
            residente: boolean;
            cargandoDesdeMs: number | null;
            ocupado: boolean;
            cola: number;
            cesiones: number;
            ultimaCesionMs: number | null;
        } | null;
        latenciaMs: number | null;
    };
    bitnet: {
        puerto: number;
        estado: "vivo" | "cargando" | "apagado";
        latenciaMs: number | null;
        crashes24h: number | null;
        ultimoCrash: string | null;
    };
    ollama: {
        vivo: boolean;
        modelos: Array<{ nombre: string; tamanoMb: number; expira: string | null }>;
    };
    /** Avisos en español para la cabecera del Mando (vacío si todo va bien). */
    avisos: string[];
    /** Última verificación pasada por `node scripts/verificar-neurona.mjs` (null si aún no hay). */
    verificacion: VerificacionNeurona | null;
}

/**
 * Interpreta (función pura) la salida de `vm_stat` de macOS:
 *   - el tamaño de página («page size of 16384 bytes»),
 *   - las páginas `inactive` y `occupied by compressor` convertidas a MB.
 * Devuelve `null` en cada campo que no pueda leer, nunca lanza.
 */
export function parsearVmStat(texto: string): {
    paginaBytes: number | null;
    inactivaMb: number | null;
    comprimidaMb: number | null;
} {
    const salida: { paginaBytes: number | null; inactivaMb: number | null; comprimidaMb: number | null } = {
        paginaBytes: null,
        inactivaMb: null,
        comprimidaMb: null,
    };
    const pag = /page size of\s+(\d+)/i.exec(texto);
    if (pag) salida.paginaBytes = Number.parseInt(pag[1], 10);

    // Páginas de un campo («Pages inactive: 4096.») → número entero (quita comas).
    const paginasDe = (campo: string): number | null => {
        const m = new RegExp(`${campo}:\\s*([\\d,]+)`).exec(texto);
        if (!m) return null;
        const n = Number(m[1].replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
    };
    const aMb = (paginas: number | null): number | null =>
        paginas === null || salida.paginaBytes === null ? null : Math.round((paginas * salida.paginaBytes) / (1024 * 1024));

    salida.inactivaMb = aMb(paginasDe("Pages inactive"));
    salida.comprimidaMb = aMb(paginasDe("Pages occupied by compressor"));
    return salida;
}

/**
 * Interpreta (función pura) la salida de `sysctl -n vm.swapusage`:
 * `total = 8192.00M  used = 3821.31M  free = 4370.69M  encrypted = 0.00M`.
 * El sufijo K/M/G se convierte a MB (redondeado). Devuelve `null` si no puede leerlo.
 */
export function parsearSwapusage(texto: string): { usadoMb: number | null; totalMb: number | null } {
    const aMb = (campo: string): number | null => {
        const m = new RegExp(`${campo}\\s*=\\s*([\\d.]+)([KMG])`).exec(texto);
        if (!m) return null;
        const n = Number(m[1]);
        if (!Number.isFinite(n)) return null;
        const factor = m[2].toUpperCase() === "G" ? 1024 : m[2].toUpperCase() === "K" ? 1 / 1024 : 1;
        return Math.round(n * factor);
    };
    return { usadoMb: aMb("used"), totalMb: aMb("total") };
}

/**
 * Avisos (strings en español) para la cabecera del Mando. Función pura para
 * poder probarla en aislamiento: la sonda la rellena al final de `medirNeurona`.
 */
export function avisosDe(salud: SaludNeurona): string[] {
    const avisos: string[] = [];
    const { memoria, bitnet, ollama } = salud;

    // Lo que de verdad cuenta en una Mac de 8 GB: lo libre más lo que el sistema
    // aún puede recuperar (páginas inactivas). Bajo 800 MB, cargar la voz/el oído va a costar.
    const disponibles = (memoria.libreMb ?? 0) + (memoria.inactivaMb ?? 0);
    if (disponibles < 800) avisos.push("Poca memoria: la voz y el oído tardarán");
    if ((memoria.swapUsadoMb ?? 0) > 3000) avisos.push(`Swap alto (${memoria.swapUsadoMb} MB)`);
    if (bitnet.estado === "apagado") avisos.push("BitNet apagado o dormido: la primera respuesta tardará");
    if ((bitnet.crashes24h ?? 0) > 0) avisos.push(`El llama-server BitNet se cayó ${bitnet.crashes24h} veces en 24 h`);
    if (ollama.modelos.length > 0) {
        const totalMb = ollama.modelos.reduce((acc, m) => acc + m.tamanoMb, 0);
        avisos.push(`Ollama tiene ${ollama.modelos.length} modelo(s) cargado(s) (${totalMb} MB)`);
    }
    return avisos;
}

/** Valor numérico tolerante: `null` si no es un número finito. */
function num(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Memoria sin lectura (los campos siempre presentes). Nunca se usa si `medirMemoria` responde. */
function memoriaVacia(): SaludNeurona["memoria"] {
    return {
        libreMb: Math.round(os.freemem() / 1048576),
        inactivaMb: null,
        comprimidaMb: null,
        totalMb: Math.round(os.totalmem() / 1048576),
        swapUsadoMb: null,
        swapTotalMb: null,
        paginaBytes: null,
    };
}

/**
 * Mide la memoria del sistema. `os.totalmem()`/`os.freemem()` siempre; en macOS
 * además lee `vm_stat` y `sysctl -n vm.swapusage`; en Linux `/proc/meminfo`.
 * Cada lectura es tolerante: lo que no se pueda leer queda en `null`.
 */
async function medirMemoria(): Promise<SaludNeurona["memoria"]> {
    const base = memoriaVacia();

    if (process.platform === "darwin") {
        try {
            const { stdout } = await execFileAsync("vm_stat", [], { timeout: 3000 });
            const v = parsearVmStat(stdout);
            base.inactivaMb = v.inactivaMb;
            base.comprimidaMb = v.comprimidaMb;
            base.paginaBytes = v.paginaBytes;
        } catch {
            // vm_stat no disponible: la lectura opcional queda en null.
        }
        try {
            const { stdout } = await execFileAsync("sysctl", ["-n", "vm.swapusage"], { timeout: 3000 });
            const s = parsearSwapusage(stdout);
            base.swapUsadoMb = s.usadoMb;
            base.swapTotalMb = s.totalMb;
        } catch {
            // sysctl no disponible: swap en null.
        }
    } else if (process.platform === "linux") {
        try {
            const contenido = await readFile("/proc/meminfo", "utf8");
            const mb = (campo: string): number | null => {
                const m = new RegExp(`^${campo}:\\s*(\\d+)`).exec(contenido);
                return m ? Math.round(Number(m[1]) / 1024) : null;
            };
            // MemAvailable incluye lo que el sistema puede liberar: mejor estimación de «libre».
            const disponible = mb("MemAvailable");
            if (disponible !== null) base.libreMb = disponible;
            const swapTotal = mb("SwapTotal");
            const swapFree = mb("SwapFree");
            if (swapTotal !== null && swapFree !== null) {
                base.swapTotalMb = swapTotal;
                base.swapUsadoMb = Math.max(0, swapTotal - swapFree);
            }
        } catch {
            // /proc/meminfo no disponible: se queda con os.freemem()/os.totalmem().
        }
    }
    return base;
}

/** Voz apagada de factoría (demonio Astraura 4444 sin responder). */
function vozVacia(): SaludNeurona["voz"] {
    return { vivo: false, ready: null, despertando: null, memoriaLibreMb: null, oido: null, latenciaMs: null };
}

/**
 * Sondea el demonio de voz (`GET http://127.0.0.1:4444/status`). Mapea `ready`,
 * `despertando`, `memoriaLibreMb` y el bloque `asr` (el oído residente) con
 * tolerancia de tipos (`null` si faltan). Si no responde, `vivo:false`.
 */
async function medirVoz(): Promise<SaludNeurona["voz"]> {
    const apagada = vozVacia();
    try {
        const inicio = Date.now();
        const resp = await fetch("http://127.0.0.1:4444/status", {
            signal: AbortSignal.timeout(2500),
            cache: "no-store",
        });
        const latenciaMs = Date.now() - inicio;
        if (!resp.ok) return apagada;

        const c = (await resp.json()) as Record<string, unknown>;
        const asr = typeof c.asr === "object" && c.asr !== null ? (c.asr as Record<string, unknown>) : null;
        return {
            vivo: true,
            ready: typeof c.ready === "boolean" ? c.ready : null,
            despertando: typeof c.despertando === "boolean" ? c.despertando : null,
            memoriaLibreMb: num(c.memoriaLibreMb),
            oido: asr
                ? {
                      instalado: typeof asr.instalado === "boolean" ? asr.instalado : false,
                      residente: typeof asr.residente === "boolean" ? asr.residente : false,
                      cargandoDesdeMs: num(asr.cargandoDesdeMs),
                      ocupado: typeof asr.ocupado === "boolean" ? asr.ocupado : false,
                      cola: num(asr.cola) ?? 0,
                      cesiones: num(asr.cesiones) ?? 0,
                      ultimaCesionMs: num(asr.ultimaCesionMs),
                  }
                : null,
            latenciaMs,
        };
    } catch {
        return apagada;
    }
}

/** BitNet apagado de factoría. */
function bitnetVacio(): SaludNeurona["bitnet"] {
    return {
        puerto: Number(process.env.ASTRAURA_BITNET_PORT) || 8790,
        estado: "apagado",
        latenciaMs: null,
        crashes24h: null,
        ultimoCrash: null,
    };
}

/** Cuenta los crashes recientes de `llama-server-*.ips` (solo macOS; otros sistemas → null). */
async function medirCrashes(): Promise<{ crashes24h: number; ultimoCrash: string | null } | null> {
    if (process.platform !== "darwin") return null;
    try {
        const dir = path.join(os.homedir(), "Library", "Logs", "DiagnosticReports");
        const entradas = await readdir(dir, { withFileTypes: true });
        const H24 = 24 * 60 * 60 * 1000;
        const ahora = Date.now();
        let crashes24h = 0;
        let ultimo: { nombre: string; mtime: number } | null = null;
        for (const e of entradas) {
            if (!e.isFile() || !/^llama-server-.*\.ips$/.test(e.name)) continue;
            let mtime = 0;
            try {
                mtime = (await stat(path.join(dir, e.name))).mtimeMs;
            } catch {
                continue;
            }
            if (ahora - mtime <= H24) crashes24h += 1;
            if (mtime > (ultimo?.mtime ?? 0)) ultimo = { nombre: e.name, mtime };
        }
        // Solo el NOMBRE del archivo: nunca la ruta absoluta de la casa del usuario.
        return { crashes24h, ultimoCrash: ultimo ? ultimo.nombre : null };
    } catch {
        return null;
    }
}

/**
 * Sondea el llama-server BitNet (`GET /health`): 200 → vivo, 503 → cargando,
 * otro/sin respuesta → apagado. Los crashes se cuentan solo en macOS.
 */
async function medirBitnet(): Promise<SaludNeurona["bitnet"]> {
    const puerto = Number(process.env.ASTRAURA_BITNET_PORT) || 8790;
    let estado: SaludNeurona["bitnet"]["estado"] = "apagado";
    let latenciaMs: number | null = null;
    try {
        const inicio = Date.now();
        const resp = await fetch(`http://127.0.0.1:${puerto}/health`, {
            signal: AbortSignal.timeout(2500),
            cache: "no-store",
        });
        latenciaMs = Date.now() - inicio;
        if (resp.status === 200) estado = "vivo";
        else if (resp.status === 503) estado = "cargando";
    } catch {
        estado = "apagado";
    }
    const crashes = await medirCrashes();
    return {
        puerto,
        estado,
        latenciaMs,
        crashes24h: crashes?.crashes24h ?? null,
        ultimoCrash: crashes?.ultimoCrash ?? null,
    };
}

/** Ollama sin modelos de factoría. */
function ollamaVacia(): SaludNeurona["ollama"] {
    return { vivo: false, modelos: [] };
}

/** Sondea `GET http://127.0.0.1:11434/api/ps` y lista los modelos cargados. */
async function medirOllama(): Promise<SaludNeurona["ollama"]> {
    const base = ollamaVacia();
    try {
        const resp = await fetch("http://127.0.0.1:11434/api/ps", {
            signal: AbortSignal.timeout(2000),
            cache: "no-store",
        });
        if (!resp.ok) return base;
        const c = (await resp.json()) as Record<string, unknown>;
        const modelos = Array.isArray(c.models) ? (c.models as Array<Record<string, unknown>>) : [];
        return {
            vivo: true,
            modelos: modelos.map((m) => ({
                nombre: typeof m.name === "string" ? m.name : "desconocido",
                tamanoMb: typeof m.size === "number" ? Math.round(m.size / 1048576) : 0,
                expira: typeof m.expires_at === "string" ? m.expires_at : null,
            })),
        };
    } catch {
        return base;
    }
}

/** Lista de cadenas tolerante: cada elemento que no sea `string` se descarta. */
function listaDeTexto(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return (v as unknown[]).filter((x): x is string => typeof x === "string");
}

/**
 * Lee la última verificación de la neurona (`starseed_memory_root/verificaciones/ultimo.json`).
 * 2026-09-07 (Ola 269): el archivo lo escribe `scripts/verificar-neurona.mjs`; si aún no existe
 * —todavía no se lanzó la batería por primera vez— devuelve `null` y el panel enseña el comando.
 * Tolerante: cualquier campo ilegible se normaliza y nunca lanza.
 */
export async function leerVerificacion(): Promise<VerificacionNeurona | null> {
    try {
        const contenido = await readFile(
            path.join(raizDelProyecto(), "starseed_memory_root", "verificaciones", "ultimo.json"),
            "utf-8",
        );
        const d = JSON.parse(contenido) as unknown;
        if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
        const o = d as Record<string, unknown>;
        const checks = Array.isArray(o.checks)
            ? (o.checks as unknown[]).filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
            : [];
        const fallos = checks.filter((c) => c.estado === "fallo").length;
        const avisos = checks.filter((c) => c.estado === "aviso").length;
        return {
            t: typeof o.t === "string" ? o.t : "",
            commit: typeof o.commit === "string" ? o.commit : "",
            puntuacion: typeof o.puntuacion === "number" && Number.isFinite(o.puntuacion) ? o.puntuacion : 0,
            fallos,
            avisos,
            regresiones: listaDeTexto(o.regresiones),
            mejoras: listaDeTexto(o.mejoras),
        };
    } catch {
        return null;
    }
}

/**
 * Mide la salud completa de la neurona. Las sondas (memoria, voz, BitNet, Ollama
 * y la última verificación) van en paralelo con `Promise.allSettled`; cada una es
 * tolerante y `medirNeurona` NUNCA lanza. Rellena los avisos al final.
 */
export async function medirNeurona(): Promise<SaludNeurona> {
    const [memoriaR, vozR, bitnetR, ollamaR, verificacionR] = await Promise.allSettled([
        medirMemoria(),
        medirVoz(),
        medirBitnet(),
        medirOllama(),
        leerVerificacion(),
    ]);
    const salud: SaludNeurona = {
        t: new Date().toISOString(),
        memoria: memoriaR.status === "fulfilled" ? memoriaR.value : memoriaVacia(),
        voz: vozR.status === "fulfilled" ? vozR.value : vozVacia(),
        bitnet: bitnetR.status === "fulfilled" ? bitnetR.value : bitnetVacio(),
        ollama: ollamaR.status === "fulfilled" ? ollamaR.value : ollamaVacia(),
        avisos: [],
        verificacion: verificacionR.status === "fulfilled" ? verificacionR.value : null,
    };
    salud.avisos = avisosDe(salud);
    return salud;
}