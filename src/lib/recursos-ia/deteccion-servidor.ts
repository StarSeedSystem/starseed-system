/**
 * Recursos de IA por neurona · la máquina POR DENTRO (solo SERVIDOR · 2026-10-23).
 *
 * El navegador no ve los discos, ni el chip, ni la RAM real (`deviceMemory` topa en 8), ni qué
 * runtimes de IA hay instalados: este módulo lo mide en la propia neurona y lo sirve
 * `GET /api/recursos-ia/detectar` (solo local, guardián de Genesis). SOP
 * `architecture/recursos-ia-neurona.md` §4.
 *
 * Reglas (por qué así):
 *  - Cada orden con `execFile` (sin shell: nada se interpreta) y tope de 3 s; todo junto < 8 s,
 *    porque la ruta la espera una pantalla. Lo que no contesta a tiempo se queda fuera con su aviso.
 *  - Caché en memoria de 60 s: varias superficies piden el inventario a la vez y medir cuesta
 *    procesos (system_profiler tarda ~1 s).
 *  - Nunca lanza: cada fallo es un aviso en `avisos`, nunca una cifra inventada.
 *  - Nunca devuelve secretos, variables de entorno ni el home real (se sustituye por `~`). Los
 *    errores de las órdenes NO se copian (pueden llevar rutas): se dice qué no se pudo leer.
 *  - GB = 2^30 bytes, como `df -h` y los medidores de Genesis: lo conservador para decidir si cabe.
 *
 * Los parsers son PUROS y se exportan para probarlos con salidas reales (Mac M1 de Alex).
 */
import { execFile } from "node:child_process";
import { constants as fsConstantes } from "node:fs";
import { access, readFile, statfs } from "node:fs/promises";
import os from "node:os";

import { disponibleDeVmStat, memoriaDeMeminfo } from "@/lib/mando/memoria-medidor";
import type { DeteccionMaquina, GpuDetectada, VolumenDetectado } from "./deteccion-tipos";

export type { DeteccionMaquina, GpuDetectada, VolumenDetectado } from "./deteccion-tipos";

const GIB = 1024 ** 3;
/**
 * Tope por orden (ms). (integración, medido en la Mac de Alex) Con 3 s, `system_profiler` y
 * `swift --version` —0,7 s y 1,7 s a solas— no llegaban al lanzarse todas las órdenes a la vez en
 * una Mac de 8 GB cargada: la GPU (Metal 4) y Swift salían «sin leer».
 */
export const TOPE_ORDEN_MS = 7_000;
/** Tope de toda la detección (ms): por debajo de los 15 s que espera el navegador. */
export const TOPE_TOTAL_MS = 11_000;
/** Vida de la caché en memoria (ms). */
export const CACHE_MS = 60_000;
/** Volúmenes más pequeños no sirven para modelos y solo ensucian (EFI, montajes de 10 MB…). */
const MIN_VOLUMEN_GB = 1;

const gb = (bytes: number, decimales = 1): number => {
    const f = 10 ** decimales;
    return Math.round((bytes / GIB) * f) / f;
};

/* ───────────────────────────── Parsers PUROS ───────────────────────────── */

/** Sustituye el home real por `~` (también dentro de frases). PURA. */
export function sinHome(texto: string, home: string): string {
    if (!home || home === "/" || !texto) return texto;
    return texto.split(home).join("~");
}

/** `sw_vers` → «macOS 26.3.1». PURA; null si no trae versión. */
export function soDeSwVers(txt: string): string | null {
    const version = /ProductVersion:\s*([\d.]+)/.exec(txt)?.[1];
    if (!version) return null;
    const nombre = /ProductName:\s*(.+)/.exec(txt)?.[1]?.trim() || "macOS";
    return `${nombre} ${version}`;
}

/** Versión mayor de macOS a partir de «macOS 26.3.1» (26) o null. PURA. */
export function macosMayor(so: string): number | null {
    const m = /(?:macOS|Mac OS X)\s+(\d+)/i.exec(so);
    return m ? Number(m[1]) : null;
}

/**
 * `/etc/os-release` → «Linux (Ubuntu 24.04.1 LTS)». Empieza siempre por «Linux» para que la
 * compatibilidad (`so: ["Linux"]`) case por prefijo sin conocer cada distribución. PURA.
 */
export function soDeOsRelease(txt: string): string {
    const campo = (k: string): string | undefined => {
        const m = new RegExp(`^${k}=(?:"([^"]*)"|'([^']*)'|(.*))$`, "m").exec(txt);
        const v = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
        return v || undefined;
    };
    const bonito = campo("PRETTY_NAME") || [campo("NAME"), campo("VERSION_ID")].filter(Boolean).join(" ");
    return bonito ? `Linux (${bonito})` : "Linux";
}

/** `uname -m` → arquitectura del contrato. PURA. */
export function arquitecturaDe(unameM: string): DeteccionMaquina["arquitectura"] {
    const a = unameM.trim().toLowerCase();
    if (a === "arm64" || a === "aarch64" || a.startsWith("armv8") || a.startsWith("armv9")) return "arm64";
    if (a === "x86_64" || a === "amd64" || a === "x64") return "x86_64";
    return "otra";
}

/**
 * `sysctl -n machdep.cpu.brand_string hw.memsize hw.ncpu`. No se fía del orden de las líneas (si
 * una clave no existe, sysctl la salta): el texto es el chip, el número grande la RAM, el pequeño
 * los núcleos. PURA.
 */
export function sysctlMac(txt: string): { chip?: string; ramGb?: number; nucleos?: number } {
    const out: { chip?: string; ramGb?: number; nucleos?: number } = {};
    for (const linea of txt.split("\n").map((l) => l.trim()).filter(Boolean)) {
        if (/^\d+$/.test(linea)) {
            const n = Number(linea);
            if (n > 1e8) out.ramGb = gb(n);
            else if (n > 0 && n < 4096) out.nucleos = n;
        } else if (!out.chip) {
            out.chip = linea.replace(/\s+/g, " ").slice(0, 80);
        }
    }
    return out;
}

