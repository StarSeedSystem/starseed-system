"use client";
/**
 * Datos económicos REALES del paquete B — Ola 0929.
 *
 * Fuente: el proyecto Supabase del OS — `seed_market` y `grain_types` (lectura pública: la Bolsa
 * de la Semilla, en BETA con cotizaciones simuladas) y, con sesión, `wallets` + `economy_ledger`
 * (RLS por auth.uid()). La cartera beta es de solo lectura: ninguna operación mueve valor real
 * (SOP architecture/integracion-portal-starseed-os.md). Una lectura compartida por clave para
 * Cartera, Pulso económico y Patrimonio común: en la pestaña Economía se pide UNA vez.
 */
import { createClient } from "@/utils/supabase/client";

export interface GranoTipo { id: string; nombre: string; color: string; semillasPor100g: number }
export interface PuntoMercado { dia: string; eur: number }
export interface DatosMercado { serie: PuntoMercado[]; granos: GranoTipo[] }

export interface MovimientoCartera { tipo: string; semillas: number; nombre: string; ts: number | null }
export interface DatosCartera {
    uid: string | null;
    /** Hay fila en `wallets` (si no, la cartera existe a 0: no es un error). */
    tieneCartera: boolean;
    semillas: number;
    granos: Record<string, number>;
    movimientos: MovimientoCartera[];
}

export const PORTAL_FUNDACION = "https://starseed-nexus.vercel.app/#fundacion";
const GRANO_POR_DEFECTO = "#9FE870";

// ── Puros ────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Gramos de un grano en el jsonb de la cartera (por id, nombre o nombre en minúsculas). */
export function gramosDe(granos: Record<string, unknown> | null | undefined, g: Pick<GranoTipo, "id" | "nombre">): number {
    if (!granos) return 0;
    return num(granos[g.id] ?? granos[g.nombre] ?? granos[g.nombre.toLowerCase()]);
}

/** Composición de la cartera en granos: gramos, semillas equivalentes y peso relativo. */
export function composicion(granos: Record<string, unknown> | null | undefined, tipos: GranoTipo[]): { grano: GranoTipo; gramos: number; semillas: number; pct: number }[] {
    const filas = tipos.map((g) => {
        const gramos = gramosDe(granos, g);
        return { grano: g, gramos, semillas: (gramos / 100) * g.semillasPor100g };
    }).filter((f) => f.gramos > 0);
    const total = filas.reduce((s, f) => s + f.semillas, 0);
    return filas.map((f) => ({ ...f, pct: total > 0 ? f.semillas / total : 0 })).sort((a, b) => b.semillas - a.semillas);
}

/** Valor de la cartera en € (semillas + granos convertidos) con el último precio, o null sin precio. */
export function valorCartera(semillas: number, granos: Record<string, unknown> | null | undefined, tipos: GranoTipo[], precio: number | null): number | null {
    if (precio === null) return null;
    const deGranos = composicion(granos, tipos).reduce((s, f) => s + f.semillas, 0);
    return (semillas + deGranos) * precio;
}

/** Variación % entre el último punto y el de hace `dias` puntos (o el primero si hay menos). */
export function variacion(serie: PuntoMercado[], dias: number): number | null {
    if (serie.length < 2) return null;
    const fin = serie[serie.length - 1].eur;
    const ini = serie[Math.max(0, serie.length - 1 - dias)].eur;
    if (!ini) return null;
    return ((fin - ini) / ini) * 100;
}

export interface Estadisticas { min: number; max: number; media: number; volatilidad: number; ultimo: number }

