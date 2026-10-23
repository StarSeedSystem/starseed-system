/**
 * Memoria y disco para los medidores «memoria» y «disco» de Genesis (2026-10-23).
 *
 * Los dos paneles salían «sin dato» desde siempre: `reunir()` (api/mando/medidores) nunca
 * rellenaba `disco` ni `memoria`, así que al abrirlos no había cifra y el comprobador solo
 * podía cotejar contra la Mac, no contra lo que Genesis enseñaba.
 *
 * «Libre» en macOS = páginas libres + inactivas + especulativas: lo que el sistema puede dar
 * ya sin escribir a swap, igual que `MemAvailable` en Linux (que ya se usaba allí). Contar solo
 * las «free» daba ~140 MB con la Mac en presión normal (25 % libre según `memory_pressure`), el
 * comprobador decía «RAM baja» y los directores «reparaban» cada 10 min una memoria que no
 * estaba mal. La misma regla vive en `comprobar_medidor.py` (`medir_memoria`).
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const correr = promisify(execFile);

export interface MemoriaMedidor {
    /** Lo que el sistema puede dar sin tirar de swap (MB). */
    libreMb: number;
    /** Swap en uso (MB). */
    swapMb: number;
}

const CAMPOS_DISPONIBLES = ["Pages free", "Pages inactive", "Pages speculative"] as const;

/** MB disponibles según `vm_stat` (libres + inactivas + especulativas). PURA; `null` si no se lee. */
export function disponibleDeVmStat(texto: string): number | null {
    const pag = /page size of\s+(\d+)/i.exec(texto);
    if (!pag) return null;
    const bytes = Number(pag[1]);
    let paginas = 0;
    let alguna = false;
    for (const campo of CAMPOS_DISPONIBLES) {
        const m = new RegExp(`${campo}:\\s*([\\d,]+)`).exec(texto);
        if (!m) continue;
        paginas += Number(m[1].replace(/,/g, ""));
        alguna = true;
    }
    return alguna && Number.isFinite(paginas) ? Math.round((paginas * bytes) / 1_048_576) : null;
}

/** Swap usado según `sysctl -n vm.swapusage` («used = 3821.31M»). PURA. */
export function swapUsadoMb(texto: string): number | null {
    const m = /used\s*=\s*([\d.]+)\s*([KMG])/i.exec(texto);
    if (!m) return null;
    const factor = { K: 1 / 1024, M: 1, G: 1024 }[m[2].toUpperCase() as "K" | "M" | "G"];
    const mb = Number(m[1]) * factor;
    return Number.isFinite(mb) ? Math.round(mb) : null;
}

/** Memoria según `/proc/meminfo` (Linux). PURA. */
export function memoriaDeMeminfo(texto: string): MemoriaMedidor | null {
    const kb = (campo: string): number | null => {
        const m = new RegExp(`^${campo}:\\s*(\\d+)`, "m").exec(texto);
        return m ? Number(m[1]) : null;
    };
    const disponible = kb("MemAvailable");
    if (disponible === null) return null;
    const total = kb("SwapTotal") ?? 0;
    const libre = kb("SwapFree") ?? total;
    return { libreMb: Math.round(disponible / 1024), swapMb: Math.max(0, Math.round((total - libre) / 1024)) };
}

/** `disco` del medidor a partir de `medirDisco()` (MB → GB con un decimal). PURA. */
export function discoParaMedidor(
    d: { libreMb: number; usadoPct: number } | null | undefined,
): { libreGb: number; usadoPct: number } | undefined {
    if (!d || !Number.isFinite(d.libreMb)) return undefined;
    return { libreGb: Math.round((d.libreMb / 1024) * 10) / 10, usadoPct: d.usadoPct };
}

/** Mide la memoria de esta máquina para el medidor. Tolerante: `undefined` si no hay dato. */
export async function medirMemoriaMedidor(): Promise<MemoriaMedidor | undefined> {
    try {
        if (process.platform === "darwin") {
            const [vm, sw] = await Promise.all([
                correr("vm_stat", [], { timeout: 3_000 }),
                correr("sysctl", ["-n", "vm.swapusage"], { timeout: 3_000 }).catch(() => ({ stdout: "" })),
            ]);
            const libre = disponibleDeVmStat(String(vm.stdout));
            return libre === null ? undefined : { libreMb: libre, swapMb: swapUsadoMb(String(sw.stdout)) ?? 0 };
        }
        if (process.platform === "linux") {
            return memoriaDeMeminfo(await readFile("/proc/meminfo", "utf8")) ?? undefined;
        }
    } catch {
        // sin vm_stat ni /proc/meminfo: el panel dice «sin dato», nunca una cifra inventada
    }
    return undefined;
}