/** RAM libre (GB, 2 decimales) según `vm_stat`: libres + inactivas + especulativas. PURA. */
export function ramLibreGbDeVmStat(txt: string): number | null {
    const mb = disponibleDeVmStat(txt);
    return mb === null ? null : Math.round((mb / 1024) * 100) / 100;
}

/** «8 GB», «1536 MB» → GB. PURA. */
function tamanoTextoAGb(v: unknown): number | undefined {
    const m = /([\d.]+)\s*(GB|MB|TB)/i.exec(String(v ?? ""));
    if (!m) return undefined;
    const n = Number(m[1]);
    const u = m[2].toUpperCase();
    const r = u === "TB" ? n * 1024 : u === "MB" ? n / 1024 : n;
    return Number.isFinite(r) ? Math.round(r * 10) / 10 : undefined;
}

/**
 * `system_profiler SPDisplaysDataType -json` → GPUs. En Apple Silicon la memoria es unificada (no
 * hay VRAM propia) y, desde macOS 26, M1 y posteriores tienen Metal 4. PURA.
 */
export function gpusDeSystemProfiler(json: string, ctx: { macosMayor?: number | null } = {}): GpuDetectada[] {
    let datos: unknown;
    try {
        datos = JSON.parse(json);
    } catch {
        return [];
    }
    const lista = (datos as { SPDisplaysDataType?: unknown })?.SPDisplaysDataType;
    if (!Array.isArray(lista)) return [];
    const out: GpuDetectada[] = [];
    for (const crudo of lista) {
        if (!crudo || typeof crudo !== "object") continue;
        const g = crudo as Record<string, unknown>;
        const modelo = String(g.sppci_model ?? g._name ?? "").trim();
        if (!modelo) continue;
        const vendedor = String(g.spdisplays_vendor ?? g.sppci_vendor ?? "");
        const appleSilicon = /^Apple M\d/i.test(modelo) || (/apple/i.test(vendedor) && /^Apple/i.test(modelo));
        const nucleos = Number(g.sppci_cores);
        const nombre = (Number.isFinite(nucleos) && nucleos > 0 ? `${modelo} · GPU de ${nucleos} núcleos` : modelo).slice(0, 90);
        const familia = String(g.spdisplays_mtlgpufamilysupport ?? g.spdisplays_metal ?? g.spdisplays_metalfamily ?? "");
        const nf = /metal_?(\d+)/i.exec(familia);
        let api: string[] = nf ? [`metal${nf[1]}`] : /metal|supported/i.test(familia) ? ["metal"] : [];
        if (appleSilicon && (ctx.macosMayor ?? 0) >= 26) api = ["metal4"];
        let vramGb: number | undefined;
        for (const [k, v] of Object.entries(g)) {
            if (/vram/i.test(k) && !/shared/i.test(k)) vramGb = vramGb ?? tamanoTextoAGb(v);
        }
        out.push({
            nombre,
            ...(appleSilicon ? { memoriaUnificada: true } : vramGb !== undefined ? { vramGb, memoriaUnificada: false } : {}),
            ...(api.length ? { api } : {}),
        });
    }
    return out;
}

/** Una fila de `df -kP` (el dispositivo solo se usa por dentro: nunca sale en la respuesta). */
export interface FilaDf {
    dispositivo: string;
    montaje: string;
    totalGb: number;
    libreGb: number;
}

/** `df -kP` → filas (los montajes pueden llevar espacios: el montaje es el resto de la línea). PURA. */
export function filasDf(txt: string): FilaDf[] {
    const out: FilaDf[] = [];
    for (const linea of txt.split("\n")) {
        const m = /^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+%|-)\s+(\/.*)$/.exec(linea.trimEnd());
        if (!m) continue;
        out.push({
            dispositivo: m[1].trim(),
            montaje: m[6],
            totalGb: gb(Number(m[2]) * 1024),
            libreGb: gb(Number(m[4]) * 1024),
        });
    }
    return out;
}

/** Montajes del sistema de macOS que no son almacenes (VM, arranque, actualizaciones…). */
const MONTAJES_SISTEMA_MAC = /^\/System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|iSCSPreboot|Hardware)(\/|$)/;

/** Montajes de una Mac que interesan: `/`, `/System/Volumes/Data` y cada `/Volumes/*` real. PURA. */
export function montajesMacRelevantes(filas: FilaDf[]): { sistema?: FilaDf; datos?: FilaDf; volumenes: FilaDf[] } {
    const sistema = filas.find((f) => f.montaje === "/");
    const datos = filas.find((f) => f.montaje === "/System/Volumes/Data");
    const volumenes = filas.filter(
        (f) =>
            f.montaje.startsWith("/Volumes/") &&
            !MONTAJES_SISTEMA_MAC.test(f.montaje) &&
            f.dispositivo !== "devfs" &&
            !f.dispositivo.startsWith("map ") &&
            // Ocultos y las instantáneas de Time Machine no son discos que la persona elija.
            !/\/\.|com\.apple\.TimeMachine/.test(f.montaje) &&
            f.totalGb >= MIN_VOLUMEN_GB,
    );
    return { sistema, datos, volumenes };
}

/** Lo que interesa de `diskutil info -plist <montaje>`. */
export interface InfoDiskutil {
    interno?: boolean;
    protocolo?: string;
    ssd?: boolean;
    extraible?: boolean;
    escribible?: boolean;
    sistemaArchivos?: string;
    nombre?: string;
    medio?: string;
}

