/**
 * CTL1123D · Ajustes avanzados de sesión remota (FPS, calidad y perfil multiantena).
 *
 * Módulo PURO (sin red, sin disco, sin reloj): tipos, validación, normalización
 * y serialización segura de los ajustes configurables de una sesión de control remoto.
 */

export type FpsObjetivo = 15 | 24 | 30 | 60;
export type LadoMaximo = 720 | 1080 | 1280 | 1920;
export type CalidadJpeg = number & { readonly __marca: unique symbol };
export type PerfilMultiantena = "auto-simultaneo" | "baja-latencia" | "ahorro";
export type ModoTeclado = "mensaje" | "tiempo-real" | "ambos";

export interface AjustesSesion {
    /** FPS objetivo de la sesión (cuadros por segundo). */
    fps: FpsObjetivo;
    /** Lado máximo en píxeles (ancho o alto, el mayor). */
    ladoMaximo: LadoMaximo;
    /** Calidad JPEG 40–90 (entero). */
    calidadJpeg: CalidadJpeg;
    /** Perfil de enrutamiento multiantena. */
    perfilMultiantena: PerfilMultiantena;
    /** Modo de teclado predeterminado. */
    modoTeclado: ModoTeclado;
}

export const AJUSTES_SESION_DEFECTO: AjustesSesion = {
    fps: 30,
    ladoMaximo: 1280,
    calidadJpeg: 70 as CalidadJpeg,
    perfilMultiantena: "auto-simultaneo",
    modoTeclado: "ambos",
};

const FPS_VALIDOS: readonly FpsObjetivo[] = [15, 24, 30, 60];
const LADOS_VALIDOS: readonly LadoMaximo[] = [720, 1080, 1280, 1920];
const PERFILES_VALIDOS: readonly PerfilMultiantena[] = ["auto-simultaneo", "baja-latencia", "ahorro"];
const MODOS_TECLADO_VALIDOS: readonly ModoTeclado[] = ["mensaje", "tiempo-real", "ambos"];

function esFpsValido(v: unknown): v is FpsObjetivo {
    return typeof v === "number" && FPS_VALIDOS.includes(v as FpsObjetivo);
}

function esLadoValido(v: unknown): v is LadoMaximo {
    return typeof v === "number" && LADOS_VALIDOS.includes(v as LadoMaximo);
}

function esCalidadValida(v: unknown): v is CalidadJpeg {
    return typeof v === "number" && Number.isInteger(v) && v >= 40 && v <= 90;
}

function esPerfilValido(v: unknown): v is PerfilMultiantena {
    return typeof v === "string" && PERFILES_VALIDOS.includes(v as PerfilMultiantena);
}

function esModoTecladoValido(v: unknown): v is ModoTeclado {
    return typeof v === "string" && MODOS_TECLADO_VALIDOS.includes(v as ModoTeclado);
}

/**
 * Normaliza un valor de FPS al valor válido más cercano (por defecto 30).
 * Si el valor no es número, devuelve el defecto.
 */
export function normalizarFps(v: unknown, def: FpsObjetivo = 30): FpsObjetivo {
    if (typeof v !== "number" || !Number.isFinite(v)) return def;
    const redondeado = Math.round(v);
    let mejor = FPS_VALIDOS[0];
    let menorDist = Math.abs(redondeado - mejor);
    for (const f of FPS_VALIDOS) {
        const d = Math.abs(redondeado - f);
        if (d < menorDist) {
            menorDist = d;
            mejor = f;
        }
    }
    return mejor;
}

/**
 * Normaliza un lado máximo al valor válido más cercano (por defecto 1280).
 */
export function normalizarLadoMaximo(v: unknown, def: LadoMaximo = 1280): LadoMaximo {
    if (typeof v !== "number" || !Number.isFinite(v)) return def;
    const redondeado = Math.round(v);
    let mejor = LADOS_VALIDOS[0];
    let menorDist = Math.abs(redondeado - mejor);
    for (const l of LADOS_VALIDOS) {
        const d = Math.abs(redondeado - l);
        if (d < menorDist) {
            menorDist = d;
            mejor = l;
        }
    }
    return mejor;
}

