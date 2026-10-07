/**
 * PROCESOS DEL ORQUESTADOR (2026-10-03) — solo servidor
 * ─────────────────────────────────────────────────────────────────────────────
 * Aprobar, rechazar, detener y reintentar desde Genesis preguntaban con
 * `pgrep -af starseed-enjambre.py` y buscaban la cola en cada línea. En Linux
 * `-a` imprime la orden entera; en **macOS `-a` significa «incluye ancestros» y
 * pgrep solo imprime PIDs**. Así que en la Mac de Alex ninguna línea traía
 * `cola-<nombre>.json`, `orquestadorAqui()` decía siempre «no hay orquestador» y
 * el botón «Aprobar e integrar» contestaba que la rama había quedado pendiente
 * con el orquestador vivo esperando la orden.
 *
 * Aquí se lee `ps -axo pid=,args=` (igual en las dos plataformas) y se filtra en
 * JavaScript. Nunca `pgrep -l/-fl` ni `ps -E`: imprimen el entorno, con secretos.
 * Y solo cuenta como orquestador una orden que EMPIEZA por python ejecutando el
 * script: el prompt de un agente que nombra `starseed-enjambre.py` no lo es.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProcesoOrquestador {
    pid: number;
    /** `cola-….json` que corre (solo el nombre del archivo), o "" si no se ve. */
    cola: string;
    /** Orden completa del proceso: NO sale nunca hacia el cliente. */
    args: string;
}

const PATRON_ORQUESTADOR = /^[^ ]*[Pp]ython[0-9.]*( +-[A-Za-z]+)* +[^ ]*starseed-enjambre\.py( |$)/;

/** PURA: orquestadores a partir de la salida de `ps -axo pid=,args=`. */
export function parsearOrquestadores(salidaPs: string): ProcesoOrquestador[] {
    const fuera: ProcesoOrquestador[] = [];
    for (const linea of (salidaPs ?? "").split("\n")) {
        const m = /^\s*(\d+)\s+(.*)$/.exec(linea);
        if (!m) continue;
        const pid = Number.parseInt(m[1] ?? "", 10);
        const args = (m[2] ?? "").trim();
        if (!Number.isFinite(pid) || pid <= 1 || !PATRON_ORQUESTADOR.test(args)) continue;
        const cola =
            args
                .split(/\s+/)
                .map((t) => t.split("/").pop() ?? "")
                .find((t) => t.startsWith("cola-") && t.endsWith(".json")) ?? "";
        fuera.push({ pid, cola, args });
    }
    return fuera;
}

/** PURA: los orquestadores que corren exactamente `cola-<nombre>.json`. */
export function orquestadoresDeCola(procesos: ProcesoOrquestador[], nombre: string): ProcesoOrquestador[] {
    const buscada = `cola-${nombre}.json`;
    return procesos.filter((p) => p.cola === buscada);
}

/** Orquestadores vivos en esta máquina. Si `ps` falla, lista vacía (nunca lanza). */
export async function orquestadoresVivos(): Promise<ProcesoOrquestador[]> {
    try {
        const { stdout } = await execFileAsync("ps", ["-axo", "pid=,args="], {
            timeout: 5000,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
        });
        return parsearOrquestadores(stdout);
    } catch {
        return [];
    }
}
