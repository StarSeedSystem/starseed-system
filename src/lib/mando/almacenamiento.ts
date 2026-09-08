/**
 * ALMACENAMIENTO DE LA NEURONA (Ola 273 · 2026-09-07) — solo servidor
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex pidió ver en el Puente de Mando el disco, lo regenerable (para limpiar
 * con seguridad), el espejo del memory root en Google Drive (DriveFS) y una
 * acción «aliviar memoria» (dormir el BitNet + cesión del pool de voz), todo
 * solo en local (las rutas `/api/mando/*` son 404 en producción).
 *
 * Seguridad (innegociable):
 * - La limpieza solo borra rutas de la LISTA BLANCA marcadas `seguro: true`;
 *   jamás `starseed_memory_root`, `.env*`, `.git` ni lo que venga del cliente.
 * - El espejo a Drive NUNCA usa `--delete` y excluye `.env*`: Drive es subida,
 *   no sincronización destructiva, y los secretos no salen de la neurona.
 * - El módulo NUNCA lanza: cada medición es tolerante y va en `try` con tope.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, open, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";

const execFileAsync = promisify(execFile);

/** Umbral de swap (MB) a partir del cual el Mando lo explica avisando. */
export const UMBRAL_SWAP_MB = 3000;

/** Entrada de la lista blanca de lo que se puede limpiar sin riesgo. */
export interface Regenerable {
    id: string;
    ruta: string;
    mb: number;
    descripcion: string;
    /** Solo los `seguro: true` puede borrarlos `limpiarRegenerables`. */
    seguro: boolean;
}

/** Cuota de Google Drive (DriveFS) leída con `df -kP` sobre la unidad. */
export interface CuotaDrive {
    totalGb: number;
    usadoGb: number;
    libreGb: number;
}

/** Carpeta fría medida: candidata a «Mover a Drive» (o ya es enlace a Drive). */
export interface CarpetaFria {
    id: string;
    ruta: string;
    descripcion: string;
    mb: number;
    /** Ya es un enlace simbólico al Drive (se movió antes): «Traer de vuelta». */
    enDrive: boolean;
}

/** Estado completo que devuelve `GET /api/mando/almacenamiento`. */
export interface EstadoAlmacenamiento {
    /** Marca de tiempo de la medición (ISO). */
    t: string;
    disco: { totalMb: number; libreMb: number; usadoPct: number } | null;
    regenerables: Regenerable[];
    drive: {
        montado: boolean;
        ruta: string | null;
        espejo: { ruta: string; ultimoEspejo: string | null; mb: number | null } | null;
    };
    driveCuota: CuotaDrive | null;
    frias: CarpetaFria[];
    espejoAutomatico: { activo: boolean; proximo: string | null };
    swap: { usadoMb: number; totalMb: number; explicacion: string };
    acciones: Array<{ id: string; etiqueta: string; disponible: boolean; motivo?: string }>;
}

/**
 * Interpreta (función pura) la salida de `df -kP <raíz>`: se queda con la
 * segunda línea (la propia del sistema de archivos) y extrae bloques de 1 KB
 * totales/usados/disponibles. Devuelve `null` si no puede leerla.
 */
export function interpretarDf(stdout: string): { totalMb: number; libreMb: number; usadoPct: number } | null {
    const lineas = stdout.trim().split("\n").filter((l) => l.trim().length > 0);
    if (lineas.length < 2) return null;
    const partes = lineas[1].trim().split(/\s+/);
    // Formato POSIX: Filesystem 1024-blocks Used Available Capacity Mounted on
    const totalKb = Number(partes[1]);
    const usadoKb = Number(partes[2]);
    const libreKb = Number(partes[3]);
    if (![totalKb, usadoKb, libreKb].every((n) => Number.isFinite(n) && n >= 0) || totalKb === 0) return null;
    return {
        totalMb: Math.round(totalKb / 1024),
        libreMb: Math.round(libreKb / 1024),
        usadoPct: Math.round((usadoKb / totalKb) * 100),
    };
}

/** Mide el disco donde vive la raíz del repo con `df -kP`. Tolerante. */
export async function medirDisco(): Promise<EstadoAlmacenamiento["disco"]> {
    try {
        const { stdout } = await execFileAsync("df", ["-kP", raizDelProyecto()], { timeout: 4000 });
        return interpretarDf(stdout);
    } catch {
        return null;
    }
}

/** Suma de MB de una ruta con `du -sk` (null si no existe o no cabe en 4 s). */
async function mbDe(ruta: string): Promise<number | null> {
    try {
        const { stdout } = await execFileAsync("du", ["-sk", ruta], { timeout: 4000 });
        const kb = Number(stdout.trim().split(/\s+/)[0]);
        return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
    } catch {
        return null;
    }
}

/** Ruta con `~` visible para la interfaz (nunca absoluta cruda en JSON… salvo /tmp de esta máquina). */
function rutaVisible(absoluta: string): string {
    const casa = os.homedir();
    return absoluta.startsWith(casa) ? `~${absoluta.slice(casa.length)}` : absoluta;
}