const desescaparXml = (s: string): string =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** `diskutil info -plist` (XML) → `InfoDiskutil`. Lee solo valores escalares por su clave. PURA. */
export function infoDeDiskutilPlist(xml: string): InfoDiskutil {
    const valor = (clave: string): string | boolean | number | undefined => {
        const m = new RegExp(`<key>${clave}</key>\\s*(<true\\s*/>|<false\\s*/>|<string>([^<]*)</string>|<integer>(-?\\d+)</integer>)`).exec(xml);
        if (!m) return undefined;
        if (m[1].startsWith("<true")) return true;
        if (m[1].startsWith("<false")) return false;
        if (m[2] !== undefined) return desescaparXml(m[2]).trim();
        if (m[3] !== undefined) return Number(m[3]);
        return undefined;
    };
    const bool = (...claves: string[]): boolean | undefined => {
        for (const c of claves) {
            const v = valor(c);
            if (typeof v === "boolean") return v;
        }
        return undefined;
    };
    const texto = (...claves: string[]): string | undefined => {
        for (const c of claves) {
            const v = valor(c);
            if (typeof v === "string" && v) return v;
        }
        return undefined;
    };
    const out: InfoDiskutil = {};
    const asignar = <K extends keyof InfoDiskutil>(k: K, v: InfoDiskutil[K] | undefined) => {
        if (v !== undefined) out[k] = v;
    };
    asignar("interno", bool("Internal"));
    asignar("protocolo", texto("BusProtocol", "Protocol"));
    asignar("ssd", bool("SolidState"));
    asignar("extraible", bool("RemovableMediaOrExternalDevice", "RemovableMedia", "Removable"));
    asignar("escribible", bool("WritableVolume", "Writable"));
    asignar("sistemaArchivos", texto("FilesystemType", "FilesystemName"));
    asignar("nombre", texto("VolumeName"));
    asignar("medio", texto("MediaName", "IORegistryEntryName"));
    return out;
}

const esRedDispositivo = (dispositivo: string, fs?: string): boolean =>
    dispositivo.startsWith("//") || /^[\w.-]+:\//.test(dispositivo) || /smbfs|nfs|afpfs|webdav|cifs/i.test(fs ?? "");

/** Fila de `df` + `diskutil` → `VolumenDetectado` (externo, tipo de disco y conexión). PURA. */
export function volumenMac(fila: FilaDf, info: InfoDiskutil | null, home = ""): VolumenDetectado {
    const i = info ?? {};
    const protocolo = (i.protocolo ?? "").toLowerCase();
    const red = esRedDispositivo(fila.dispositivo, i.sistemaArchivos);
    const sd = /secure digital|\bsd\b|sdxc|sdhc/i.test(`${i.protocolo ?? ""} ${i.medio ?? ""}`);
    const externo =
        red || i.interno === false || i.extraible === true || (i.interno === undefined && fila.montaje.startsWith("/Volumes/"));
    const tipoDisco: VolumenDetectado["tipoDisco"] = red
        ? "red"
        : sd
          ? "sd"
          : i.ssd === false
            ? "hdd"
            : i.ssd === true
              ? /pci|nvme|apple fabric/.test(protocolo)
                  ? "nvme"
                  : "ssd"
              : "desconocido";
    const conexion: VolumenDetectado["conexion"] = red
        ? "red"
        : /usb/.test(protocolo)
          ? "usb"
          : /thunderbolt/.test(protocolo)
            ? "thunderbolt"
            : !externo || i.interno === true
              ? "interna"
              : // Un PCI-Express FUERA de la Mac es una caja Thunderbolt/USB4 (macOS lo reporta así).
                /pci/.test(protocolo)
                ? "thunderbolt"
                : "usb";
    const nombreBase = fila.montaje === "/" ? "Disco del sistema" : fila.montaje.split("/").filter(Boolean).pop() || fila.montaje;
    return {
        montaje: sinHome(fila.montaje, home),
        nombre: sinHome((i.nombre || nombreBase).slice(0, 80), home),
        totalGb: fila.totalGb,
        libreGb: fila.libreGb,
        externo,
        tipoDisco,
        conexion,
        ...(i.sistemaArchivos ? { sistemaArchivos: i.sistemaArchivos.toLowerCase().slice(0, 20) } : {}),
        ...(i.escribible === false ? { soloLectura: true } : {}),
    };
}

/** Montajes de Linux que no son almacenes de la persona (sistema, arranque, ataduras de archivos). */
const MONTAJES_IGNORADOS_LINUX = /^\/(etc|dev|proc|sys|boot|efi|snap|tmp)(\/|$)|^\/run(\/(?!media\/)|$)|^\/var\/snap(\/|$)/;

const bit = (v: unknown): boolean | undefined =>
    v === true || v === "1" || v === 1 ? true : v === false || v === "0" || v === 0 ? false : undefined;
const numero = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
};

/**
 * `lsblk -J -b -o NAME,MOUNTPOINT,TRAN,ROTA,RM,SIZE,FSAVAIL,FSTYPE,TYPE` → volúmenes. Las
 * particiones heredan transporte/extraíble del disco padre (lsblk solo lo pone en el disco).
 * Acepta las dos formas de lsblk: booleanos o "0"/"1", y `mountpoint` o `mountpoints`. PURA.
 */
export function volumenesDeLsblk(json: string, home = ""): VolumenDetectado[] {
    let datos: unknown;
    try {
        datos = JSON.parse(json);
    } catch {
        return [];
    }
    const raiz = (datos as { blockdevices?: unknown })?.blockdevices;
    if (!Array.isArray(raiz)) return [];
    const out: VolumenDetectado[] = [];
    const vistos = new Set<string>();
    const visitar = (nodo: unknown, padre: { tran?: string; rm?: boolean; rota?: boolean; nombre?: string }) => {
        if (!nodo || typeof nodo !== "object") return;
        const n = nodo as Record<string, unknown>;
        const nombreDisp = String(n.name ?? "");
        const tran = (typeof n.tran === "string" && n.tran) || padre.tran;
        const rm = bit(n.rm) ?? padre.rm;
        const rota = bit(n.rota) ?? padre.rota;
        const raizDisp = padre.nombre ?? nombreDisp;
        const montajes = [
            ...(typeof n.mountpoint === "string" ? [n.mountpoint] : []),
            ...(Array.isArray(n.mountpoints) ? n.mountpoints.filter((x): x is string => typeof x === "string") : []),
        ];
        const total = numero(n.size);
        const libre = numero(n.fsavail);
        const fstype = typeof n.fstype === "string" ? n.fstype : undefined;
        for (const montaje of montajes) {
            if (!montaje.startsWith("/") || vistos.has(montaje) || MONTAJES_IGNORADOS_LINUX.test(montaje)) continue;
            if (fstype && /squashfs|iso9660|swap/i.test(fstype)) continue;
            if (total === null || libre === null || gb(total) < MIN_VOLUMEN_GB) continue;
            vistos.add(montaje);
            const mmc = raizDisp.startsWith("mmcblk");
            const enMedia = /^\/(run\/)?media\//.test(montaje);
            const externo = tran === "usb" || rm === true || (enMedia && montaje !== "/");
            const tipoDisco: VolumenDetectado["tipoDisco"] =
                tran === "nvme" || raizDisp.startsWith("nvme")
                    ? "nvme"
                    : mmc
                      ? "sd"
                      : rota === true
                        ? "hdd"
                        : rota === false
                          ? "ssd"
                          : "desconocido";
            const conexion: VolumenDetectado["conexion"] = tran === "usb" ? "usb" : externo && !mmc ? "usb" : "interna";
            out.push({
                montaje: sinHome(montaje, home),
                nombre: sinHome(montaje === "/" ? "Disco del sistema" : montaje.split("/").filter(Boolean).pop() || montaje, home).slice(0, 80),
                totalGb: gb(total),
                libreGb: gb(libre),
                externo,
                tipoDisco,
                conexion,
                ...(fstype ? { sistemaArchivos: fstype.slice(0, 20) } : {}),
            });
        }
        if (Array.isArray(n.children)) for (const h of n.children) visitar(h, { tran, rm, rota, nombre: raizDisp });
    };
    for (const d of raiz) visitar(d, {});
    return out;
}

