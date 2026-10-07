/**
 * Sueños profundos · lector y acciones de Genesis (2026-09-29 · SOLO servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee del disco de ESTA máquina (nada de Supabase: el panel no gasta cuota del bus):
 *   · starseed_memory_root/dream/profundo/<fecha>/plan.json            el plan
 *   · starseed_memory_root/dream/profundo/<fecha>/<área>--<lente>.json un informe por sueño
 *   · starseed_memory_root/dream/profundo/<fecha>/verificaciones.jsonl los veredictos de Claude
 *   · starseed_memory_root/dream/profundo/<fecha>/consolidado.json     el ranking del director
 *   · starseed_memory_root/olas/progreso.json y latidos-*.json         qué se está soñando ahora
 * y lanza/consolida por la MISMA terminal que usan los supervisores Claude
 * (`python3 scripts/puente/suenos.py …`), para que no haya dos maneras de hacer lo mismo.
 *
 * ⚠️ Nunca devuelve claves ni rutas absolutas: solo rutas relativas del repo.
 */

import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { enjambreEnMarcha } from "@/lib/mando/lector-local";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    LENTES_SUENOS,
    PATRON_SESION,
    areasSuenos,
    consolidadoDe,
    contarEstados,
    filasDeSesion,
    leerVeredictos,
    type DatosSuenos,
    type PeticionLanzar,
    type SesionSuenos,
} from "@/lib/mando/suenos-tipos";

export * from "@/lib/mando/suenos-tipos";

const LATIDO_FRESCO_MS = 3 * 60 * 1000;
const TOPE_INFORME_MD = 300 * 1024;

function rutas(raiz = raizDelProyecto()) {
    const mem = path.join(raiz, "starseed_memory_root");
    return { raiz, profundo: path.join(mem, "dream", "profundo"), olas: path.join(mem, "olas") };
}