/**
 * Lista de candidatos regenerables (lista blanca: las ÚNICAS rutas limpiables).
 * `.gitnexus` se marca `seguro: false`: se copia desde la nube y borrarlo a
 * ciegas dejaría al grafo de código sin índice en esta máquina.
 */
function candidatosRegenerables(raiz: string): Array<Omit<Regenerable, "mb">> {
    const casa = os.homedir();
    return [
        { id: "next-cache", ruta: path.join(raiz, ".next", "cache"), descripcion: "Caché de builds de Next.js (se regenera en la próxima build)", seguro: true },
        { id: "node-cache", ruta: path.join(raiz, "node_modules", ".cache"), descripcion: "Caché de herramientas de node_modules", seguro: true },
        { id: "gitnexus", ruta: path.join(raiz, ".gitnexus"), descripcion: "Índice del grafo de código (se copia desde la nube; borrar solo a propósito)", seguro: false },
        { id: "playwright", ruta: path.join(casa, "Library", "Caches", "ms-playwright"), descripcion: "Navegadores de pruebas Playwright (se re-descargan al correr tests)", seguro: true },
        { id: "npm-cache", ruta: path.join(casa, ".npm", "_cacache"), descripcion: "Caché de paquetes npm", seguro: true },
        { id: "drivefs-logs", ruta: path.join(casa, "Library", "Application Support", "Google", "DriveFS", "Logs"), descripcion: "Registros de Google Drive para escritorio", seguro: true },
    ];
}

/** Carpeta de los registros de olas (parametrizable para pruebas; /tmp por defecto). */
export function carpetaLogsOlas(): string {
    return process.env.STARSEED_OLAS_LOG_DIR || "/tmp";
}

/** Logs de olas de más de 7 días, agrupados en una sola entrada. */
async function logsViejos(): Promise<Regenerable | null> {
    try {
        const dir = carpetaLogsOlas();
        const archivos = await readdir(dir).catch(() => []);
        const ahora = Date.now();
        const SIETE_DIAS = 7 * 24 * 3600 * 1000;
        let bytes = 0;
        let cuenta = 0;
        for (const nombre of archivos) {
            if (!nombre.startsWith("ola-") || !nombre.endsWith(".log")) continue;
            try {
                const st = await stat(path.join(dir, nombre));
                if (ahora - st.mtimeMs > SIETE_DIAS) {
                    bytes += st.size;
                    cuenta += 1;
                }
            } catch {
                // Si el archivo desaparece a mitad, no pasa nada.
            }
        }
        if (cuenta === 0) return null;
        return { id: "olas-logs", ruta: `${dir}/ola-*.log (> 7 días)`, mb: Math.round(bytes / 1048576), descripcion: `${cuenta} registros de olas con más de 7 días`, seguro: true };
    } catch {
        return null;
    }
}

/**
 * Mide lo regenerable: cada candidato en `try` con 4 s de tope, y solo se
 * incluyen las rutas que EXISTEN (para no llenar la lista de ceros).
 */
export async function medirRegenerables(raiz: string): Promise<Regenerable[]> {
    const salida: Regenerable[] = [];
    for (const candidato of candidatosRegenerables(raiz)) {
        try {
            await stat(candidato.ruta);
            const mb = await mbDe(candidato.ruta);
            if (mb !== null) salida.push({ ...candidato, ruta: rutaVisible(candidato.ruta), mb });
        } catch {
            // No existe: no se lista.
        }
    }
    const viejos = await logsViejos();
    if (viejos) salida.push(viejos);
    return salida;
}

/**
 * Detecta el Google Drive de DriveFS (`~/Library/CloudStorage/GoogleDrive-*`,
 * el primero que exista) y, dentro, el espejo del memory root:
 * `My Drive/StarSeed_Memory_Root/neurona-<hostname>` con su marcador
 * `.ultimo-espejo.json` (lo escribe `espejar()`).
 */
export async function detectarDrive(): Promise<EstadoAlmacenamiento["drive"]> {
    const vacio: EstadoAlmacenamiento["drive"] = { montado: false, ruta: null, espejo: null };
    try {
        const base = path.join(os.homedir(), "Library", "CloudStorage");
        const entradas = await readdir(base);
        const unidad = entradas.find((e) => e.startsWith("GoogleDrive-"));
        if (!unidad) return vacio;
        const ruta = path.join(base, unidad);
        const espejo = path.join(ruta, "My Drive", "StarSeed_Memory_Root", `neurona-${os.hostname()}`);
        try {
            await stat(espejo);
            let ultimoEspejo: string | null = null;
            let mb: number | null = null;
            try {
                const crudo = JSON.parse(await readFile(path.join(espejo, ".ultimo-espejo.json"), "utf8")) as { t?: unknown };
                if (typeof crudo.t === "string") ultimoEspejo = crudo.t;
            } catch {
                // Sin marcador todavía: espejo presente pero sin registro.
            }
            mb = await mbDe(espejo);
            return { montado: true, ruta: rutaVisible(ruta), espejo: { ruta: rutaVisible(espejo), ultimoEspejo, mb } };
        } catch {
            return { montado: true, ruta: rutaVisible(ruta), espejo: null };
        }
    } catch {
        return vacio;
    }
}