/** `df -kP` en Linux (si no hay lsblk) → volúmenes reales (sin tmpfs, overlay, montajes de sistema). PURA. */
export function volumenesLinuxDeDf(txt: string, home = ""): VolumenDetectado[] {
    return filasDf(txt)
        .filter(
            (f) =>
                f.dispositivo.startsWith("/dev/") &&
                !MONTAJES_IGNORADOS_LINUX.test(f.montaje) &&
                f.totalGb >= MIN_VOLUMEN_GB,
        )
        .map((f) => {
            const externo = /^\/(run\/)?media\//.test(f.montaje);
            return {
                montaje: sinHome(f.montaje, home),
                nombre: sinHome(f.montaje === "/" ? "Disco del sistema" : f.montaje.split("/").filter(Boolean).pop() || f.montaje, home),
                totalGb: f.totalGb,
                libreGb: f.libreGb,
                externo,
                tipoDisco: f.dispositivo.includes("nvme") ? "nvme" : f.dispositivo.includes("mmcblk") ? "sd" : "desconocido",
                conexion: externo ? "usb" : "interna",
            } satisfies VolumenDetectado;
        });
}

/** `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` → GPUs (VRAM en MiB). PURA. */
export function gpusDeNvidiaSmi(txt: string): GpuDetectada[] {
    const out: GpuDetectada[] = [];
    for (const linea of txt.split("\n")) {
        const partes = linea.split(",").map((p) => p.trim());
        if (partes.length < 2 || !partes[0]) continue;
        const mib = Number(partes[1]);
        out.push({
            nombre: partes[0].slice(0, 90),
            ...(Number.isFinite(mib) && mib > 0 ? { vramGb: Math.round((mib / 1024) * 10) / 10 } : {}),
            memoriaUnificada: false,
            api: ["cuda"],
        });
    }
    return out;
}

/** `/proc/cpuinfo` → modelo, núcleos lógicos y SIMD medido (flags/Features). PURA. */
export function cpuDeProcCpuinfo(txt: string): { modelo?: string; nucleos: number; simd: Array<"neon" | "avx2" | "avx512"> } {
    const campo = (k: string) => new RegExp(`^${k}\\s*:\\s*(.+)$`, "m").exec(txt)?.[1]?.trim();
    const modelo = campo("model name") || campo("Model") || campo("Hardware") || undefined;
    const nucleos = (txt.match(/^processor\s*:/gm) ?? []).length;
    const flags = ` ${(campo("flags") ?? "").toLowerCase()} `;
    const features = ` ${(campo("Features") ?? "").toLowerCase()} `;
    const simd: Array<"neon" | "avx2" | "avx512"> = [];
    if (/ (asimd|neon) /.test(features)) simd.push("neon");
    if (/ avx2 /.test(flags)) simd.push("avx2");
    if (/ avx512f /.test(flags)) simd.push("avx512");
    return { ...(modelo ? { modelo: modelo.replace(/\s+/g, " ").slice(0, 80) } : {}), nucleos, simd };
}

/** `/proc/meminfo` → RAM total y disponible (GB). PURA. */
export function ramDeMeminfo(txt: string): { ramGb?: number; ramLibreGb?: number } {
    const total = /^MemTotal:\s*(\d+)/m.exec(txt);
    const libre = memoriaDeMeminfo(txt);
    return {
        ...(total ? { ramGb: gb(Number(total[1]) * 1024) } : {}),
        ...(libre ? { ramLibreGb: Math.round((libre.libreMb / 1024) * 100) / 100 } : {}),
    };
}

/** SIMD de una Mac Intel (`sysctl -n machdep.cpu.leaf7_features machdep.cpu.features`). PURA. */
export function simdDeSysctlIntel(txt: string): Array<"avx2" | "avx512"> {
    const t = ` ${txt.toUpperCase().replace(/\s+/g, " ")} `;
    return [...(/ AVX2 /.test(t) ? (["avx2"] as const) : []), ...(/ AVX512F /.test(t) ? (["avx512"] as const) : [])];
}

export type Herramienta = "swift" | "xcode" | "python" | "node" | "cmake" | "clang";

/**
 * Salida de `--version` → nombre del contrato: «swift-6.0.2», «xcode-26», «python-3.14»,
 * «node-22», «cmake-3.31», «clang-18» (Apple clang va aparte, «apple-clang-16»: su numeración no
 * es la de LLVM y bitnet.cpp pide clang ≥ 18 de LLVM). PURA; null si no se reconoce.
 */
