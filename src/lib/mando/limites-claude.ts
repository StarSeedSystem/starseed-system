/**
 * Límites del plan de Claude (Ola 1004L) — PURO: sin disco, sin red, sin reloj propio.
 *
 * Sustituye al «Crédito de Claude en la nube» en «Consumo y créditos» del Mando: muestra
 * lo que queda de los LÍMITES DEL PLAN (ventana de sesión, ~5 h; semanal de todos los
 * modelos; y la semanal de un modelo concreto si claude.ai la enseña). No hay API: la
 * dirección lee claude.ai → Ajustes → Uso y lo guarda con
 * `scripts/puente/limites_claude.py declarar …` en `~/.starseed/limites-claude.json`.
 * Aquí solo se calcula lo que se deriva: coste por revisión (mediana de aumentos entre
 * lecturas consecutivas de la misma ventana), proyección al reinicio y los tonos.
 * Mismas reglas exactas que el CLI de Python.
 */

export const ENLACE_USO_CLAUDE = "https://claude.ai/settings/usage";

export interface LecturaLimites {
    t: string;
    sesion_pct: number;
    sesion_reinicio: string;
    semana_pct: number;
    semana_reinicio: string;
    modelo_nombre: string | null;
    modelo_pct: number | null;
    modelo_reinicio: string | null;
    fuente: string;
}

export interface ProgramadaClaude {
    nombre: string;
    /** ISO con zona. */
    proxima: string;
    cada_min: number | null;
}

export interface ConfigLimitesClaude {
    lecturas?: LecturaLimites[];
    programadas?: { t?: string; lista?: ProgramadaClaude[] };
    umbral_pct?: number;
}

export type TonoLimites = "ok" | "aviso" | "peligro";
export type CampoLimite = "sesion" | "semana" | "modelo";

export interface VentanaClaude {
    pct: number | null;
    queda: number | null;
    reinicio: string | null;
    minutosParaReinicio: number | null;
    coste: number | null;
    proyeccion: number | null;
    reiniciada: boolean;
    tono: TonoLimites;
}

export interface EstadoLimitesClaude {
    sesion: VentanaClaude | null;
    semana: VentanaClaude | null;
    modelo: VentanaClaude | null;
    modeloNombre: string | null;
    lecturaEn: string | null;
    lecturaHaceMin: number | null;
    desactualizada: boolean;
    programadasEnSesion: number;
    programadasEnSemana: number;
    recomendacion: string | null;
    tono: TonoLimites;
}

const MINUTO_MS = 60_000;
const MINUTOS_DESACTUALIZADA = 120;
const CAMPOS: CampoLimite[] = ["sesion", "semana", "modelo"];

function num(x: unknown): number | null {
    return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function texto(x: unknown): string | null {
    return typeof x === "string" && x ? x : null;
}

function ms(iso: string | null): number | null {
    if (!iso) return null;
    const v = Date.parse(iso);
    return Number.isFinite(v) ? v : null;
}