/**
 * Base absoluta del Google Drive de DriveFS (`~/Library/CloudStorage/GoogleDrive-*`),
 * o `null` si no hay ninguno. Comparte la detección con `detectarDrive`.
 */
async function rutaDriveBase(): Promise<string | null> {
    try {
        const base = path.join(os.homedir(), "Library", "CloudStorage");
        const entradas = await readdir(base);
        const unidad = entradas.find((e) => e.startsWith("GoogleDrive-"));
        return unidad ? path.join(base, unidad) : null;
    } catch {
        return null;
    }
}

/** Mes «AAAA-MM» actual (para no mover el corpus del mes en curso). */
function mesActual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Lista blanca de carpetas frías candidatas a «Mover a Drive». `ruta` es relativa
 * a la raíz del repo o empieza por `~/` (casa). `soloMesesAnteriores` marca las que
 * se parten por mes y solo mueven los meses ANTERIORES al actual (corpus de
 * aprendizaje: el mes en curso sigue en caliente).
 */
const CARPETAS_FRIAS: Array<{ id: string; ruta: string; descripcion: string; soloMesesAnteriores?: boolean }> = [
    { id: "transfer", ruta: ".transfer", descripcion: "Paquetes git ya integrados" },
    { id: "respaldos", ruta: "starseed_memory_root/respaldos", descripcion: "Respaldos del memory root" },
    { id: "exports", ruta: "starseed_memory_root/exports", descripcion: "Exportaciones del memory root" },
    { id: "verificaciones", ruta: "starseed_memory_root/verificaciones", descripcion: "Informes de verificación de la neurona" },
    { id: "aprendizaje-export", ruta: "~/Documents/IA 1.58 bit/data/aprendizaje/export", descripcion: "Exportaciones del aprendizaje de Astraura 1.58" },
    { id: "aprendizaje-corpus", ruta: "~/Documents/IA 1.58 bit/data/aprendizaje/corpus", descripcion: "Corpus de aprendizaje por mes", soloMesesAnteriores: true },
    { id: "opencode-logs", ruta: "~/.starseed/opencode-logs", descripcion: "Registros de las sesiones de opencode" },
];

/** Resuelve una `ruta` relativa del config de carpetas frías a absoluta. */
function resolverRutaFria(ruta: string, raiz: string): string {
    return ruta.startsWith("~/") ? path.join(os.homedir(), ruta.slice(2)) : path.join(raiz, ruta);
}

/** Jamás movemos secretos ni el índice git: rechaza esas rutas antes de rsync. */
function esProtegida(ruta: string): boolean {
    const nombre = path.basename(ruta);
    return nombre.startsWith(".env") || nombre === ".git" || nombre.endsWith(".gguf");
}

/** Un id frío es válido solo si está en la lista blanca (o es un mes de corpus). */
function resolverFria(id: string, raiz: string): string | null {
    for (const c of CARPETAS_FRIAS) {
        if (c.id === id) {
            const p = resolverRutaFria(c.ruta, raiz);
            return esProtegida(p) ? null : p;
        }
        if (c.soloMesesAnteriores && id.startsWith(`${c.id}-`)) {
            const mes = id.slice(c.id.length + 1);
            if (!/^\d{4}-\d{2}$/.test(mes)) return null;
            const p = path.join(resolverRutaFria(c.ruta, raiz), mes);
            return esProtegida(p) ? null : p;
        }
    }
    return null;
}

/** ¿La ruta ya es un enlace simbólico que apunta dentro del Drive? */
async function esEnlaceADrive(ruta: string): Promise<boolean> {
    try {
        const st = await lstat(ruta);
        if (!st.isSymbolicLink()) return false;
        const destino = await realpath(ruta);
        return destino.includes("Library/CloudStorage/GoogleDrive-");
    } catch {
        return false;
    }
}

/**
 * Medición de las carpetas frías de la lista blanca: solo las que existen, con
 * su MB y si ya son un enlace a Drive. El corpus se parte por mes y deja fuera
 * el mes actual (sigue en caliente para el aprendizaje).
 */
export async function medirCarpetasFrias(raiz: string): Promise<CarpetaFria[]> {
    const salida: CarpetaFria[] = [];
    for (const c of CARPETAS_FRIAS) {
        if (c.soloMesesAnteriores) {
            const dir = resolverRutaFria(c.ruta, raiz);
            const meses = await readdir(dir).catch(() => [] as string[]);
            for (const mes of meses.filter((m) => /^\d{4}-\d{2}$/.test(m) && m < mesActual())) {
                const p = path.join(dir, mes);
                const mb = (await mbDe(p)) ?? 0;
                salida.push({
                    id: `${c.id}-${mes}`,
                    ruta: rutaVisible(p),
                    descripcion: `${c.descripcion} (mes ${mes})`,
                    mb,
                    enDrive: await esEnlaceADrive(p),
                });
            }
            continue;
        }
        const p = resolverRutaFria(c.ruta, raiz);
        try {
            await stat(p);
        } catch {
            continue; // No existe: no se lista.
        }
        const mb = (await mbDe(p)) ?? 0;
        salida.push({ id: c.id, ruta: rutaVisible(p), descripcion: c.descripcion, mb, enDrive: await esEnlaceADrive(p) });
    }
    return salida;
}

