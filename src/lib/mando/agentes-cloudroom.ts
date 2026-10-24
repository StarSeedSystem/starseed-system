/**
 * (2026-10-24) Los hilos de la nube de Cloudroom como agentes de los medidores «Agentes» y «Tareas en curso».
 *
 * Alex: «ningún agente de MetaGenesis dice ser de los de Cloudroom». El lanzador de MetaGenesis
 * (`scripts/puente/cloudroom_lanzar.py`, CRM1024Eb/J) anota cada hilo en `~/.starseed/cloudroom-hilos.json`
 * (una fila por hilo: tarea, hilo, t, harness, modelo, rama_pedida y, al cerrarlo, `final`) y marca la tarea
 * `reasignada` con `medio: cloudroom` en `progreso.json`. Aquí solo se lee.
 *
 * Honestidad («basta de ilusiones»): un hilo es UN agente solo mientras está vivo: su fila no tiene `final`
 * y su tarea sigue `reasignada` con `medio: cloudroom`. Y no se pinta «escribiendo» a ciegas (CRM1024K): si la
 * última pasada de `seguir` lo vio parado (`visto`), va como parado y con su porqué (cupo, modelo, terminado). Un hilo ya traído a main, devuelto o sin registro no
 * se pinta. Si una tarea tiene varios hilos (un relanzamiento), cuenta el más reciente. Módulo puro: lo
 * importa código de cliente (sin `node:*`).
 */

import { instanteDe } from "./agentes-claude-nube";

export const DONDE_CLOUDROOM = "cloudroom";

export const TEXTO_CLOUDROOM = "hilo de la nube de Cloudroom (cupo de la cuenta: 100 agentes cada 30 días)";

/** Una fila de `~/.starseed/cloudroom-hilos.json`, tal como la escribe el lanzador. */
export interface HiloCloudroom {
    tarea?: unknown;
    hilo?: unknown;
    t?: unknown;
    harness?: unknown;
    modelo?: unknown;
    rama_pedida?: unknown;
    /** Lo que escribe `seguir` al cerrarlo: «traida», «devuelta», «parche», «medio», «olvidada»… */
    final?: unknown;
    /** (CRM1024K) Lo que `seguir` vio del hilo en su última pasada: {estado, t, corte}. */
    visto?: unknown;
    /** (CRM1024K) Veces que `seguir` lo reanudó con `thread tell`. */
    reanudaciones?: unknown;
}

/** El latido de un hilo vivo, con la forma de los del medidor. */
export interface AgenteCloudroom {
    tarea: string;
    fase: string;
    modelo: string;
    minutos: number;
    donde: string;
    hilo?: string;
    rama?: string;
    /** «cupo» | «modelo» | «terminado» si la última pasada de `seguir` lo vio parado. */
    parado?: string;
    reanudaciones?: number;
}

/** (CRM1024K) Un «visto» más viejo que esto no dice nada del hilo de ahora (seguir pasa cada ~10 min). */
export const VISTO_VIGENTE_MS = 45 * 60_000;

/** PURA. «cupo» | «modelo» | «terminado» si `seguir` vio el hilo parado hace poco; "" si trabaja o no se sabe. */
export function paradoDe(visto: unknown, ahoraMs: number): string {
    if (!visto || typeof visto !== "object") return "";
    const v = visto as { estado?: unknown; t?: unknown; corte?: unknown };
    const t = instanteDe(v.t);
    if (v.estado !== "terminado" || !Number.isFinite(t) || ahoraMs - t > VISTO_VIGENTE_MS) return "";
    return v.corte === "cupo" || v.corte === "modelo" ? v.corte : "terminado";
}

/** PURA. ¿La tarea sigue en manos de un hilo de Cloudroom según el progreso? */
export function tareaEnCloudroom(entrada: { estado?: unknown; medio?: unknown } | undefined): boolean {
    return String(entrada?.estado ?? "") === "reasignada" && String(entrada?.medio ?? "") === DONDE_CLOUDROOM;
}

/** PURA. Las filas del registro: acepta la lista (formato actual) o `{hilos: [...]}` (el del piloto). */
export function filasCloudroom(registro: unknown): HiloCloudroom[] {
    const lista = Array.isArray(registro)
        ? registro
        : registro && typeof registro === "object" && Array.isArray((registro as { hilos?: unknown }).hilos)
          ? ((registro as { hilos: unknown[] }).hilos)
          : [];
    return lista.filter((f): f is HiloCloudroom => !!f && typeof f === "object");
}

/** PURA. Del registro del lanzador y el progreso a un latido por hilo VIVO. */
export function agentesDeCloudroom(
    registro: unknown,
    progreso: Readonly<Record<string, { estado?: unknown; medio?: unknown } | undefined>>,
    ahoraMs: number = Date.now(),
): AgenteCloudroom[] {
    const porTarea = new Map<string, { f: HiloCloudroom; t: number }>();
    for (const f of filasCloudroom(registro)) {
        const tarea = typeof f.tarea === "string" ? f.tarea.trim() : "";
        if (!tarea || !tareaEnCloudroom(progreso[tarea])) continue;
        if (f.final !== undefined && f.final !== null && String(f.final).trim()) continue;
        const t = instanteDe(f.t);
        const previo = porTarea.get(tarea);
        if (!previo || (Number.isFinite(t) && !(t <= previo.t))) porTarea.set(tarea, { f, t });
    }
    return [...porTarea.entries()].map(([tarea, { f, t }]) => {
        const harness = typeof f.harness === "string" && f.harness.trim() ? f.harness.trim() : "";
        const modelo = typeof f.modelo === "string" && f.modelo.trim() ? f.modelo.trim() : "";
        const parado = paradoDe(f.visto, ahoraMs);
        const veces = typeof f.reanudaciones === "number" && f.reanudaciones > 0 ? Math.floor(f.reanudaciones) : 0;
        return {
            tarea,
            fase: parado ? "parado" : "escribiendo",
            modelo: [harness, modelo].filter(Boolean).join("/") || "cloudroom",
            minutos: Number.isFinite(t) ? Math.max(0, Math.floor((ahoraMs - t) / 60_000)) : 0,
            donde: DONDE_CLOUDROOM,
            ...(typeof f.hilo === "string" && f.hilo ? { hilo: f.hilo } : {}),
            ...(typeof f.rama_pedida === "string" && f.rama_pedida ? { rama: f.rama_pedida } : {}),
            ...(parado ? { parado } : {}),
            ...(veces ? { reanudaciones: veces } : {}),
        };
    });
}
