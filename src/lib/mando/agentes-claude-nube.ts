/**
 * (2026-10-22, ALT1022C) Las sesiones de Claude Code en la nube como agentes del medidor «Agentes».
 *
 * Alex: «¿por qué solo hay 6 agentes y no se agregan solos más simultáneos en más medios, como
 * el contenedor de Claude de los créditos disponibles?». El crédito de sesiones en la nube solo lo
 * gastan esas sesiones y no toca el límite semanal (`memory/orquestacion-economica.md` §0, 4a).
 * El lanzador (`scripts/puente/alta-capacidad-nube.py`) anota cada sesión en
 * `~/.starseed/alta-capacidad-nube.json`; aquí solo se lee.
 *
 * Honestidad («basta de ilusiones»): una sesión es UN agente solo mientras está viva, y está viva
 * mientras su tarea siga `reasignada` con `medio: claude-nube` en `progreso.json`. Una sesión ya
 * traída a main, fallida o sin registro no se pinta. Módulo puro: lo importa código de cliente.
 */

export const DONDE_CLAUDE_NUBE = "claude-nube";

export const TEXTO_CLAUDE_NUBE = "sesión de Claude Code en la nube (crédito incluido, no toca el límite semanal)";

/** Estados del registro que dicen que la sesión ya terminó, aunque el progreso aún no lo sepa. */
const CERRADAS = /^(terminada|traida|traída|devuelta|integrada|fallida|cancelada|archivada|hecha)$/i;

/** Una entrada de `~/.starseed/alta-capacidad-nube.json`, tal como la escribe el lanzador. */
export interface SesionClaudeNube {
    tarea?: unknown;
    sesion?: unknown;
    url?: unknown;
    rama_pedida?: unknown;
    modelo?: unknown;
    coste_usd?: unknown;
    t?: unknown;
    estado?: unknown;
    /** Lo que escribe `seguir` al cerrarla: «traida» o «devuelta». */
    final?: unknown;
}

/** El latido de una sesión viva, con la forma de los del medidor. */
export interface AgenteClaudeNube {
    tarea: string;
    fase: string;
    modelo: string;
    minutos: number;
    donde: string;
    url?: string;
    sesion?: string;
}

/** PURA. `t` en ms: acepta segundos o milisegundos de época, o una fecha ISO. NaN si no se lee. */
export function instanteDe(t: unknown): number {
    if (typeof t === "number" && Number.isFinite(t)) return t < 1e12 ? t * 1000 : t;
    if (typeof t === "string" && t.trim()) {
        const n = Number(t);
        if (Number.isFinite(n)) return instanteDe(n);
        return Date.parse(t);
    }
    return Number.NaN;
}

/** PURA. ¿La tarea sigue en manos de una sesión de Claude en la nube según el progreso? */
export function tareaEnClaudeNube(entrada: { estado?: unknown; medio?: unknown } | undefined): boolean {
    return String(entrada?.estado ?? "") === "reasignada" && String(entrada?.medio ?? "") === DONDE_CLAUDE_NUBE;
}

/**
 * PURA. Del registro del lanzador y el progreso a un latido por sesión VIVA. Si una tarea tiene
 * varias sesiones anotadas (un relanzamiento), cuenta la más reciente: una tarea, un agente.
 */
export function agentesDeClaudeNube(
    registro: { sesiones?: unknown } | null | undefined,
    progreso: Readonly<Record<string, { estado?: unknown; medio?: unknown } | undefined>>,
    ahoraMs: number = Date.now(),
): AgenteClaudeNube[] {
    const sesiones = Array.isArray(registro?.sesiones) ? (registro.sesiones as SesionClaudeNube[]) : [];
    const porTarea = new Map<string, { s: SesionClaudeNube; t: number }>();
    for (const s of sesiones) {
        if (!s || typeof s !== "object") continue;
        const tarea = typeof s.tarea === "string" ? s.tarea.trim() : "";
        if (!tarea || !tareaEnClaudeNube(progreso[tarea])) continue;
        if (typeof s.estado === "string" && CERRADAS.test(s.estado.trim())) continue;
        // (2026-10-23) El lanzador cierra con `final`, no con `estado`: AV1011F salió 22 h
        // «escribiendo» con su sesión ya traída porque la tarea seguía prestada en el progreso.
        if (typeof s.final === "string" && s.final.trim()) continue;
        const t = instanteDe(s.t);
        const previo = porTarea.get(tarea);
        if (!previo || (Number.isFinite(t) && !(t <= previo.t))) porTarea.set(tarea, { s, t });
    }
    return [...porTarea.entries()].map(([tarea, { s, t }]) => ({
        tarea,
        fase: "escribiendo",
        modelo: typeof s.modelo === "string" && s.modelo.trim() ? s.modelo.trim() : "claude",
        minutos: Number.isFinite(t) ? Math.max(0, Math.floor((ahoraMs - t) / 60_000)) : 0,
        donde: DONDE_CLAUDE_NUBE,
        ...(typeof s.url === "string" && s.url ? { url: s.url } : {}),
        ...(typeof s.sesion === "string" && s.sesion ? { sesion: s.sesion } : {}),
    }));
}