/**
 * Explica (función pura) por qué el swap está alto SIN vender humo: el swap
 * es RAM comprimida a disco por macOS, y montar Google Drive descarga DISCO,
 * no RAM — así que no baja el swap. Lo que sí baja el swap es dormir el
 * BitNet, ceder el pool de voz o reiniciar.
 */
export function explicarSwap(usadoMb: number, totalMb: number): string {
    if (usadoMb <= UMBRAL_SWAP_MB) {
        return `Swap en ${usadoMb} MB de ${totalMb} MB: dentro de lo normal para esta máquina.`;
    }
    return (
        `Swap alto: ${usadoMb} MB de ${totalMb} MB (aviso a partir de ${UMBRAL_SWAP_MB} MB). ` +
        "Es memoria comprimida a disco por macOS cuando la RAM se llena; Google Drive libera disco, " +
        "no RAM, así que espejar archivos NO baja el swap. Lo que sí lo baja: dormir el BitNet, " +
        "ceder el pool de voz (acción «Aliviar memoria») o reiniciar la máquina."
    );
}

/** Swap medido con `sysctl -n vm.swapusage` (macOS); 0/0 si no se puede leer. */
async function medirSwap(): Promise<{ usadoMb: number; totalMb: number }> {
    try {
        const { stdout } = await execFileAsync("sysctl", ["-n", "vm.swapusage"], { timeout: 3000 });
        const aMb = (campo: string): number | null => {
            const m = new RegExp(`${campo}\\s*=\\s*([\\d.]+)([KMG])`).exec(stdout);
            if (!m) return null;
            const n = Number(m[1]);
            if (!Number.isFinite(n)) return null;
            const factor = m[2].toUpperCase() === "G" ? 1024 : m[2].toUpperCase() === "K" ? 1 / 1024 : 1;
            return Math.round(n * factor);
        };
        return { usadoMb: aMb("used") ?? 0, totalMb: aMb("total") ?? 0 };
    } catch {
        return { usadoMb: 0, totalMb: 0 };
    }
}

/** Carpetas del memory root que el espejo sube a Drive (solo las que existan). */
const CARPETAS_ESPEJO = ["respaldos", "verificaciones", "aprendizaje", "olas/pasos", "mando/chats", "informes"];

/**
 * Espeja el memory root al Drive: crea la carpeta del espejo y lanza DESACOPLADO
 * (`detached` + `unref`, salida a `~/.starseed/espejo-drive.log`) un `rsync -a
 * --no-perms` SIN `--delete` y excluyendo `*.wav` y `.env*` (los audios pesan y
 * los secretos jamás salen de la neurona). Devuelve el pid o `null` si no hay Drive.
 */
export async function espejar(): Promise<{ ok: boolean; pid: number | null; detalle: string }> {
    const drive = await detectarDrive();
    if (!drive.montado || !drive.ruta) {
        return { ok: false, pid: null, detalle: "Google Drive no está montado (DriveFS)." };
    }
    const raiz = raizDelProyecto();
    const base = path.join(os.homedir(), "Library", "CloudStorage");
    const entradas = await readdir(base);
    const unidad = entradas.find((e) => e.startsWith("GoogleDrive-"));
    if (!unidad) return { ok: false, pid: null, detalle: "Google Drive no está montado (DriveFS)." };
    const espejo = path.join(base, unidad, "My Drive", "StarSeed_Memory_Root", `neurona-${os.hostname()}`);

    const origenes: string[] = [];
    for (const carpeta of CARPETAS_ESPEJO) {
        const origen = path.join(raiz, "starseed_memory_root", carpeta);
        try {
            await stat(origen);
            // Barra final de rsync: copiar el CONTENIDO, no la carpeta.
            origenes.push(`${origen}/`);
        } catch {
            // No existe esa carpeta: se omite sin error.
        }
    }
    if (origenes.length === 0) return { ok: false, pid: null, detalle: "No hay carpetas del memory root que espejar." };

    await mkdir(espejo, { recursive: true });
    // Aseguramos ~/.starseed para el registro (recursive: no falla si ya existe).
    await mkdir(path.join(os.homedir(), ".starseed"), { recursive: true });
    const registro = await open(path.join(os.homedir(), ".starseed", "espejo-drive.log"), "a");
    const hijo = spawn(
        "rsync",
        ["-a", "--no-perms", "--exclude", "*.wav", "--exclude", ".env*", ...origenes, `${espejo}/`],
        { detached: true, stdio: ["ignore", registro.fd, registro.fd] },
    );
    hijo.unref();
    await writeFile(
        path.join(espejo, ".ultimo-espejo.json"),
        JSON.stringify({ t: new Date().toISOString(), pid: hijo.pid ?? null }),
    );
    await registro.close();
    return { ok: true, pid: hijo.pid ?? null, detalle: `Espejo lanzado hacia ${rutaVisible(espejo)} (${origenes.length} carpetas).` };
}

