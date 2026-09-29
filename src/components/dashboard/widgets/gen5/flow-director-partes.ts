"use client";
/**
 * Director de Flujo · lógica (Ola 0929-C) — sesiones de enfoque tipo Pomodoro, LOCALES.
 *
 * La sesión se guarda con marcas de tiempo absolutas (`inicio`, `pausadaEn`, `pausaAcumMs`),
 * no con un contador: el widget deja de «hacer tic» cuando no se ve (pestaña oculta o fuera de
 * pantalla) y al volver recalcula el tiempo exacto. Todas las instancias del widget y todas
 * las pestañas comparten la misma sesión (localStorage + evento). El registro del día guarda
 * cada bloque de enfoque (con su tarea, si la había) durante 21 días.
 */
import * as React from "react";

export type ModoFlujo = "enfoque" | "descanso";

export interface SesionFlujo {
    modo: ModoFlujo;
    inicio: number;
    duracionMs: number;
    /** Momento en que se pausó (null = corriendo). */
    pausadaEn: number | null;
    /** Tiempo total en pausa ya cerrado. */
    pausaAcumMs: number;
    tareaId?: string;
    tareaTexto?: string;
}

export interface EntradaFlujo {
    inicio: number;
    fin: number;
    minutos: number;
    tarea?: string;
    /** true si llegó al final; false si se detuvo antes. */
    completa: boolean;
}

export const CLAVE_SESION = "starseed.flujo.sesion.v1";
export const CLAVE_REGISTRO = "starseed.flujo.registro.v1";
export const EVENTO_FLUJO = "starseed:flujo";
const DIAS_REGISTRO = 21;

export const PRESETS_ENFOQUE = [25, 50, 90] as const;
export const PRESETS_DESCANSO = [5, 15] as const;

// ── Puras ─────────────────────────────────────────────────────────────────

export function transcurrido(s: SesionFlujo, ahora: number): number {
    const hasta = s.pausadaEn ?? ahora;
    return Math.max(0, hasta - s.inicio - s.pausaAcumMs);
}

export function restante(s: SesionFlujo, ahora: number): number {
    return Math.max(0, s.duracionMs - transcurrido(s, ahora));
}

export function progreso(s: SesionFlujo, ahora: number): number {
    return s.duracionMs > 0 ? Math.min(1, transcurrido(s, ahora) / s.duracionMs) : 1;
}

export function terminada(s: SesionFlujo, ahora: number): boolean {
    return s.pausadaEn === null && restante(s, ahora) <= 0;
}

export function nuevaSesion(modo: ModoFlujo, minutos: number, ahora: number, tarea?: { id: string; texto: string }): SesionFlujo {
    return { modo, inicio: ahora, duracionMs: Math.round(minutos * 60_000), pausadaEn: null, pausaAcumMs: 0, tareaId: tarea?.id, tareaTexto: tarea?.texto };
}

export function pausar(s: SesionFlujo, ahora: number): SesionFlujo {
    return s.pausadaEn !== null ? s : { ...s, pausadaEn: ahora };
}

export function reanudar(s: SesionFlujo, ahora: number): SesionFlujo {
    return s.pausadaEn === null ? s : { ...s, pausaAcumMs: s.pausaAcumMs + (ahora - s.pausadaEn), pausadaEn: null };
}

/** Cierra una sesión de ENFOQUE como entrada del registro (los descansos no se anotan). */
export function entradaDe(s: SesionFlujo, ahora: number): EntradaFlujo | null {
    if (s.modo !== "enfoque") return null;
    const ms = Math.min(s.duracionMs, transcurrido(s, ahora));
    const minutos = Math.floor(ms / 60_000);
    if (minutos < 1) return null;
    return { inicio: s.inicio, fin: Math.min(ahora, s.inicio + s.duracionMs + s.pausaAcumMs), minutos, tarea: s.tareaTexto, completa: ms >= s.duracionMs };
}