/**
 * Normaliza calidad JPEG al rango 40–90 (entero, por defecto 70).
 */
export function normalizarCalidadJpeg(v: unknown, def: CalidadJpeg = 70 as CalidadJpeg): CalidadJpeg {
    if (typeof v !== "number" || !Number.isFinite(v)) return def;
    const entero = Math.round(v);
    const acotado = Math.max(40, Math.min(90, entero));
    return acotado as CalidadJpeg;
}

/**
 * Normaliza perfil multiantena (por defecto "auto-simultaneo").
 */
export function normalizarPerfilMultiantena(v: unknown, def: PerfilMultiantena = "auto-simultaneo"): PerfilMultiantena {
    if (esPerfilValido(v)) return v;
    return def;
}

/**
 * Normaliza modo de teclado (por defecto "ambos").
 */
export function normalizarModoTeclado(v: unknown, def: ModoTeclado = "ambos"): ModoTeclado {
    if (esModoTecladoValido(v)) return v;
    return def;
}

/**
 * Valida y normaliza unos ajustes parciales, devolviendo el objeto completo.
 * Nunca lanza: campos inválidos usan su valor por defecto.
 */
export function normalizarAjustesSesion(parcial: Record<string, unknown>): AjustesSesion {
    return {
        fps: normalizarFps(parcial.fps),
        ladoMaximo: normalizarLadoMaximo(parcial.ladoMaximo),
        calidadJpeg: normalizarCalidadJpeg(parcial.calidadJpeg),
        perfilMultiantena: normalizarPerfilMultiantena(parcial.perfilMultiantena),
        modoTeclado: normalizarModoTeclado(parcial.modoTeclado),
    };
}

/**
 * Comprueba si unos ajustes son válidos (todos los campos tienen valores permitidos).
 */
export function sonAjustesValidos(a: AjustesSesion): boolean {
    return (
        esFpsValido(a.fps) &&
        esLadoValido(a.ladoMaximo) &&
        esCalidadValida(a.calidadJpeg) &&
        esPerfilValido(a.perfilMultiantena) &&
        esModoTecladoValido(a.modoTeclado)
    );
}

/**
 * Serialización segura a JSON (sin símbolos, solo tipos primitivos).
 * Útil para guardar en localStorage, Supabase o enviar por red.
 */
export function ajustesASerializables(a: AjustesSesion): {
    fps: number;
    ladoMaximo: number;
    calidadJpeg: number;
    perfilMultiantena: string;
    modoTeclado: string;
} {
    return {
        fps: a.fps,
        ladoMaximo: a.ladoMaximo,
        calidadJpeg: a.calidadJpeg,
        perfilMultiantena: a.perfilMultiantena,
        modoTeclado: a.modoTeclado,
    };
}

/**
 * Deserializa desde objeto plano (lo que venga de JSON/storage/red).
 * Valida y normaliza: nunca lanza, devuelve ajustes completos y válidos.
 */
export function ajustesDesdeSerializables(
    src: Record<string, unknown>
): AjustesSesion {
    return normalizarAjustesSesion({
        fps: src.fps,
        ladoMaximo: src.ladoMaximo,
        calidadJpeg: src.calidadJpeg,
        perfilMultiantena: src.perfilMultiantena,
        modoTeclado: src.modoTeclado,
    });
}

/**
 * Fusiona unos ajustes base con unos parciales (los parciales ganan).
 * Valida y normaliza el resultado.
 */
export function fusionarAjustes(base: AjustesSesion, parcial: Partial<AjustesSesion>): AjustesSesion {
    return normalizarAjustesSesion({ ...base, ...parcial });
}

/**
 * Devuelve una descripción legible para UI ("30 fps · 1280 px · 70 % · auto-simultaneo · ambos").
 */
export function descripcionAjustes(a: AjustesSesion): string {
    return `${a.fps} fps · ${a.ladoMaximo} px · ${a.calidadJpeg} % · ${a.perfilMultiantena} · ${a.modoTeclado}`;
}