/**
 * Cuota de Google Drive (DriveFS): `df -kP` sobre la unidad del Drive expone la
 * cuota real del plan (1 TB o más) y lo ya usado, en GB. `null` si no está montado.
 */
export async function cuotaDrive(): Promise<CuotaDrive | null> {
    try {
        const driveBase = await rutaDriveBase();
        if (!driveBase) return null;
        const { stdout } = await execFileAsync("df", ["-kP", driveBase], { timeout: 4000 });
        const interpretado = interpretarDf(stdout);
        if (!interpretado) return null;
        return {
            totalGb: interpretado.totalMb / 1024,
            usadoGb: (interpretado.totalMb - interpretado.libreMb) / 1024,
            libreGb: interpretado.libreMb / 1024,
        };
    } catch {
        return null;
    }
}

/** Cuenta de archivos regulares de una ruta (`find -type f | wc -l`). Tolerante. */
async function contarArchivos(ruta: string): Promise<number> {
    try {
        const { stdout } = await execFileAsync("find", [ruta, "-type", "f"], { timeout: 60000 });
        return stdout.trim().split("\n").filter((l) => l.length > 0).length;
    } catch {
        return -1;
    }
}

/**
 * Verifica que el contenido copiado es idéntico al origen: mismo número de
 * archivos y un `rsync -an` (simulación) que no encuentre nada que re-sincronizar
 * (mismos tamaños, nombres y contenidos). Más fiable que comparar bloques de `du`,
 * que difieren entre APFS y DriveFS.
 */
async function verificarCopia(origen: string, destino: string): Promise<boolean> {
    try {
        const nOrigen = await contarArchivos(origen);
        const nDestino = await contarArchivos(destino);
        if (nOrigen !== nDestino || nOrigen < 0) return false;
        const { stdout } = await execFileAsync("rsync", ["-an", "--no-perms", `${origen}/`, `${destino}/`], { timeout: 90000 });
        return stdout.trim().length === 0;
    } catch {
        return false;
    }
}

/** Un directorio frío contiene algún `.env*` en su raíz: jamás se mueve. */
async function contieneSecretos(origen: string): Promise<boolean> {
    const nombres = await readdir(origen).catch(() => [] as string[]);
    return nombres.some((n) => n.startsWith(".env"));
}

/**
 * Mueve una carpeta fría de la lista blanca a `<Drive>/StarSeed_Memory_Root/
 * neurona-<host>/frio/<id>/`: rsync sin permisos, verifica conteo y bytes, y SOLO
 * entonces deja el enlace simbólico en su sitio y borra la copia local temporal.
 * Si la verificación falla, deshace (borra el destino) y no borra nada del origen.
 */
export async function moverADrive(id: string): Promise<{ ok: boolean; detalle: string }> {
    const raiz = raizDelProyecto();
    const origen = resolverFria(id, raiz);
    if (!origen) return { ok: false, detalle: "Carpeta no está en la lista blanca de frías." };
    if (await contieneSecretos(origen)) return { ok: false, detalle: "La carpeta contiene secretos (.env*): no se mueve." };
    const driveBase = await rutaDriveBase();
    if (!driveBase) return { ok: false, detalle: "Google Drive no está montado (DriveFS)." };
    const destino = path.join(driveBase, "My Drive", "StarSeed_Memory_Root", `neurona-${os.hostname()}`, "frio", id);
    try {
        await mkdir(destino, { recursive: true });
        await execFileAsync("rsync", ["-a", "--no-perms", `${origen}/`, `${destino}/`], { timeout: 120000 });
        if (!(await verificarCopia(origen, destino))) {
            // La copia no coincide: deshacemos y no tocamos el origen.
            await execFileAsync("rm", ["-rf", destino], { timeout: 30000 });
            return { ok: false, detalle: "Verificación de la copia fallida: no se borró nada del origen." };
        }
        const fecha = new Date().toISOString().slice(0, 10);
        const renombrado = `${origen}.local-${fecha}`;
        // Cambiamos de nombre (conserva los datos) antes de enlazar: si algo falla
        // a mitad, el `.local-*` sigue en disco y no se pierde nada.
        await execFileAsync("mv", [origen, renombrado], { timeout: 15000 });
        await execFileAsync("ln", ["-s", destino, origen], { timeout: 5000 });
        await execFileAsync("rm", ["-rf", renombrado], { timeout: 60000 });
        return { ok: true, detalle: `Movido a Drive (queda un enlace en ${rutaVisible(origen)}).` };
    } catch (e) {
        return { ok: false, detalle: e instanceof Error ? e.message : "Fallo al mover a Drive." };
    }
}

/**
 * Trae de vuelta una carpeta fría: copia de `<Drive>/…/frio/<id>` a su sitio,
 * verifica y quita el enlace simbólico. Copia primero a un temporal y solo al
 * verificar intercambia el nombre, para no romper el enlace si algo falla.
 */
