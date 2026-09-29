/**
 * Medidor «Consumo y créditos» del Puente de Mando — tipos y reglas PURAS (2026-09-29).
 *
 * Seguro para el cliente: sin `node:`, sin red, sin reloj propio. Lo usan la ruta
 * `/api/mando/consumo` (servidor) y el componente `medidor-consumo.tsx` (navegador).
 *
 * Alex: «añade un medidor de esos créditos que lo verifique desde el Puente de Mando; ya no
 * pueden haber errores de ese tipo que consuman los créditos». El plan gratuito de Supabase
 * NO tiene límite de gasto diario: los presupuestos de aquí son NUESTROS y los hace cumplir
 * `scripts/puente/vigia_consumo.py` (freno remoto en `os_freno`).
 */

/** Lo que Alex puede editar desde el Mando (`~/.starseed/presupuestos.json`). */
export interface Presupuestos {
    supabase_peticiones_dia: number;
    supabase_mb_dia: number;
    supabase_mb_ciclo: number;
    /** «AAAA-MM-DD» del inicio del ciclo de facturación, o null si no se sabe. */
    ciclo_inicio: string | null;
    jev_usd_dia: number;
    openrouter_usd_min_saldo: number;
}

/** Los valores del contrato «consumo» (5 GB / 30 días ≈ 166 MB/día: 150 deja margen). */
export const PRESUPUESTOS_POR_DEFECTO: Readonly<Presupuestos> = Object.freeze({
    supabase_peticiones_dia: 25_000,
    supabase_mb_dia: 150,
    supabase_mb_ciclo: 5120,
    ciclo_inicio: null,
    jev_usd_dia: 0.05,
    openrouter_usd_min_saldo: 2,
});

/** Topes de cordura del formulario: ni un cero que frene todo, ni un número absurdo. */
export const LIMITES_PRESUPUESTOS: Readonly<Record<Exclude<keyof Presupuestos, "ciclo_inicio">, readonly [number, number]>> =
    Object.freeze({
        supabase_peticiones_dia: [500, 2_000_000] as const,
        supabase_mb_dia: [5, 50_000] as const,
        supabase_mb_ciclo: [100, 1_000_000] as const,
        jev_usd_dia: [0, 100] as const,
        openrouter_usd_min_saldo: [0, 1000] as const,
    });

export const ETIQUETAS_PRESUPUESTOS: Readonly<Record<keyof Presupuestos, string>> = Object.freeze({
    supabase_peticiones_dia: "Supabase · peticiones por día",
    supabase_mb_dia: "Supabase · MB de salida por día",
    supabase_mb_ciclo: "Supabase · MB por ciclo de facturación",
    ciclo_inicio: "Inicio del ciclo de facturación",
    jev_usd_dia: "Jev · USD por día",
    openrouter_usd_min_saldo: "OpenRouter · saldo mínimo (USD)",
});

export type ResultadoValidacion = { ok: true; valor: Presupuestos } | { ok: false; error: string };

/** Valida lo que llega del formulario. Todos los campos son obligatorios salvo el ciclo. */
export function validarPresupuestos(entrada: unknown): ResultadoValidacion {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
        return { ok: false, error: "Faltan los presupuestos." };
    }
    const e = entrada as Record<string, unknown>;
    const valor: Presupuestos = { ...PRESUPUESTOS_POR_DEFECTO };
    for (const clave of Object.keys(LIMITES_PRESUPUESTOS) as (keyof typeof LIMITES_PRESUPUESTOS)[]) {
        const crudo = e[clave];
        const n = typeof crudo === "number" ? crudo : typeof crudo === "string" && crudo.trim() !== "" ? Number(crudo) : NaN;
        const [min, max] = LIMITES_PRESUPUESTOS[clave];
        if (!Number.isFinite(n)) return { ok: false, error: `«${ETIQUETAS_PRESUPUESTOS[clave]}» tiene que ser un número.` };
        if (n < min || n > max) {
            return { ok: false, error: `«${ETIQUETAS_PRESUPUESTOS[clave]}» tiene que estar entre ${min} y ${max}.` };
        }
        valor[clave] = n;
    }
    const ci = e.ciclo_inicio;
    if (ci === null || ci === undefined || ci === "") {
        valor.ciclo_inicio = null;
    } else if (typeof ci === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ci) && fechaValida(ci)) {
        valor.ciclo_inicio = ci;
    } else {
        return { ok: false, error: "El inicio del ciclo tiene que ser una fecha (AAAA-MM-DD) o quedar vacío." };
    }
    return { ok: true, valor };
}

