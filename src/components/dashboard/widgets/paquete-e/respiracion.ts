/**
 * Respiración guiada del paquete E (widget de Coherencia).
 *
 * Todo puro y local: los patrones, en qué fase va una sesión en cada segundo, cuánto crece la
 * flor, y el registro de práctica (segundos por día, en este navegador). Aquí no se mide nada del
 * cuerpo: sin sensor, la coherencia se practica, no se calcula.
 */

export type TipoFase = "inhala" | "sosten" | "exhala";
export interface Fase { tipo: TipoFase; s: number }
export type IdPatron = "coherente" | "calma" | "caja";
export interface Patron { id: IdPatron; nombre: string; ritmo: string; detalle: string; fases: Fase[] }

export const PATRONES: Patron[] = [
    { id: "coherente", nombre: "Coherente", ritmo: "5 · 5", detalle: "5 s dentro y 5 s fuera: unas 6 respiraciones por minuto.", fases: [{ tipo: "inhala", s: 5 }, { tipo: "exhala", s: 5 }] },
    { id: "calma", nombre: "Calma", ritmo: "4 · 6", detalle: "4 s dentro y 6 s fuera: la exhalación larga afloja el cuerpo.", fases: [{ tipo: "inhala", s: 4 }, { tipo: "exhala", s: 6 }] },
    { id: "caja", nombre: "Caja", ritmo: "4 · 4 · 4 · 4", detalle: "Inhala, sostén, exhala y sostén, 4 s cada uno: foco sereno.", fases: [{ tipo: "inhala", s: 4 }, { tipo: "sosten", s: 4 }, { tipo: "exhala", s: 4 }, { tipo: "sosten", s: 4 }] },
];

export const DURACIONES_MIN = [1, 3, 5, 10] as const;

export const NOMBRE_FASE: Record<TipoFase, string> = { inhala: "Inhala", sosten: "Sostén", exhala: "Exhala" };
export const COLOR_FASE: Record<TipoFase, string> = { inhala: "#38bdf8", sosten: "#a78bfa", exhala: "#34d399" };

export function patronDe(id: string | undefined): Patron {
    return PATRONES.find((p) => p.id === id) ?? PATRONES[0];
}

export function cicloS(p: Patron): number {
    return p.fases.reduce((a, f) => a + f.s, 0);
}

export interface EnFase { indice: number; fase: Fase; restante: number; progreso: number; escala: number; ciclo: number }

const ESCALA_MIN = 0.55;
const suave = (x: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, x)))) / 2;

/** En qué fase va una sesión a los `t` segundos, y el tamaño de la flor (0,55 vacía · 1 llena). */
export function faseEn(p: Patron, t: number): EnFase {
    const c = cicloS(p);
    const tt = Math.max(0, t);
    const ciclo = Math.floor(tt / c);
    let resto = tt - ciclo * c;
    for (let i = 0; i < p.fases.length; i++) {
        const f = p.fases[i];
        if (resto < f.s || i === p.fases.length - 1) {
            const progreso = Math.max(0, Math.min(1, resto / f.s));
            const previa = p.fases[(i - 1 + p.fases.length) % p.fases.length];
            const escala = f.tipo === "inhala" ? ESCALA_MIN + (1 - ESCALA_MIN) * suave(progreso)
                : f.tipo === "exhala" ? 1 - (1 - ESCALA_MIN) * suave(progreso)
                    : previa.tipo === "inhala" ? 1 : ESCALA_MIN;
            return { indice: i, fase: f, restante: Math.max(1, Math.ceil(f.s - resto)), progreso, escala, ciclo };
        }
        resto -= f.s;
    }
    /* inalcanzable: el bucle devuelve siempre en la última fase */
    return { indice: 0, fase: p.fases[0], restante: p.fases[0].s, progreso: 0, escala: ESCALA_MIN, ciclo };
}

// ── Registro de práctica (solo en este navegador) ─────────────────────

export const CLAVE_REGISTRO = "starseed.coherencia.registro.v1";
export const EVENTO_REGISTRO = "starseed:coherencia-registro";
export interface RegistroRespiracion { v: 1; dias: Record<string, number> }

export function diaLocal(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dd}`;
}

export function registroVacio(): RegistroRespiracion { return { v: 1, dias: {} }; }

/** Lee el registro; `ok: false` si el navegador no deja guardar (modo privado, bloqueo). */
export function leerRegistro(): { registro: RegistroRespiracion; ok: boolean } {
    try {
        const crudo = window.localStorage.getItem(CLAVE_REGISTRO);
        if (!crudo) return { registro: registroVacio(), ok: true };
        const r = JSON.parse(crudo) as Partial<RegistroRespiracion>;
        const dias: Record<string, number> = {};
        if (r && typeof r.dias === "object" && r.dias) {
            for (const [k, v] of Object.entries(r.dias)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "number" && v > 0) dias[k] = Math.round(v);
        }
        return { registro: { v: 1, dias }, ok: true };
    } catch {
        return { registro: registroVacio(), ok: false };
    }
}

/** Suma segundos practicados al día dado y recorta el registro a los últimos 400 días. */
export function sumarSegundos(r: RegistroRespiracion, dia: string, segundos: number): RegistroRespiracion {
    if (!(segundos > 0)) return r;
    const dias = { ...r.dias, [dia]: Math.round((r.dias[dia] ?? 0) + segundos) };
    const claves = Object.keys(dias).sort();
    for (const k of claves.slice(0, Math.max(0, claves.length - 400))) delete dias[k];
    return { v: 1, dias };
}

export function guardarRegistro(r: RegistroRespiracion): boolean {
    try {
        window.localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(r));
        window.dispatchEvent(new CustomEvent(EVENTO_REGISTRO));
        return true;
    } catch {
        return false;
    }
}

const UN_DIA = 86_400_000;
const MINIMO_DIA_S = 60;

/** Días seguidos con al menos un minuto, contando hoy o, si hoy aún no, desde ayer. */
export function racha(r: RegistroRespiracion, hoy: Date): number {
    const cuenta = (d: Date) => (r.dias[diaLocal(d)] ?? 0) >= MINIMO_DIA_S;
    let d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
    if (!cuenta(d)) d = new Date(d.getTime() - UN_DIA);
    let n = 0;
    while (cuenta(d) && n < 400) { n++; d = new Date(d.getTime() - UN_DIA); }
    return n;
}

const INICIAL = ["D", "L", "M", "X", "J", "V", "S"];
const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Los últimos 7 días (el último es hoy) con los minutos practicados. */
export function semana(r: RegistroRespiracion, hoy: Date): { dia: string; inicial: string; nombre: string; minutos: number; hoy: boolean }[] {
    const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base.getTime() - (6 - i) * UN_DIA);
        const clave = diaLocal(d);
        return { dia: clave, inicial: INICIAL[d.getDay()], nombre: NOMBRE_DIA[d.getDay()], minutos: Math.round((r.dias[clave] ?? 0) / 60), hoy: i === 6 };
    });
}

export function totalSegundos(r: RegistroRespiracion): number {
    return Object.values(r.dias).reduce((a, b) => a + b, 0);
}

/** «45 s», «3 min», «1 h 5 min». */
export function duracionLegible(segundos: number): string {
    const s = Math.max(0, Math.round(segundos));
    if (s < 60) return `${s} s`;
    const min = Math.floor(s / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/** «2:05» para la cuenta atrás de la sesión. */
export function reloj(segundos: number): string {
    const s = Math.max(0, Math.ceil(segundos));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
