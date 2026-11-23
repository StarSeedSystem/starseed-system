/**
 * CTL1123D · Ajustes avanzados de sesión remota (FPS, calidad y perfil multiantena).
 *
 * Módulo PURO (sin red, sin disco, sin reloj): tipos, validación, normalización
 * y serialización segura de las opciones configurables de una sesión de control remoto.
 */

export type FpsObjetivo = 15 | 24 | 30 | 60;
export type LadoMaximo = 720 | 1080 | 1280 | 1920;
export type CalidadJpeg = number & { readonly __marca: unique symbol };
export type PerfilMultiantena = "auto-simultaneo" | "baja-latencia" | "ahorro";
export type ModoTeclado = "mensaje" | "tiempo-real" | "ambos";

export interface AjustesSesion {
    fpsObjetivo: FpsObjetivo;
    ladoMaximo: LadoMaximo;
    calidadJpeg: CalidadJpeg;
    perfilMultiantena: PerfilMultiantena;
    modoTeclado: ModoTeclado;
}

export const FPS_VALIDOS: readonly FpsObjetivo[] = [15, 24, 30, 60];
export const LADOS_VALIDOS: readonly LadoMaximo[] = [720, 1080, 1280, 1920];
export const PERFILES_VALIDOS: readonly PerfilMultiantena[] = ["auto-simultaneo", "baja-latencia", "ahorro"];
export const MODOS_TECLADO_VALIDOS: readonly ModoTeclado[] = ["mensaje", "tiempo-real", "ambos"];
export const CALIDAD_MIN = 40;
export const CALIDAD_MAX = 90;

export const AJUSTES_DEFECTO: AjustesSesion = {
    fpsObjetivo: 30,
    ladoMaximo: 1280,
    calidadJpeg: 70 as CalidadJpeg,
    perfilMultiantena: "auto-simultaneo",
    modoTeclado: "ambos",
};

function esEnteroFinito(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);
}

export function validarFps(v: unknown): v is FpsObjetivo {
    return esEnteroFinito(v) && FPS_VALIDOS.includes(v as FpsObjetivo);
}

export function validarLadoMaximo(v: unknown): v is LadoMaximo {
    return esEnteroFinito(v) && LADOS_VALIDOS.includes(v as LadoMaximo);
}

export function validarCalidadJpeg(v: unknown): v is CalidadJpeg {
    return esEnteroFinito(v) && v >= CALIDAD_MIN && v <= CALIDAD_MAX;
}

export function validarPerfilMultiantena(v: unknown): v is PerfilMultiantena {
    return typeof v === "string" && PERFILES_VALIDOS.includes(v as PerfilMultiantena);
}

export function validarModoTeclado(v: unknown): v is ModoTeclado {
    return typeof v === "string" && MODOS_TECLADO_VALIDOS.includes(v as ModoTeclado);
}

function marcaCalidad(n: number): CalidadJpeg {
    return n as CalidadJpeg;
}

export function normalizarFps(v: unknown, def: FpsObjetivo = AJUSTES_DEFECTO.fpsObjetivo): FpsObjetivo {
    return validarFps(v) ? v : def;
}

export function normalizarLadoMaximo(v: unknown, def: LadoMaximo = AJUSTES_DEFECTO.ladoMaximo): LadoMaximo {
    return validarLadoMaximo(v) ? v : def;
}

export function normalizarCalidadJpeg(v: unknown, def: CalidadJpeg = AJUSTES_DEFECTO.calidadJpeg): CalidadJpeg {
    if (validarCalidadJpeg(v)) return v;
    if (esEnteroFinito(v)) {
        if (v < CALIDAD_MIN || v > CALIDAD_MAX) return def;
        return marcaCalidad(v);
    }
    return def;
}

export function normalizarPerfilMultiantena(v: unknown, def: PerfilMultiantena = AJUSTES_DEFECTO.perfilMultiantena): PerfilMultiantena {
    return validarPerfilMultiantena(v) ? v : def;
}

export function normalizarModoTeclado(v: unknown, def: ModoTeclado = AJUSTES_DEFECTO.modoTeclado): ModoTeclado {
    return validarModoTeclado(v) ? v : def;
}

export function validarAjustes(parcial: Partial<AjustesSesion>): AjustesSesion {
    return {
        fpsObjetivo: normalizarFps(parcial.fpsObjetivo),
        ladoMaximo: normalizarLadoMaximo(parcial.ladoMaximo),
        calidadJpeg: normalizarCalidadJpeg(parcial.calidadJpeg),
        perfilMultiantena: normalizarPerfilMultiantena(parcial.perfilMultiantena),
        modoTeclado: normalizarModoTeclado(parcial.modoTeclado),
    };
}

export function serializarAjustes(a: AjustesSesion): string {
    return JSON.stringify({
        fpsObjetivo: a.fpsObjetivo,
        ladoMaximo: a.ladoMaximo,
        calidadJpeg: a.calidadJpeg,
        perfilMultiantena: a.perfilMultiantena,
        modoTeclado: a.modoTeclado,
    });
}

export function deserializarAjustes(s: string): AjustesSesion | null {
    try {
        const obj = JSON.parse(s);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
        return validarAjustes(obj);
    } catch {
        return null;
    }
}

export function ajustesSeguros(a: AjustesSesion): AjustesSesion {
    return {
        fpsObjetivo: a.fpsObjetivo,
        ladoMaximo: a.ladoMaximo,
        calidadJpeg: a.calidadJpeg,
        perfilMultiantena: a.perfilMultiantena,
        modoTeclado: a.modoTeclado,
    };
}