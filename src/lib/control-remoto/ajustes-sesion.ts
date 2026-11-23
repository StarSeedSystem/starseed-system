/**
 * CTL1123D · Ajustes avanzados de sesión remota (FPS, calidad y perfil multiantena).
 * Módulo PURO (sin red, sin disco, sin reloj): tipos, validación, normalización y serialización segura.
 */

export type FpsObjetivo = 15 | 24 | 30 | 60;
export type LadoMaximo = 720 | 1080 | 1280 | 1920;
export type CalidadJpeg = number & { readonly __brand: unique symbol };
export type PerfilMultiantena = "auto-simultaneo" | "baja-latencia" | "ahorro";
export type ModoTeclado = "mensaje" | "tiempo-real" | "ambos";

export interface AjustesSesion {
    fpsObjetivo: FpsObjetivo;
    ladoMaximo: LadoMaximo;
    calidadJpeg: CalidadJpeg;
    perfilMultiantena: PerfilMultiantena;
    modoTeclado: ModoTeclado;
}

export const AJUSTES_DEFECTO: AjustesSesion = {
    fpsObjetivo: 30,
    ladoMaximo: 1280,
    calidadJpeg: 75 as CalidadJpeg,
    perfilMultiantena: "auto-simultaneo",
    modoTeclado: "ambos",
};

const FPS_VALIDOS: readonly FpsObjetivo[] = [15, 24, 30, 60];
const LADOS_VALIDOS: readonly LadoMaximo[] = [720, 1080, 1280, 1920];
const PERFILES_VALIDOS: readonly PerfilMultiantena[] = ["auto-simultaneo", "baja-latencia", "ahorro"];
const MODOS_TECLADO_VALIDOS: readonly ModoTeclado[] = ["mensaje", "tiempo-real", "ambos"];

function clampCalidad(v: number): CalidadJpeg {
    const n = Math.round(v);
    return (n < 40 ? 40 : n > 90 ? 90 : n) as CalidadJpeg;
}

export function normalizarFps(v: unknown): FpsObjetivo {
    if (typeof v === "number" && FPS_VALIDOS.includes(v as FpsObjetivo)) return v as FpsObjetivo;
    return AJUSTES_DEFECTO.fpsObjetivo;
}

export function normalizarLadoMaximo(v: unknown): LadoMaximo {
    if (typeof v === "number" && LADOS_VALIDOS.includes(v as LadoMaximo)) return v as LadoMaximo;
    return AJUSTES_DEFECTO.ladoMaximo;
}

export function normalizarCalidadJpeg(v: unknown): CalidadJpeg {
    if (typeof v === "number" && Number.isFinite(v)) return clampCalidad(v);
    return AJUSTES_DEFECTO.calidadJpeg;
}

export function normalizarPerfilMultiantena(v: unknown): PerfilMultiantena {
    if (typeof v === "string" && PERFILES_VALIDOS.includes(v as PerfilMultiantena)) return v as PerfilMultiantena;
    return AJUSTES_DEFECTO.perfilMultiantena;
}

export function normalizarModoTeclado(v: unknown): ModoTeclado {
    if (typeof v === "string" && MODOS_TECLADO_VALIDOS.includes(v as ModoTeclado)) return v as ModoTeclado;
    return AJUSTES_DEFECTO.modoTeclado;
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
        f: a.fpsObjetivo,
        l: a.ladoMaximo,
        q: a.calidadJpeg,
        p: a.perfilMultiantena,
        t: a.modoTeclado,
    });
}

export function deserializarAjustes(s: string): AjustesSesion {
    try {
        const o = JSON.parse(s);
        if (!o || typeof o !== "object") return AJUSTES_DEFECTO;
        return validarAjustes({
            fpsObjetivo: o.f,
            ladoMaximo: o.l,
            calidadJpeg: o.q,
            perfilMultiantena: o.p,
            modoTeclado: o.t,
        });
    } catch {
        return AJUSTES_DEFECTO;
    }
}

export function sonIguales(a: AjustesSesion, b: AjustesSesion): boolean {
    return (
        a.fpsObjetivo === b.fpsObjetivo &&
        a.ladoMaximo === b.ladoMaximo &&
        a.calidadJpeg === b.calidadJpeg &&
        a.perfilMultiantena === b.perfilMultiantena &&
        a.modoTeclado === b.modoTeclado
    );
}