export async function traerDeDrive(id: string): Promise<{ ok: boolean; detalle: string }> {
    const raiz = raizDelProyecto();
    const origen = resolverFria(id, raiz);
    if (!origen) return { ok: false, detalle: "Carpeta no está en la lista blanca de frías." };
    const driveBase = await rutaDriveBase();
    if (!driveBase) return { ok: false, detalle: "Google Drive no está montado (DriveFS)." };
    const destino = path.join(driveBase, "My Drive", "StarSeed_Memory_Root", `neurona-${os.hostname()}`, "frio", id);
    if (!(await esEnlaceADrive(origen))) return { ok: false, detalle: "No es un enlace a Drive: no hay nada que traer." };
    try {
        const fecha = new Date().toISOString().slice(0, 10);
        const temporal = `${origen}.traer-${fecha}`;
        await mkdir(temporal, { recursive: true });
        await execFileAsync("rsync", ["-a", "--no-perms", `${destino}/`, `${temporal}/`], { timeout: 120000 });
        if (!(await verificarCopia(destino, temporal))) {
            await execFileAsync("rm", ["-rf", temporal], { timeout: 30000 });
            return { ok: false, detalle: "Verificación de la copia fallida: se conserva el enlace a Drive." };
        }
        // Intercambiamos: fuera el enlace, dentro la carpeta local recién copiada.
        await execFileAsync("unlink", [origen], { timeout: 5000 });
        await execFileAsync("mv", [temporal, origen], { timeout: 15000 });
        return { ok: true, detalle: `Traído de vuelta: ${rutaVisible(origen)} es local otra vez.` };
    } catch (e) {
        return { ok: false, detalle: e instanceof Error ? e.message : "Fallo al traer de vuelta." };
    }
}

/** Próxima ejecución de un job diario a una hora (fecha ISO o `null`). */
function proximaEjecucion(hora: number, minuto: number): string {
    const ahora = new Date();
    const proximo = new Date(ahora);
    proximo.setHours(hora, minuto, 0, 0);
    if (proximo.getTime() <= ahora.getTime()) proximo.setDate(proximo.getDate() + 1);
    return proximo.toISOString();
}

/**
 * Instala o quita el launchd `com.starseed.espejo-drive` (`~/Library/LaunchAgents/`)
 * que espeja el memory root a Drive cada día a las 04:00 con el mismo comando que
 * `espejar()` (rsync sin `--delete`, sin `.env*`, sin `*.wav`). Devuelve el estado
 * y la próxima ejecución.
 */
export async function espejoAutomatico(activar: boolean): Promise<{ ok: boolean; activo: boolean; proximo: string | null; detalle: string }> {
    const plist = path.join(os.homedir(), "Library", "LaunchAgents", "com.starseed.espejo-drive.plist");
    if (!activar) {
        try {
            await execFileAsync("launchctl", ["unload", plist], { timeout: 5000 });
        } catch {
            // No estaba cargado: ignoramos.
        }
        try {
            await execFileAsync("rm", ["-f", plist], { timeout: 5000 });
        } catch {
            // Sin plist: ya está desactivado.
        }
        return { ok: true, activo: false, proximo: null, detalle: "Espejo automático diario desactivado." };
    }

    const drive = await detectarDrive();
    if (!drive.montado || !drive.espejo) return { ok: false, activo: false, proximo: null, detalle: "Google Drive no está montado o sin espejo." };
    const raiz = raizDelProyecto();
    const espejo = drive.espejo.ruta.startsWith("~") ? path.join(os.homedir(), drive.espejo.ruta.slice(1)) : drive.espejo.ruta;

    // Mismos orígenes que `espejar()`: solo las carpetas del memory root que existan.
    const origenes: string[] = [];
    for (const carpeta of CARPETAS_ESPEJO) {
        const origen = path.join(raiz, "starseed_memory_root", carpeta);
        try {
            await stat(origen);
            origenes.push(`'${origen}/'`);
        } catch {
            // No existe: se omite.
        }
    }
    if (origenes.length === 0) return { ok: false, activo: false, proximo: null, detalle: "No hay carpetas del memory root que espejar." };

    await mkdir(path.join(os.homedir(), ".starseed"), { recursive: true });
    const registro = path.join(os.homedir(), ".starseed", "espejo-drive-automatico.log");
    const comando = `rsync -a --no-perms --exclude '*.wav' --exclude '.env*' ${origenes.join(" ")} '${espejo}/' >> '${registro}' 2>&1`;
    const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.starseed.espejo-drive</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-lc</string>
        <string>${comando}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>4</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
    await writeFile(plist, plistXml, { encoding: "utf8" });
    try {
        await execFileAsync("launchctl", ["load", plist], { timeout: 5000 });
    } catch {
        // launchctl falla si ya está cargado: el plist ya existe, da igual.
    }
    return { ok: true, activo: true, proximo: proximaEjecucion(4, 0), detalle: "Espejo automático diario activado (04:00)." };
}