/** Lo guardado en disco, con los valores por defecto donde falte o no valga. */
export function normalizarPresupuestos(crudo: unknown): Presupuestos {
    const p: Presupuestos = { ...PRESUPUESTOS_POR_DEFECTO };
    if (!crudo || typeof crudo !== "object") return p;
    const c = crudo as Record<string, unknown>;
    for (const clave of Object.keys(LIMITES_PRESUPUESTOS) as (keyof typeof LIMITES_PRESUPUESTOS)[]) {
        const n = Number(c[clave]);
        if (Number.isFinite(n) && (n > 0 || (n === 0 && clave === "openrouter_usd_min_saldo"))) p[clave] = n;
    }
    if (typeof c.ciclo_inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.ciclo_inicio) && fechaValida(c.ciclo_inicio)) {
        p.ciclo_inicio = c.ciclo_inicio;
    }
    return p;
}

function fechaValida(iso: string): boolean {
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// ─── Lo que la ruta devuelve (solo números, rutas de API y fechas; nunca claves ni disco) ───

export type NivelSupabase = "ok" | "aviso" | "freno" | "restringido" | "sin-medir";
export type TonoConsumo = "ok" | "aviso" | "peligro" | "neutro";

export interface RutaConsumo {
    ruta: string;
    n: number;
    mb: number;
}

export interface DiaHistorial {
    dia: string;
    /** null = ese día no se midió (la Mac estaba apagada). */
    peticiones: number | null;
}

export interface MedidorSupabase {
    nivel: NivelSupabase;
    /** ISO de la última medición de la vigía, o null si nunca midió. */
    medidoEn: string | null;
    /** Falso si la última medición tiene más de 45 min (la vigía no está corriendo). */
    fresco: boolean;
    dia: string;
    peticiones: number;
    mb: number;
    /** 0-1: parte de las respuestas de hoy con tamaño medido (el resto es estimado). */
    fraccionMedida: number | null;
    pctPeticiones: number;
    pctMb: number;
    c402: number;
    top: RutaConsumo[];
    realtime: { mb: number; escrituras: number; registros: number; estimado: true } | null;
    ciclo: {
        mb: number;
        presupuestoMb: number;
        pct: number;
        inicio: string;
        /** null si no se conoce el inicio del ciclo. */
        diasRestantes: number | null;
        supuesto: boolean;
    };
    freno: {
        activo: boolean;
        motivo: string | null;
        hasta: string | null;
        /** Estado de la última escritura en `os_freno`. */
        remoto: "ok" | "no_disponible" | "error" | "sin_credenciales" | null;
    };
    historial: DiaHistorial[];
    ultimoBucle: { t: string; ruta: string; ua: string; n: number } | null;
}

export interface MedidorJev {
    usdHoy: number | null;
    techo: number;
    pct: number | null;
    saldo: number | null;
    saldoMin: number;
    tono: TonoConsumo;
}

export interface MedidorClaudeNube {
    restante: number | null;
    total: number | null;
    /** 0-1 de lo que QUEDA. */
    fraccion: number | null;
    declaradoEn: string | null;
    vence: string | null;
    dias: number | null;
    tono: TonoConsumo;
    aviso: string | null;
    comando: string;
    enlace: string;
}

export interface DatosConsumo {
    supabase: MedidorSupabase;
    jev: MedidorJev;
    claude: MedidorClaudeNube;
    presupuestos: Presupuestos;
    generadoEn: string;
}

// ─── Formato (compartido por el componente y sus pruebas) ───

/** 12345 → «12.345». */
export function miles(n: number): string {
    return Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** MB con una cifra decimal bajo 10, entero después; GB desde 1024. */
export function textoMb(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2).replace(".", ",")} GB`;
    if (mb < 10) return `${mb.toFixed(1).replace(".", ",")} MB`;
    return `${miles(mb)} MB`;
}

/** 0,4231 → «42 %». */
export function textoPct(p: number): string {
    return `${Math.round(p * 100)} %`;
}

/** Tono de una barra por su fracción usada. */
export function tonoPorPct(p: number | null): TonoConsumo {
    if (p === null || !Number.isFinite(p)) return "neutro";
    if (p >= 1) return "peligro";
    if (p >= 0.7) return "aviso";
    return "ok";
}