/** mm:ss (o h:mm:ss por encima de una hora). */
export function reloj(ms: number): string {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sg = t % 60;
    const mm = String(m).padStart(2, "0"), ss = String(sg).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Corto para el centro de la esfera: «40′», «1h25», «2h». */
export function minutosCortos(min: number): string {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m}′`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** «1 h 25 min», «40 min». */
export function duracionTexto(min: number): string {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
}

export function entradasDeHoy(reg: EntradaFlujo[], ahora: number): EntradaFlujo[] {
    const ini = diaDesplazado(ahora, 0), fin = diaDesplazado(ahora, 1);
    return reg.filter((e) => e.fin >= ini && e.inicio < fin);
}

export function minutosHoy(reg: EntradaFlujo[], ahora: number): number {
    return entradasDeHoy(reg, ahora).reduce((a, e) => a + e.minutos, 0);
}

/** Inicio (00:00 local) del día desplazado `delta` días (seguro ante cambios de hora). */
function diaDesplazado(t: number, delta: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + delta);
    return d.getTime();
}

/** Minutos de enfoque por día, de más antiguo a hoy (`dias` barras). */
export function minutosPorDia(reg: EntradaFlujo[], ahora: number, dias = 7): { dia: number; minutos: number }[] {
    return Array.from({ length: dias }, (_, i) => {
        const ini = diaDesplazado(ahora, -(dias - 1 - i));
        const fin = diaDesplazado(ini, 1);
        const minutos = reg.filter((e) => e.inicio >= ini && e.inicio < fin).reduce((a, e) => a + e.minutos, 0);
        return { dia: ini, minutos };
    });
}

/** Racha: días seguidos (hasta hoy o ayer) con al menos un bloque de enfoque. */
export function racha(reg: EntradaFlujo[], ahora: number): number {
    const dias = new Set(reg.map((e) => diaDesplazado(e.inicio, 0)));
    let d = diaDesplazado(ahora, 0);
    if (!dias.has(d)) d = diaDesplazado(d, -1);
    let n = 0;
    while (dias.has(d)) { n++; d = diaDesplazado(d, -1); }
    return n;
}

/** Hora decimal local de un instante (0-24). */
export function horaDecimal(t: number): number {
    const d = new Date(t);
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function recortarRegistro(reg: EntradaFlujo[], ahora: number): EntradaFlujo[] {
    const limite = ahora - DIAS_REGISTRO * 86_400_000;
    return reg.filter((e) => e.fin >= limite).sort((a, b) => a.inicio - b.inicio);
}

// ── Almacén ───────────────────────────────────────────────────────────────

function esSesion(v: unknown): v is SesionFlujo {
    const s = v as SesionFlujo;
    return !!s && (s.modo === "enfoque" || s.modo === "descanso") && typeof s.inicio === "number" && typeof s.duracionMs === "number" && typeof s.pausaAcumMs === "number";
}

export function leerSesion(): SesionFlujo | null {
    if (typeof window === "undefined") return null;
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null");
        return esSesion(j) ? { ...j, pausadaEn: typeof j.pausadaEn === "number" ? j.pausadaEn : null } : null;
    } catch { return null; }
}

export function leerRegistro(): EntradaFlujo[] {
    if (typeof window === "undefined") return [];
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE_REGISTRO) || "[]");
        return Array.isArray(j) ? j.filter((e) => e && typeof e.inicio === "number" && typeof e.fin === "number" && typeof e.minutos === "number") : [];
    } catch { return []; }
}

function avisar() {
    try { window.dispatchEvent(new Event(EVENTO_FLUJO)); } catch { /* sin ventana */ }
}

export function guardarSesion(s: SesionFlujo | null) {
    try {
        if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
        else localStorage.removeItem(CLAVE_SESION);
    } catch { /* almacén bloqueado: la sesión vive solo en memoria de esta vista */ }
    avisar();
}

/** Anota una entrada sin duplicar (misma hora de inicio = misma sesión). */
export function anotar(e: EntradaFlujo, ahora = Date.now()) {
    const reg = leerRegistro().filter((x) => x.inicio !== e.inicio);
    try { localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(recortarRegistro([...reg, e], ahora))); } catch { /* cuota */ }
    avisar();
}

// ── Hook ──────────────────────────────────────────────────────────────────

export interface UsoFlujo {
    sesion: SesionFlujo | null;
    registro: EntradaFlujo[];
    iniciar: (modo: ModoFlujo, minutos: number, tarea?: { id: string; texto: string }) => void;
    alternarPausa: () => void;
    /** Detiene la sesión (anota lo hecho si era enfoque de ≥ 1 min). */
    detener: () => void;
    /** Cierra la sesión terminada (solo la primera instancia la encuentra) y devuelve qué se cerró. */
    cerrarSiTerminada: (ahora: number) => { sesion: SesionFlujo; entrada: EntradaFlujo | null } | null;
}

export function useFlujo(): UsoFlujo {
    const [sesion, setSesion] = React.useState<SesionFlujo | null>(null);
    const [registro, setRegistro] = React.useState<EntradaFlujo[]>([]);
    React.useEffect(() => {
        const leer = () => { setSesion(leerSesion()); setRegistro(leerRegistro()); };
        leer();
        const alm = (e: StorageEvent) => { if (e.key === CLAVE_SESION || e.key === CLAVE_REGISTRO) leer(); };
        window.addEventListener(EVENTO_FLUJO, leer);
        window.addEventListener("storage", alm);
        return () => { window.removeEventListener(EVENTO_FLUJO, leer); window.removeEventListener("storage", alm); };
    }, []);
    const iniciar = React.useCallback((modo: ModoFlujo, minutos: number, tarea?: { id: string; texto: string }) => {
        const previa = leerSesion();
        const ahora = Date.now();
        if (previa) { const e = entradaDe(previa, ahora); if (e) anotar(e, ahora); }
        guardarSesion(nuevaSesion(modo, minutos, ahora, tarea));
    }, []);
    const alternarPausa = React.useCallback(() => {
        const s = leerSesion();
        if (!s) return;
        const ahora = Date.now();
        guardarSesion(s.pausadaEn === null ? pausar(s, ahora) : reanudar(s, ahora));
    }, []);
    const detener = React.useCallback(() => {
        const s = leerSesion();
        if (!s) return;
        const ahora = Date.now();
        const e = entradaDe(s, ahora);
        if (e) anotar(e, ahora);
        guardarSesion(null);
    }, []);
    const cerrarSiTerminada = React.useCallback((ahora: number) => {
        const s = leerSesion();
        if (!s || !terminada(s, ahora)) return null;
        const e = entradaDe(s, ahora);
        if (e) anotar(e, ahora);
        guardarSesion(null);
        return { sesion: s, entrada: e };
    }, []);
    return { sesion, registro, iniciar, alternarPausa, detener, cerrarSiTerminada };
}