/** Estado del espejo automático: si el plist existe y, en tal caso, la próxima corrida. */
async function estadoEspejoAutomatico(): Promise<{ activo: boolean; proximo: string | null }> {
    const plist = path.join(os.homedir(), "Library", "LaunchAgents", "com.starseed.espejo-drive.plist");
    try {
        await stat(plist);
        return { activo: true, proximo: proximaEjecucion(4, 0) };
    } catch {
        return { activo: false, proximo: null };
    }
}

/**
 * Limpieza segura: solo ids de la lista blanca `candidatosRegenerables` con
 * `seguro: true`. NUNCA borra una ruta que no venga de esa lista (el cliente
 * no manda rutas, manda ids). Rechaza entero si hay un `next build` en marcha
 * (borrar cachés bajo una build activa la rompe).
 */
export async function limpiarRegenerables(ids: string[]): Promise<{ ok: boolean; limpiados: string[]; detalle: string }> {
    try {
        await execFileAsync("pgrep", ["-f", "next build"], { timeout: 3000 });
        return { ok: false, limpiados: [], detalle: "Hay una build de Next en marcha: la limpieza espera a que termine." };
    } catch {
        // pgrep no encontró nada (código 1): se puede limpiar.
    }
    const blanca = new Map(candidatosRegenerables(raizDelProyecto()).filter((c) => c.seguro).map((c) => [c.id, c.ruta]));
    // 2026-09-07 (A3): los registros de olas no son una carpeta entera sino
    // ficheros sueltos con más de 7 días; entran en la lista blanca por id y
    // se borran UNO A UNO con la misma regla que `logsViejos` (nunca un glob).
    blanca.set("olas-logs", carpetaLogsOlas());
    const limpiados: string[] = [];
    const rechazados: string[] = [];
    for (const id of ids) {
        if (id === "olas-logs") {
            try {
                await limpiarLogsOlas();
                limpiados.push(id);
            } catch (e) {
                rechazados.push(`${id} (${e instanceof Error ? e.message : "error"})`);
            }
            continue;
        }
        const ruta = blanca.get(id);
        if (!ruta) {
            rechazados.push(id);
            continue;
        }
        try {
            await execFileAsync("rm", ["-rf", ruta], { timeout: 15000 });
            limpiados.push(id);
        } catch (e) {
            rechazados.push(`${id} (${e instanceof Error ? e.message : "error"})`);
        }
    }
    return {
        ok: rechazados.length === 0,
        limpiados,
        detalle: rechazados.length === 0 ? `Limpieza hecha (${limpiados.length}).` : `Rechazados: ${rechazados.join(", ")}`,
    };
}

/**
 * Borra uno a uno (sin glob en `rm`) los `ola-*.log` de `carpetaLogsOlas()`
 * con más de 7 días. Devuelve cuántos borró.
 */
async function limpiarLogsOlas(): Promise<number> {
    const dir = carpetaLogsOlas();
    const archivos = await readdir(dir).catch(() => [] as string[]);
    const ahora = Date.now();
    const SIETE_DIAS = 7 * 24 * 3600 * 1000;
    let borrados = 0;
    for (const nombre of archivos) {
        if (!nombre.startsWith("ola-") || !nombre.endsWith(".log")) continue;
        const ruta = path.join(dir, nombre);
        try {
            const st = await stat(ruta);
            if (ahora - st.mtimeMs <= SIETE_DIAS) continue;
            await execFileAsync("rm", ["-f", ruta], { timeout: 10000 });
            borrados += 1;
        } catch {
            // Si el archivo desaparece a mitad, no pasa nada.
        }
    }
    return borrados;
}

/**
 * Memoria disponible real en MB: `os.freemem()` más las páginas INACTIVAS de
 * `vm_stat` (recuperables al instante en macOS), la misma medición que usa el
 * demonio de voz. Sin `vm_stat` (o fuera de macOS) solo freemem.
 */
export async function memoriaDisponibleMb(): Promise<number> {
    const libre = os.freemem();
    if (process.platform !== "darwin") return Math.round(libre / 1048576);
    try {
        const { stdout } = await execFileAsync("vm_stat", [], { timeout: 3000 });
        const paginaMatch = /page size of (\d+)/.exec(stdout);
        const paginasMatch = /^Pages inactive:\s+(\d+)/m.exec(stdout);
        if (!paginaMatch || !paginasMatch) return Math.round(libre / 1048576);
        return Math.round((libre + Number(paginasMatch[1]) * Number(paginaMatch[1])) / 1048576);
    } catch {
        return Math.round(libre / 1048576);
    }
}

/** POST tolerante; `timeoutMs` de tope y sin lanzar nunca. Devuelve el cuerpo JSON si lo hay. */
async function post(url: string, timeoutMs = 4000): Promise<{ ok: boolean; detalle: string; cuerpo: Record<string, unknown> | null }> {
    try {
        const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs) });
        const cuerpo = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        return { ok: r.ok, detalle: `HTTP ${r.status}`, cuerpo };
    } catch (e) {
        return { ok: false, detalle: e instanceof Error ? e.message : "sin respuesta", cuerpo: null };
    }
}