/** Mín, máx, media y volatilidad (desviación de las variaciones diarias en %). */
export function estadisticas(serie: PuntoMercado[]): Estadisticas | null {
    if (serie.length === 0) return null;
    const v = serie.map((p) => p.eur);
    const media = v.reduce((s, x) => s + x, 0) / v.length;
    const cambios = v.slice(1).map((x, i) => (v[i] ? ((x - v[i]) / v[i]) * 100 : 0));
    const mc = cambios.length ? cambios.reduce((s, x) => s + x, 0) / cambios.length : 0;
    const volatilidad = cambios.length ? Math.sqrt(cambios.reduce((s, x) => s + (x - mc) ** 2, 0) / cambios.length) : 0;
    return { min: Math.min(...v), max: Math.max(...v), media, volatilidad, ultimo: v[v.length - 1] };
}

const EUR = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EUR4 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const ENTERO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const UN_DECIMAL = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function euros(v: number, precision: "precio" | "total" = "total"): string {
    return `${(precision === "precio" ? EUR4 : EUR).format(v)} €`;
}
export function entero(v: number): string {
    return ENTERO.format(v);
}
/** 1234 → «1,2 k»; 2_500_000 → «2,5 M». */
export function compacto(v: number): string {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `${UN_DECIMAL.format(v / 1_000_000)} M`;
    if (a >= 10_000) return `${UN_DECIMAL.format(v / 1_000)} k`;
    return ENTERO.format(v);
}
export function porcentaje(v: number): string {
    return `${v > 0 ? "+" : ""}${UN_DECIMAL.format(v)} %`;
}

// ── Red ─────────────────────────────────────────────────────────────────────

/** Bolsa de la Semilla (90 días) + catálogo de granos. Público. */
export async function cargarMercado(): Promise<DatosMercado> {
    const sb = createClient();
    const [m, g] = await Promise.all([
        sb.from("seed_market").select("day, seed_eur").order("day", { ascending: false }).limit(90),
        sb.from("grain_types").select("id, name, color, seeds_per_100g").order("name"),
    ]);
    if (m.error && g.error) throw new Error("No se pudo leer la Bolsa de la Semilla.");
    const serie = ((m.data as { day: string; seed_eur: unknown }[] | null) ?? [])
        .map((r) => ({ dia: r.day, eur: Number(r.seed_eur) }))
        .filter((p) => Number.isFinite(p.eur) && p.eur > 0)
        .reverse();
    const granos = ((g.data as { id: string; name: string | null; color: string | null; seeds_per_100g: unknown }[] | null) ?? []).map((r) => ({
        id: r.id,
        nombre: r.name?.trim() || "Grano",
        color: /^#[0-9a-f]{6}$/i.test(r.color?.trim() ?? "") ? (r.color as string).trim() : GRANO_POR_DEFECTO,
        semillasPor100g: num(r.seeds_per_100g),
    }));
    return { serie, granos };
}

/** Tu cartera beta (solo lectura) y tus 8 últimos movimientos. Sin sesión → vacío honesto. */
export async function cargarCartera(uid: string | null): Promise<DatosCartera> {
    if (!uid) return { uid: null, tieneCartera: false, semillas: 0, granos: {}, movimientos: [] };
    const sb = createClient();
    const [w, l] = await Promise.all([
        sb.from("wallets").select("semillas, granos").eq("user_id", uid).maybeSingle(),
        sb.from("economy_ledger").select("kind, seeds, name, ts").eq("user_id", uid).order("ts", { ascending: false }).limit(8),
    ]);
    if (w.error && l.error) throw new Error("No se pudo leer tu cartera.");
    const fila = (w.data as { semillas: unknown; granos: Record<string, unknown> | null } | null) ?? null;
    const granos: Record<string, number> = {};
    for (const [k, v] of Object.entries(fila?.granos ?? {})) granos[k] = num(v);
    return {
        uid,
        tieneCartera: !!fila,
        semillas: num(fila?.semillas),
        granos,
        movimientos: ((l.data as { kind: string | null; seeds: unknown; name: string | null; ts: string | null }[] | null) ?? []).map((r) => ({
            tipo: r.kind?.trim() || "movimiento",
            semillas: num(r.seeds),
            nombre: r.name?.trim() || "Movimiento",
            ts: r.ts ? Date.parse(r.ts) || null : null,
        })),
    };
}