export function herramientaDe(h: Herramienta, txt: string): string | null {
    const t = txt.trim();
    if (!t) return null;
    switch (h) {
        case "swift": {
            const m = /Swift version (\d+(?:\.\d+){0,2})/.exec(t);
            return m ? `swift-${m[1]}` : null;
        }
        case "xcode": {
            const m = /^Xcode (\d+)/m.exec(t);
            return m ? `xcode-${m[1]}` : null;
        }
        case "python": {
            const m = /Python (\d+)\.(\d+)/.exec(t);
            return m ? `python-${m[1]}.${m[2]}` : null;
        }
        case "node": {
            const m = /^v?(\d+)\.\d+/.exec(t);
            return m ? `node-${m[1]}` : null;
        }
        case "cmake": {
            const m = /cmake version (\d+)\.(\d+)/.exec(t);
            return m ? `cmake-${m[1]}.${m[2]}` : null;
        }
        case "clang": {
            const apple = /Apple clang version (\d+)/.exec(t);
            if (apple) return `apple-clang-${apple[1]}`;
            const m = /clang version (\d+)/.exec(t);
            return m ? `clang-${m[1]}` : null;
        }
    }
}

/** Neural Engine de Apple Silicon por chip (TOPS públicos de Apple). PURA. */
export function npuApple(chip: string | undefined): DeteccionMaquina["npu"] | undefined {
    const m = /Apple (M\d)/i.exec(chip ?? "");
    if (!m) return undefined;
    const tops: Record<string, number> = { M1: 11, M2: 15.8, M3: 18, M4: 38 };
    const t = tops[m[1].toUpperCase()];
    return { nombre: "Apple Neural Engine", ...(t ? { tops: t } : {}) };
}

/** Servidores de IA locales que se sondean (SOLO bucle local). */
export const SERVIDORES_IA = [
    { id: "bitnet", base: "http://127.0.0.1:8790", ruta: "/health", forma: "salud" },
    { id: "ollama", base: "http://127.0.0.1:11434", ruta: "/api/tags", forma: "ollama" },
    { id: "turbo-fieldfare", base: "http://127.0.0.1:8080/v1", ruta: "/models", forma: "openai" },
    // Sin clave a propósito: un 401 ya dice que está vivo, y así no se manda ninguna.
    { id: "freellmapi", base: "http://127.0.0.1:3001/v1", ruta: "/models", forma: "openai", vivoCon401: true },
    { id: "lmstudio", base: "http://127.0.0.1:1234/v1", ruta: "/models", forma: "openai" },
] as const;

type DefServidor = (typeof SERVIDORES_IA)[number];

/**
 * Respuesta HTTP → ¿vivo? y modelos. El 8080 es un puerto común: para contar como TurboFieldfare
 * (o cualquier OpenAI) tiene que contestar la FORMA de `/v1/models`, no solo un 200. PURA.
 */
export function interpretarServidor(def: Pick<DefServidor, "forma"> & { vivoCon401?: boolean }, status: number, cuerpo: string): { ok: boolean; modelos?: string[] } {
    if (def.vivoCon401 && (status === 401 || status === 403)) return { ok: true };
    if (status < 200 || status >= 300) return { ok: false };
    if (def.forma === "salud") return { ok: true };
    let j: unknown;
    try {
        j = JSON.parse(cuerpo.slice(0, 400_000));
    } catch {
        return { ok: false };
    }
    const lista =
        def.forma === "ollama" ? (j as { models?: unknown })?.models : (j as { data?: unknown })?.data;
    if (!Array.isArray(lista)) return { ok: false };
    const modelos = lista
        .map((m) => {
            const o = (m ?? {}) as { name?: unknown; id?: unknown; model?: unknown };
            return String(o.name ?? o.id ?? o.model ?? "").slice(0, 120);
        })
        .filter(Boolean)
        .slice(0, 50);
    return { ok: true, ...(modelos.length ? { modelos } : {}) };
}

/** Ejecutables, carpetas y servidores vivos → runtimes de IA instalados. PURA. */
export function runtimesDe(e: { ejecutables: string[]; carpetas: string[]; servidores: { id: string; ok: boolean }[] }): string[] {
    const r = new Set<string>();
    const ej = new Set(e.ejecutables);
    if (ej.has("ollama")) r.add("ollama");
    if (ej.has("llama-server") || ej.has("llama-cli")) r.add("llama-cpp");
    if (ej.has("mlx_lm.generate")) r.add("mlx");
    for (const c of e.carpetas) {
        if (/IA 1\.58 bit/i.test(c)) r.add("bitnet-cpp");
        if (/turbo-fieldfare/i.test(c)) r.add("turbo-fieldfare");
    }
    const vivos: Record<string, string> = { bitnet: "bitnet-cpp", ollama: "ollama", "turbo-fieldfare": "turbo-fieldfare", lmstudio: "lmstudio" };
    for (const s of e.servidores) if (s.ok && vivos[s.id]) r.add(vivos[s.id]);
    return [...r].sort();
}

/* ───────────────────────────── Orquestación ───────────────────────────── */

export interface SalidaOrden {
    stdout: string;
    stderr: string;
}

/** Todo lo externo, inyectable (las pruebas simulan una Mac o un Linux enteros). */
export interface DependenciasDeteccion {
    plataforma: NodeJS.Platform;
    home: string;
    host: string;
    /** Ejecuta sin shell con tope; RECHAZA si falla o sale con error. */
    correr: (orden: string, args: string[]) => Promise<SalidaOrden>;
    leer: (ruta: string) => Promise<string>;
    existe: (ruta: string) => Promise<boolean>;
    /** GET con tope de 1,5 s; rechaza si no contesta. */
    pedir: (url: string) => Promise<{ status: number; cuerpo: string }>;
    /** Libre/total de un montaje (statfs), para cuando lsblk/df no lo dan. */
    espacio?: (montaje: string) => Promise<{ totalBytes: number; libreBytes: number }>;
    respaldo: { arch: string; nucleos: number; modeloCpu?: string; ramBytes: number; libreBytes: number; versionNode: string };
    plazoMs?: number;
    ahora?: () => Date;
}

const EJECUTABLES = ["ollama", "llama-server", "llama-cli", "mlx_lm.generate"] as const;
const CARPETAS_CONOCIDAS = ["Documents/IA 1.58 bit", "turbo-fieldfare", "Documents/turbo-fieldfare"] as const;