async function json(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Fechas de las sesiones de sueños, de la más antigua a la más nueva. */
export async function leerSesiones(): Promise<string[]> {
    try {
        return (await readdir(rutas().profundo)).filter((n) => PATRON_SESION.test(n)).sort();
    } catch {
        return [];
    }
}

async function latidosFrescos(dirOlas: string, ahoraMs: number): Promise<Record<string, unknown>> {
    const fuera: Record<string, unknown> = {};
    let nombres: string[] = [];
    try {
        nombres = (await readdir(dirOlas)).filter((n) => n.startsWith("latidos-") && n.endsWith(".json") && !n.startsWith("latidos-externo-"));
    } catch {
        return fuera;
    }
    for (const n of nombres) {
        try {
            if (ahoraMs - (await stat(path.join(dirOlas, n))).mtimeMs > LATIDO_FRESCO_MS) continue;
        } catch {
            continue;
        }
        for (const [tid, lat] of Object.entries(objeto(objeto(await json(path.join(dirOlas, n))).tareas))) {
            const f = objeto(lat).fase;
            if (typeof f === "string" && f && f !== "hecho") fuera[tid] = lat;
        }
    }
    return fuera;
}

/** Todo lo de una sesión (la más reciente si no se dice). `conInforme` añade INFORME.md. */
export async function leerSesion(fecha?: string, conInforme = false, ahoraMs = Date.now()): Promise<SesionSuenos | null> {
    const r = rutas();
    const sesiones = await leerSesiones();
    const sesion = fecha && PATRON_SESION.test(fecha) ? fecha : sesiones[sesiones.length - 1];
    if (!sesion) return null;
    const dir = path.join(r.profundo, sesion);
    const plan = objeto(await json(path.join(dir, "plan.json")));
    let tareas = Array.isArray(plan.tareas) ? (plan.tareas as unknown[]) : [];
    if (!tareas.length) {
        const cola = await json(path.join(r.olas, `cola-suenos-${sesion}.json`));
        tareas = Array.isArray(cola) ? cola : Array.isArray(objeto(cola).tareas) ? (objeto(cola).tareas as unknown[]) : [];
    }
    const informes: Record<string, unknown> = {};
    let nombres: string[] = [];
    try {
        nombres = await readdir(dir);
    } catch {
        nombres = [];
    }
    for (const n of nombres.filter((x) => x.endsWith(".json") && x.includes("--"))) {
        const d = objeto(await json(path.join(dir, n)));
        if (typeof d.id === "string" && Array.isArray(d.hallazgos)) informes[d.id] = d;
    }
    let verificaciones = "";
    try {
        verificaciones = await readFile(path.join(dir, "verificaciones.jsonl"), "utf-8");
    } catch {
        verificaciones = "";
    }
    const [progreso, latidos, vivo] = await Promise.all([
        json(path.join(r.olas, "progreso.json")),
        latidosFrescos(r.olas, ahoraMs),
        enjambreEnMarcha(),
    ]);
    const filas = filasDeSesion({
        tareas,
        informes,
        veredictos: leerVeredictos(verificaciones),
        progreso: objeto(progreso),
        latidos,
        orquestadorVivo: vivo,
        ahoraMs,
    });
    const propuestaCruda = await json(path.join(r.olas, `cola-suenos-propuesta-${sesion}.json`));
    const propuesta = Array.isArray(propuestaCruda) ? { nombre: `suenos-propuesta-${sesion}`, tareas: propuestaCruda.length } : null;
    let informeMd: string | null = null;
    const informeFinal = nombres.includes("INFORME.md");
    if (conInforme && informeFinal) {
        try {
            informeMd = (await readFile(path.join(dir, "INFORME.md"), "utf-8")).slice(0, TOPE_INFORME_MD);
        } catch {
            informeMd = null;
        }
    }
    const lanz = Array.isArray(plan.lanzamientos) ? objeto((plan.lanzamientos as unknown[]).slice(-1)[0]) : {};
    return {
        sesion,
        total: filas.length,
        cuentas: contarEstados(filas),
        filas,
        tokens: filas.reduce((a, f) => a + f.tokens, 0),
        completa: filas.length > 0 && filas.every((f) => ["verificado", "ajustado", "rechazado"].includes(f.estado)),
        orquestadorVivo: vivo,
        informeFinal,
        informeMd,
        propuesta,
        consolidado: consolidadoDe(await json(path.join(dir, "consolidado.json"))),
        ultimoLanzamiento: typeof lanz.t === "string"
            ? { t: lanz.t, horas: typeof lanz.horas === "number" ? lanz.horas : 0, por: typeof lanz.por === "string" ? lanz.por : "" }
            : null,
    };
}

/** GET /api/mando/suenos */
export async function leerDatosSuenos(fecha?: string, conInforme = false): Promise<DatosSuenos> {
    const [sesiones, sesion] = await Promise.all([leerSesiones(), leerSesion(fecha, conInforme)]);
    return { sesiones, sesion, areas: areasSuenos(), lentes: LENTES_SUENOS.map((l) => ({ id: l.id, nombre: l.nombre })) };
}

// ─────────────────────────────── acciones (por la terminal de siempre) ───────────────────────────────

/** Quita del texto la carpeta personal y la raíz del repo: Genesis no enseña rutas del disco. */
export function sinRutas(texto: string, raiz = raizDelProyecto(), casa = homedir()): string {
    let t = texto;
    if (raiz && raiz.length > 1) t = t.split(raiz).join(".");
    if (casa && casa.length > 1) t = t.split(casa).join("~");
    return t;
}

async function suenosPy(args: string[], timeoutMs: number): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
    const raiz = raizDelProyecto();
    const guion = path.join(raiz, "scripts", "puente", "suenos.py");
    return new Promise((resolver) => {
        execFile(
            "python3",
            [guion, ...args, "--json"],
            {
                cwd: raiz,
                timeout: timeoutMs,
                maxBuffer: 8 * 1024 * 1024,
                env: { ...process.env, STARSEED_ROOT: raiz, STARSEED_MEDIO: "mando" },
            },
            (error, stdout, stderr) => {
                let datos: Record<string, unknown> = {};
                try {
                    datos = objeto(JSON.parse(stdout || "{}"));
                } catch {
                    datos = { error: sinRutas(((stderr || stdout || String(error ?? "")) as string).trim().slice(-600)) || "suenos.py no devolvió JSON." };
                }
                if (typeof datos.error === "string") datos.error = sinRutas(datos.error);
                resolver({ ok: !error && datos.ok !== false, datos });
            },
        );
    });
}

/**
 * Lanza una sesión de sueños. Siempre `--directo`: aquí YA estamos en Genesis, así que
 * suenos.py no debe volver a pedírselo por HTTP; decide igual la regla de UN orquestador
 * (tanda viva que sabe soñar → se le añaden las tareas; una vieja → no se lanza otro).
 */
export async function lanzarSuenos(p: PeticionLanzar): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
    const args = ["lanzar", "--horas", String(p.horas), "--directo", "--por", "mando"];
    if (p.areas.length) args.push("--areas", p.areas.join(","));
    if (p.lentes.length) args.push("--lentes", p.lentes.join(","));
    return suenosPy(args, 120_000);
}

/** Consolida la sesión (INFORME.md + cola propuesta). Telegram solo si la sesión está completa. */
export async function consolidarSuenos(fecha?: string): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
    const args = ["consolidar"];
    if (fecha && PATRON_SESION.test(fecha)) args.push("--fecha", fecha);
    return suenosPy(args, 90_000);
}