/**
 * Consulta `GET 127.0.0.1:8000/api/bitnet/estado` hasta 3 veces (una cada 3 s)
 * hasta que `dormido === true`. Sirve para cuando dormir el BitNet se tarda
 * más que la ventana de la petición: lo IMPORTANTE es que se haya dormido,
 * no que haya confirmado a tiempo.
 */
async function confirmarBitnetDormido(): Promise<boolean> {
    for (let intento = 0; intento < 3; intento++) {
        try {
            const r = await fetch("http://127.0.0.1:8000/api/bitnet/estado", { signal: AbortSignal.timeout(3000) });
            const j = (await r.json().catch(() => null)) as { dormido?: unknown } | null;
            if (r.ok && j && j.dormido === true) return true;
        } catch {
            // Sin respuesta: lo intentamos de nuevo.
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
}

/**
 * «Aliviar memoria»: duerme el BitNet (`POST 127.0.0.1:8000/api/bitnet/dormir`
 * con 20 s de ventana, confirmando por `/api/bitnet/estado` si expira antes)
 * y pide la cesión inmediata del pool de voz al demonio (`POST 127.0.0.1:4444/ceder`,
 * Ola 273 · A3). Espera 5 s y mide el antes/después con `vm_stat` (libre +
 * inactiva, igual que el demonio) con tope inferior de 0 en el alivio y nota
 * honesta si se movió poco (la memoria ya estaba cedida).
 */
export async function aliviarMemoria(): Promise<{
    antesMb: number;
    despuesMb: number;
    liberadoMb: number;
    nota: string | null;
    pasos: Array<{ que: string; ok: boolean; detalle: string }>;
}> {
    const antesMb = await memoriaDisponibleMb();
    const pasos: Array<{ que: string; ok: boolean; detalle: string }> = [];

    const bitnet = await post("http://127.0.0.1:8000/api/bitnet/dormir", 20000);
    if (bitnet.ok) {
        pasos.push({ que: "Dormir el llama-server BitNet", ok: true, detalle: bitnet.detalle });
    } else {
        // Dormir tarda hasta ~20 s: si expiró la ventana, confirmamos el estado real.
        const dormido = await confirmarBitnetDormido();
        pasos.push({
            que: "Dormir el llama-server BitNet",
            ok: dormido,
            detalle: dormido ? "dormido, confirmado por /estado" : bitnet.detalle,
        });
    }

    const voz = await post("http://127.0.0.1:4444/ceder");
    if (voz.ok && voz.cuerpo && typeof voz.cuerpo.cedidos === "number") {
        pasos.push({
            que: "Ceder el pool de voz del demonio",
            ok: true,
            detalle: `Cedidos ${voz.cuerpo.cedidos} servidores tts`,
        });
    } else {
        pasos.push({
            que: "Ceder el pool de voz del demonio",
            ok: voz.ok,
            detalle: voz.detalle.includes("404") ? "El demonio no acepta cesión (404): no cede" : voz.detalle,
        });
    }

    await new Promise((r) => setTimeout(r, 5000));
    const despuesMb = await memoriaDisponibleMb();
    const liberadoMb = Math.max(0, despuesMb - antesMb);
    const nota = liberadoMb < 100 ? "Poco alivio: la memoria ya estaba cedida o el sistema la volvió a ocupar." : null;
    return { antesMb, despuesMb, liberadoMb, nota, pasos };
}

/**
 * Junta todo el estado (disco, regenerables, Drive, swap) con tolerancia total
 * y rellena las acciones disponibles para la interfaz.
 */
export async function leerAlmacenamiento(): Promise<EstadoAlmacenamiento> {
    const raiz = raizDelProyecto();
    const [disco, regenerables, drive, swap, driveCuota, frias, espejoAutomatico] = await Promise.all([
        medirDisco(),
        medirRegenerables(raiz),
        detectarDrive(),
        medirSwap(),
        cuotaDrive(),
        medirCarpetasFrias(raiz),
        estadoEspejoAutomatico(),
    ]);
    const haySeguros = regenerables.some((r) => r.seguro);
    return {
        t: new Date().toISOString(),
        disco,
        regenerables,
        drive,
        driveCuota,
        frias,
        espejoAutomatico,
        swap: { usadoMb: swap.usadoMb, totalMb: swap.totalMb, explicacion: explicarSwap(swap.usadoMb, swap.totalMb) },
        acciones: [
            {
                id: "espejar",
                etiqueta: "Espejar el memory root a Google Drive",
                disponible: drive.montado,
                motivo: drive.montado ? undefined : "Google Drive (DriveFS) no está montado en esta máquina.",
            },
            {
                id: "limpiar",
                etiqueta: "Limpiar archivos regenerables",
                disponible: haySeguros,
                motivo: haySeguros ? undefined : "No hay nada regenerable que limpiar ahora mismo.",
            },
            { id: "aliviar", etiqueta: "Aliviar memoria (BitNet a dormir + cesión de voz)", disponible: true },
        ],
    };
}