/** Lo que se va llenando mientras corren las sondas (si el plazo corta, se usa lo que haya). */
interface Acumulado {
    so?: string;
    arquitectura?: DeteccionMaquina["arquitectura"];
    chip?: string;
    nucleos?: number;
    ramGb?: number;
    ramLibreGb?: number;
    gpus?: GpuDetectada[];
    gpuJson?: string;
    volumenes?: VolumenDetectado[];
    herramientas: string[];
    ejecutables: string[];
    carpetas: string[];
    servidores: DeteccionMaquina["servidoresIA"];
    simd?: Array<"neon" | "avx2" | "avx512">;
    avisos: string[];
}

const textoDe = (s: SalidaOrden) => `${s.stdout}\n${s.stderr}`.trim();

async function intentar<T>(f: () => Promise<T>): Promise<T | null> {
    try {
        return await f();
    } catch {
        return null;
    }
}

async function sondearServidores(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    await Promise.all(
        SERVIDORES_IA.map(async (def) => {
            const r = await intentar(() => dep.pedir(`${def.base}${def.ruta}`));
            const v = r ? interpretarServidor(def, r.status, r.cuerpo) : { ok: false };
            a.servidores.push({ id: def.id, url: def.base, ok: v.ok, ...(v.modelos ? { modelos: v.modelos } : {}) });
        }),
    );
}

async function buscarEjecutables(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    await Promise.all(
        EJECUTABLES.map(async (n) => {
            const r = await intentar(() => dep.correr("which", [n]));
            if (r && r.stdout.trim()) a.ejecutables.push(n);
        }),
    );
}

async function buscarCarpetas(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    await Promise.all(
        CARPETAS_CONOCIDAS.map(async (rel) => {
            if (await intentar(() => dep.existe(`${dep.home}/${rel}`))) a.carpetas.push(`~/${rel}`);
        }),
    );
}

async function herramienta(dep: DependenciasDeteccion, a: Acumulado, h: Herramienta, orden: string, args: string[]): Promise<boolean> {
    const r = await intentar(() => dep.correr(orden, args));
    const v = r ? herramientaDe(h, textoDe(r)) : null;
    if (v) a.herramientas.push(v);
    return !!v;
}

async function detectarMac(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    const tareas: Promise<unknown>[] = [];
    tareas.push(
        intentar(() => dep.correr("sw_vers", [])).then((r) => {
            const so = r ? soDeSwVers(r.stdout) : null;
            if (so) a.so = so;
            else a.avisos.push("No se pudo leer la versión de macOS (sw_vers).");
        }),
        intentar(() => dep.correr("uname", ["-m"])).then((r) => {
            if (r) a.arquitectura = arquitecturaDe(r.stdout);
        }),
        intentar(() => dep.correr("sysctl", ["-n", "machdep.cpu.brand_string", "hw.memsize", "hw.ncpu"])).then((r) => {
            if (!r) return void a.avisos.push("No se pudo leer el chip ni la RAM (sysctl): se usan los datos de Node.");
            const s = sysctlMac(r.stdout);
            if (s.chip) a.chip = s.chip;
            if (s.ramGb) a.ramGb = s.ramGb;
            if (s.nucleos) a.nucleos = s.nucleos;
        }),
        intentar(() => dep.correr("vm_stat", [])).then((r) => {
            const l = r ? ramLibreGbDeVmStat(r.stdout) : null;
            if (l !== null) a.ramLibreGb = l;
        }),
        intentar(() => dep.correr("system_profiler", ["SPDisplaysDataType", "-json"])).then((r) => {
            if (r) a.gpuJson = r.stdout;
            else a.avisos.push("No se pudo leer la GPU (system_profiler).");
        }),
        volumenesMac(dep, a),
        // Sin herramientas de desarrollo, /usr/bin/swift y /usr/bin/python3 son lanzaderas que ABREN
        // el diálogo de instalación de macOS: se pregunta antes con `xcode-select -p`, que no abre nada.
        intentar(() => dep.correr("xcode-select", ["-p"])).then(async (r) => {
            const conDev = !!r && !!r.stdout.trim();
            const t: Promise<unknown>[] = [
                herramienta(dep, a, "node", "node", ["--version"]),
                herramienta(dep, a, "cmake", "cmake", ["--version"]),
                herramienta(dep, a, "xcode", "xcodebuild", ["-version"]).then(async (hay) => {
                    if (hay) return;
                    const plist = await intentar(() => dep.leer("/Applications/Xcode.app/Contents/version.plist"));
                    const v = plist ? /<key>CFBundleShortVersionString<\/key>\s*<string>(\d+)/.exec(plist)?.[1] : undefined;
                    if (v) {
                        a.herramientas.push(`xcode-${v}`);
                        a.avisos.push("Xcode está instalado pero no es el activo: «sudo xcode-select -s /Applications/Xcode.app» para compilar con él.");
                    } else {
                        a.avisos.push("Sin Xcode: lo que se compila con Xcode (p. ej. TurboFieldfare) necesita instalarlo desde la App Store.");
                    }
                }),
            ];
            if (conDev) {
                t.push(
                    herramienta(dep, a, "swift", "swift", ["--version"]),
                    herramienta(dep, a, "python", "python3", ["--version"]),
                    herramienta(dep, a, "clang", "clang", ["--version"]),
                );
            } else {
                a.avisos.push("Sin herramientas de desarrollo de Apple (xcode-select --install): no se mide Swift ni clang.");
                // Python de Homebrew no depende de las herramientas de Apple.
                t.push(herramienta(dep, a, "python", "/opt/homebrew/bin/python3", ["--version"]));
            }
            await Promise.all(t);
        }),
        buscarEjecutables(dep, a),
        buscarCarpetas(dep, a),
        sondearServidores(dep, a),
    );
    await Promise.all(tareas);
    // SIMD: NEON es parte de arm64; en Intel se mide.
    const arq = a.arquitectura ?? arquitecturaDe(dep.respaldo.arch);
    if (/^Apple M/i.test(a.chip ?? "") || arq === "arm64") a.simd = ["neon"];
    else if (arq === "x86_64") {
        const r = await intentar(() => dep.correr("sysctl", ["-n", "machdep.cpu.leaf7_features", "machdep.cpu.features"]));
        if (r) a.simd = simdDeSysctlIntel(r.stdout);
    }
}

