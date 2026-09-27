/**
 * Crédito de Claude en la nube (2026-09-27) — PURO: sin disco, sin red, sin reloj propio.
 *
 * Alex tiene «Créditos de sesiones en la nube» en claude.ai → Ajustes → Uso: se aplican
 * solos a las sesiones de Claude en la nube y, al usarse o VENCER, vuelve el uso normal del
 * plan. No hay API para leer el saldo, así que la fuente es lo que Alex DECLARA (con su
 * fecha) en `~/.starseed/credito-claude-nube.json` (lo escribe
 * `scripts/puente/credito_claude_nube.py declarar`). Aquí solo se calcula lo que se deriva
 * de esa declaración: días hasta que vence, ritmo ideal para aprovecharlo sin agotarlo
 * antes de tiempo, y los avisos. Un crédito que vence y no se usa es crédito perdido: por
 * eso el medidor dice también «úsalo», no solo «cuídalo».
 */

export const ENLACE_USO_CLAUDE = "https://claude.ai/settings/usage";

/** Lo que una sesión en la nube deja anotado de su propio consumo (solo tokens). */
export interface SesionNube {
    sesion: string;
    t: string;
    modelo: string;
    salida: number;
    cacheLectura: number;
    cacheEscritura: number;
}

export interface ConfigCreditoClaude {
    total_usd: number;
    restante_usd: number;
    /** ISO con zona: «2026-11-05T01:59:00-06:00». */
    vence: string;
    declarado_en: string;
    semanal?: { todos?: number; fable?: number; reinicio?: string };
    sesiones?: SesionNube[];
}

export type TonoCredito = "ok" | "normal" | "aviso" | "peligro";

export interface EstadoCreditoClaude {
    total: number;
    restante: number;
    /** 0-1 de lo que QUEDA. */
    fraccion: number;
    vence: string;
    /** Días (redondeados hacia arriba) hasta que vence; 0 si ya venció. */
    dias: number;
    /** Gasto diario que lo aprovecha entero justo antes de vencer. */
    ritmoIdeal: number;
    declaradoHaceDias: number;
    semanal: ConfigCreditoClaude["semanal"] | null;
    sesiones: SesionNube[];
    avisos: string[];
    tono: TonoCredito;
}

const DIA_MS = 86_400_000;
/** Una sesión que relee más que esto de caché gasta por contexto largo, no por trabajo. */
export const CACHE_SESION_LARGA = 200_000_000;

function num(x: unknown, porDefecto = 0): number {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : porDefecto;
}

export function estadoCreditoClaude(cfg: ConfigCreditoClaude, ahora: number): EstadoCreditoClaude {
    const total = Math.max(0, num(cfg.total_usd, 250));
    const restante = Math.max(0, Math.min(total || Infinity, num(cfg.restante_usd, total)));
    const fraccion = total > 0 ? restante / total : 0;
    const venceMs = Date.parse(cfg.vence);
    const faltaMs = Number.isFinite(venceMs) ? venceMs - ahora : NaN;
    const dias = Number.isFinite(faltaMs) ? Math.max(0, Math.ceil(faltaMs / DIA_MS)) : 0;
    const ritmoIdeal = dias > 0 ? restante / dias : 0;
    const declaradoMs = Date.parse(cfg.declarado_en);
    const declaradoHaceDias = Number.isFinite(declaradoMs) ? Math.max(0, (ahora - declaradoMs) / DIA_MS) : Infinity;
    const sesiones = Array.isArray(cfg.sesiones) ? cfg.sesiones : [];

    const avisos: string[] = [];
    let tono: TonoCredito = "ok";
    const subir = (t: TonoCredito) => {
        const orden: TonoCredito[] = ["ok", "normal", "aviso", "peligro"];
        if (orden.indexOf(t) > orden.indexOf(tono)) tono = t;
    };

    if (!Number.isFinite(faltaMs)) {
        avisos.push("Sin fecha de vencimiento declarada.");
        subir("aviso");
    } else if (faltaMs <= 0) {
        avisos.push("Vencido: ya se aplica el uso normal del plan.");
        subir("peligro");
    } else if (dias <= 3) {
        avisos.push(`Vence en ${dias} día(s).`);
        subir("peligro");
    } else if (dias < 14 && fraccion > 0.5) {
        avisos.push(`Úsalo o se pierde: quedan ${dias} días y más de la mitad del crédito.`);
        subir("aviso");
    }
    if (total > 0 && restante === 0) {
        avisos.push("Agotado: ya se aplica el uso normal del plan.");
        subir("peligro");
    } else if (fraccion < 0.1) {
        avisos.push("Casi agotado (menos del 10 %).");
        subir("peligro");
    } else if (fraccion < 0.25) {
        avisos.push("Cuida el crédito: queda menos del 25 %.");
        subir("aviso");
    }
    if (declaradoHaceDias > 3) {
        avisos.push("Saldo declarado hace más de 3 días: míralo en claude.ai → Ajustes → Uso y actualízalo.");
        subir("aviso");
    }
    if (num(cfg.semanal?.todos) >= 80) {
        avisos.push(`Límite semanal del plan al ${num(cfg.semanal?.todos)} %.`);
        subir("aviso");
    }
    for (const s of sesiones) {
        if (num(s.cacheLectura) > CACHE_SESION_LARGA) {
            avisos.push(`La sesión ${s.sesion.slice(0, 8)} releyó ${Math.round(num(s.cacheLectura) / 1e6)} M tokens de caché: relevo y sesión nueva.`);
            subir("aviso");
        }
    }

    return {
        total,
        restante,
        fraccion,
        vence: cfg.vence,
        dias,
        ritmoIdeal,
        declaradoHaceDias,
        semanal: cfg.semanal ?? null,
        sesiones,
        avisos,
        tono,
    };
}

/** «$250 de $250 · vence en 39 días (5 nov) · ≤ $6.41/día · declarado hoy». */
export function resumenCreditoClaude(e: EstadoCreditoClaude): string {
    const fecha = Number.isFinite(Date.parse(e.vence))
        ? new Date(e.vence).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" })
        : "sin fecha";
    const declarado =
        !Number.isFinite(e.declaradoHaceDias) ? "sin declarar"
        : e.declaradoHaceDias < 1 ? "declarado hoy"
        : `declarado hace ${Math.floor(e.declaradoHaceDias)} día(s)`;
    const partes = [
        `$${redondear(e.restante)} de $${redondear(e.total)}`,
        e.dias > 0 ? `vence en ${e.dias} días (${fecha})` : "vencido",
    ];
    if (e.dias > 0) partes.push(`ritmo ideal ≤ $${e.ritmoIdeal.toFixed(2)}/día`);
    partes.push(declarado);
    return partes.join(" · ");
}

function redondear(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