async function volumenesMac(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    const r = await intentar(() => dep.correr("df", ["-kP"]));
    if (!r) return void a.avisos.push("No se pudieron leer los discos (df).");
    const { sistema, datos, volumenes } = montajesMacRelevantes(filasDf(r.stdout));
    const info = async (montaje: string) => {
        const s = await intentar(() => dep.correr("diskutil", ["info", "-plist", montaje]));
        return s ? infoDeDiskutilPlist(s.stdout) : null;
    };
    const out: VolumenDetectado[] = [];
    if (sistema || datos) {
        // El disco del sistema es «/» + «/System/Volumes/Data» (mismo contenedor APFS): una sola
        // entrada, con el libre real del volumen de datos.
        const base = sistema ?? datos!;
        const fila: FilaDf = { ...base, montaje: "/", totalGb: datos?.totalGb ?? base.totalGb, libreGb: datos?.libreGb ?? base.libreGb };
        // Se pregunta por Data, no por «/»: «/» es la instantánea sellada (solo lectura) y saldría
        // como «no escribible» cuando los modelos se guardan en Data sin problema.
        const i = await info(datos ? "/System/Volumes/Data" : "/");
        const v = volumenMac(fila, i ? { ...i, ...(i.nombre ? { nombre: i.nombre.replace(/ - (Data|Datos)$/, "") } : {}) } : null, dep.home);
        out.push({ ...v, externo: false, conexion: "interna" });
    }
    const externos = await Promise.all(volumenes.map(async (f) => ({ f, i: await info(f.montaje) })));
    for (const { f, i } of externos) {
        // Las imágenes de disco montadas (.dmg) no son discos donde guardar modelos.
        if (i?.protocolo && /disk image/i.test(i.protocolo)) continue;
        out.push(volumenMac(f, i, dep.home));
    }
    a.volumenes = out;
}

async function detectarLinux(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    await Promise.all([
        intentar(() => dep.leer("/etc/os-release")).then((t) => {
            a.so = t ? soDeOsRelease(t) : "Linux";
        }),
        intentar(() => dep.correr("uname", ["-m"])).then((r) => {
            if (r) a.arquitectura = arquitecturaDe(r.stdout);
        }),
        intentar(() => dep.leer("/proc/cpuinfo")).then((t) => {
            if (!t) return;
            const c = cpuDeProcCpuinfo(t);
            if (c.modelo) a.chip = c.modelo;
            if (c.nucleos > 0) a.nucleos = c.nucleos;
            a.simd = c.simd;
        }),
        intentar(() => dep.leer("/proc/meminfo")).then((t) => {
            if (!t) return;
            const m = ramDeMeminfo(t);
            if (m.ramGb) a.ramGb = m.ramGb;
            if (m.ramLibreGb !== undefined) a.ramLibreGb = m.ramLibreGb;
        }),
        volumenesLinux(dep, a),
        intentar(() => dep.correr("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])).then((r) => {
            a.gpus = r ? gpusDeNvidiaSmi(r.stdout) : [];
        }),
        herramienta(dep, a, "swift", "swift", ["--version"]),
        herramienta(dep, a, "python", "python3", ["--version"]),
        herramienta(dep, a, "node", "node", ["--version"]),
        herramienta(dep, a, "cmake", "cmake", ["--version"]),
        herramienta(dep, a, "clang", "clang", ["--version"]),
        buscarEjecutables(dep, a),
        buscarCarpetas(dep, a),
        sondearServidores(dep, a),
    ]);
}

async function volumenesLinux(dep: DependenciasDeteccion, a: Acumulado): Promise<void> {
    const r = await intentar(() =>
        dep.correr("lsblk", ["-J", "-b", "-o", "NAME,MOUNTPOINT,TRAN,ROTA,RM,SIZE,FSAVAIL,FSTYPE,TYPE"]),
    );
    let vols = r ? volumenesDeLsblk(r.stdout, dep.home) : [];
    if (!vols.length) {
        const d = await intentar(() => dep.correr("df", ["-kP"]));
        vols = d ? volumenesLinuxDeDf(d.stdout, dep.home) : [];
    }
    if (!vols.some((v) => v.montaje === "/") && dep.espacio) {
        // En contenedores «/» es un overlay que ni lsblk ni df (/dev/*) enseñan: statfs sí lo mide.
        const e = await intentar(() => dep.espacio!("/"));
        if (e && e.totalBytes > 0) {
            vols.unshift({ montaje: "/", nombre: "Disco del sistema", totalGb: gb(e.totalBytes), libreGb: gb(e.libreBytes), externo: false, tipoDisco: "desconocido", conexion: "interna" });
        }
    }
    if (!vols.length) a.avisos.push("No se pudieron leer los discos (lsblk/df).");
    a.volumenes = vols;
}

const dormir = (ms: number) =>
    new Promise<"plazo">((res) => {
        const t = setTimeout(() => res("plazo"), ms);
        (t as { unref?: () => void }).unref?.();
    });

/** Detección con las dependencias dadas. Nunca lanza; corta en `plazoMs` con lo que haya. */
export async function detectarMaquinaCon(dep: DependenciasDeteccion): Promise<DeteccionMaquina> {
    const a: Acumulado = { herramientas: [], ejecutables: [], carpetas: [], servidores: [], avisos: [] };
    const plazo = dep.plazoMs ?? TOPE_TOTAL_MS;
    try {
        const trabajo =
            dep.plataforma === "darwin"
                ? detectarMac(dep, a)
                : dep.plataforma === "linux"
                  ? detectarLinux(dep, a)
                  : (a.avisos.push(`Detección completa aún no disponible en ${dep.plataforma}: solo CPU y RAM.`), Promise.all([buscarCarpetas(dep, a), sondearServidores(dep, a)]));
        const fin = await Promise.race([trabajo.then(() => "ok" as const, () => "ok" as const), dormir(plazo)]);
        if (fin === "plazo") a.avisos.push(`La detección se cortó a los ${(plazo / 1000).toLocaleString("es-ES")} s: falta lo que no contestó a tiempo.`);
    } catch {
        a.avisos.push("La detección falló a medias: se devuelve lo que se pudo medir.");
    }
    return componer(dep, a);
}

/** Acumulado → `DeteccionMaquina` (copias: lo que llegue tarde no la cambia). */
function componer(dep: DependenciasDeteccion, a: Acumulado): DeteccionMaquina {
    const r = dep.respaldo;
    const so = a.so ?? (dep.plataforma === "darwin" ? "macOS" : dep.plataforma === "linux" ? "Linux" : dep.plataforma);
    const chip = a.chip ?? r.modeloCpu;
    const gpus = a.gpus ?? (a.gpuJson ? gpusDeSystemProfiler(a.gpuJson, { macosMayor: macosMayor(so) }) : []);
    const ramLibreGb = a.ramLibreGb ?? (r.libreBytes > 0 ? Math.round((r.libreBytes / GIB) * 100) / 100 : undefined);
    const npu = dep.plataforma === "darwin" ? npuApple(chip) : undefined;
    const orden = (s: string[]) => [...new Set(s)].sort();
    // Si `node --version` no contestó, vale el Node que sirve esta ruta (es el que corre StarSeed).
    const herramientas = [...a.herramientas];
    if (!herramientas.some((h) => h.startsWith("node-"))) {
        const n = herramientaDe("node", r.versionNode);
        if (n) herramientas.push(n);
    }
    return {
        t: (dep.ahora?.() ?? new Date()).toISOString(),
        host: dep.host.split(".")[0].slice(0, 64),
        so,
        arquitectura: a.arquitectura ?? arquitecturaDe(r.arch),
        ...(chip ? { chip } : {}),
        nucleos: a.nucleos ?? r.nucleos,
        ramGb: a.ramGb ?? gb(r.ramBytes),
        ...(ramLibreGb !== undefined ? { ramLibreGb } : {}),
        gpus: gpus.map((g) => ({ ...g, ...(g.api ? { api: [...g.api] } : {}) })),
        ...(npu ? { npu } : {}),
        volumenes: (a.volumenes ?? []).map((v) => ({ ...v })),
        herramientas: orden(herramientas),
        runtimes: runtimesDe({ ejecutables: a.ejecutables, carpetas: a.carpetas, servidores: a.servidores }),
        servidoresIA: [...a.servidores].sort((x, y) => x.id.localeCompare(y.id)).map((s) => ({ ...s })),
        avisos: a.avisos.map((t) => sinHome(t, dep.home)),
        ...(a.simd ? { simdCpu: [...a.simd] } : {}),
    };
}

/* ───────────────────────────── Dependencias reales ───────────────────────────── */

function dependenciasReales(): DependenciasDeteccion {
    const home = os.homedir();
    // launchd arranca Genesis con un PATH mínimo: sin Homebrew no se verían ollama, cmake ni python.
    const PATH = [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin", `${home}/.local/bin`, "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        .filter(Boolean)
        .join(":");
    const env = { ...process.env, PATH };
    const cpus = os.cpus();
    return {
        plataforma: process.platform,
        home,
        host: os.hostname(),
        correr: (orden, args) =>
            new Promise((res, rej) => {
                execFile(
                    orden,
                    args,
                    { timeout: TOPE_ORDEN_MS, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024, encoding: "utf8", windowsHide: true, env },
                    (error, stdout, stderr) => (error ? rej(error) : res({ stdout: String(stdout), stderr: String(stderr) })),
                );
            }),
        leer: (ruta) => readFile(ruta, "utf8"),
        existe: (ruta) =>
            access(ruta, fsConstantes.R_OK).then(
                () => true,
                () => false,
            ),
        pedir: async (url) => {
            // Defensa en profundidad: esta función solo habla con el bucle local.
            if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) throw new Error("solo bucle local");
            const r = await fetch(url, { signal: AbortSignal.timeout(1_500), cache: "no-store", redirect: "manual" });
            return { status: r.status, cuerpo: (await r.text()).slice(0, 400_000) };
        },
        espacio: async (montaje) => {
            const s = await statfs(montaje);
            return { totalBytes: Number(s.blocks) * Number(s.bsize), libreBytes: Number(s.bavail) * Number(s.bsize) };
        },
        respaldo: {
            arch: os.arch(),
            nucleos: cpus.length || 1,
            ...(cpus[0]?.model ? { modeloCpu: cpus[0].model.replace(/\s+/g, " ").trim().slice(0, 80) } : {}),
            ramBytes: os.totalmem(),
            libreBytes: os.freemem(),
            versionNode: process.version,
        },
    };
}

let cache: { en: number; promesa: Promise<DeteccionMaquina> } | null = null;

/**
 * La máquina por dentro, con caché de 60 s (la misma medición en vuelo se comparte).
 * `{ fresco: true }` mide de nuevo. Nunca lanza.
 */
export async function detectarMaquina(opts: { fresco?: boolean } = {}): Promise<DeteccionMaquina> {
    const ahora = Date.now();
    if (!opts.fresco && cache && ahora - cache.en < CACHE_MS) return cache.promesa;
    const promesa = (async () => {
        try {
            return await detectarMaquinaCon(dependenciasReales());
        } catch {
            const cpus = os.cpus();
            return {
                t: new Date().toISOString(),
                host: os.hostname().split(".")[0].slice(0, 64),
                so: process.platform,
                arquitectura: arquitecturaDe(os.arch()),
                nucleos: cpus.length || 1,
                ramGb: gb(os.totalmem()),
                gpus: [],
                volumenes: [],
                herramientas: [],
                runtimes: [],
                servidoresIA: [],
                avisos: ["La detección no pudo arrancar: solo CPU y RAM de Node."],
            } satisfies DeteccionMaquina;
        }
    })();
    cache = { en: ahora, promesa };
    return promesa;
}

/** Solo pruebas: olvida la caché. */
export function _olvidarCacheDeteccion(): void {
    cache = null;
}
