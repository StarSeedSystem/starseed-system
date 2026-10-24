/**
 * StarSeed XR · APLICAR EL PERFIL DE CALIDAD A LA SESIÓN (contrato `architecture/starseed-xr.md` §3 c y d).
 * Módulo PURO y probable sin WebXR: la sesión y el renderer se inyectan con la forma mínima que se usa.
 *
 * - `funcionesAPedir`: qué funciones WebXR se piden y cómo (opcionales o requeridas).
 * - `ajustesDePerfil`: del `PerfilCalidad` a foveación, refresco y escala del framebuffer.
 * - `aplicarASesion`: mueve EN CALIENTE foveación y refresco. La escala NO: cambiarla a mitad de sesión obliga a
 *   recrear la capa de render (parpadeo, §1.5.7), así que solo se usa al crear la sesión (`escalaParaSesion`).
 */
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import type { PerfilCalidad } from "@/lib/xr/calidad-perfiles";
import { refrescoInferior } from "@/lib/xr/calidad";
import { acotar, esFuncionXR, type FuncionXR } from "@/lib/xr/tipos";

export interface FuncionesPedidas {
    opcionales: FuncionXR[];
    requeridas: FuncionXR[];
}

/**
 * Parte de `c.funciones` (`FUNCIONES_ESPERADAS` de la plataforma, o lo concedido tras `refinarFunciones`).
 * - Lista blanca (`esFuncionXR`): `camera-access` y cualquier nombre fuera del vocabulario cerrado NUNCA pasan (§3 k).
 * - `local-floor` va requerida: es la referencia de la Trinity (origen en el suelo) y la librería la exige igual.
 * - `plane-detection` no va nunca en opcionales: Meta solo la concede como `requiredFeatures` en Quest. Se pide
 *   requerida únicamente si la persona eligió «mundo AR con mi habitación» y la plataforma la ofrece; si no, ni se pide.
 */
export function funcionesAPedir(c: CapacidadesXR, o: { habitacion?: boolean } = {}): FuncionesPedidas {
    const vistas = new Set<FuncionXR>();
    const opcionales: FuncionXR[] = [];
    const requeridas: FuncionXR[] = [];
    for (const f of c.funciones) {
        if (!esFuncionXR(f) || vistas.has(f)) continue;
        vistas.add(f);
        if (f === "local-floor") requeridas.push(f);
        else if (f === "plane-detection") {
            if (o.habitacion === true) requeridas.push(f);
        } else opcionales.push(f);
    }
    return { opcionales, requeridas };
}

export interface AjustesSesion {
    /** Foveación fija 0–1 (1 = la más agresiva). */
    foveacion: number;
    /** Refresco objetivo en Hz; `undefined` = no hay lista de soportados y se deja el del navegador. */
    frameRate: number | undefined;
    /** Escala del framebuffer relativa a la recomendada (1 = lo normal). Solo al crear la sesión. */
    escala: number;
}

/**
 * `frameRate` = `p.refrescoPreferidoHz` si el visor lo admite; si no, el mayor soportado por debajo
 * (`refrescoInferior`); si no hay ninguno por debajo, el menor soportado (el más cercano por encima).
 */
export function ajustesDePerfil(p: PerfilCalidad, soportados?: readonly number[]): AjustesSesion {
    const foveacion = Number.isFinite(p.foveacion) ? acotar(p.foveacion, 0, 1) : 0;
    const escala = Number.isFinite(p.escalaResolucion) && p.escalaResolucion > 0 ? p.escalaResolucion : 1;
    const lista = (soportados ?? []).filter((h) => Number.isFinite(h) && h > 0);
    if (lista.length === 0) return { foveacion, frameRate: undefined, escala };
    const preferido = p.refrescoPreferidoHz;
    const frameRate = lista.includes(preferido) ? preferido : (refrescoInferior(preferido, lista) ?? Math.min(...lista));
    return { foveacion, frameRate, escala };
}

/** Escala para `frameBufferScaling`: nunca por encima de la nativa del visor; si no se conoce, como mucho 1. */
export function escalaParaSesion(escala: number, maxNativa: number): number {
    return Number.isFinite(maxNativa) && maxNativa > 0 ? Math.min(escala, maxNativa) : Math.min(escala, 1);
}

/** Lo mínimo de `XRSession` que se usa (estándar en navegadores de visor; opcional en el resto). */
export interface SesionAjustable {
    updateTargetFrameRate?(n: number): Promise<void>;
    supportedFrameRates?: ArrayLike<number>;
}

/** Lo mínimo del `WebGLRenderer` de three que se usa. */
export interface RendererAjustable {
    xr?: { setFoveation?(n: number): void };
}

export type AjusteFallido = "foveacion" | "frameRate";

/**
 * Aplica foveación y refresco a una sesión abierta y devuelve cuántos ajustes pidió. Cada llamada va en su
 * try/catch y el rechazo asíncrono de `updateTargetFrameRate` se recoge: un navegador sin una función no rompe
 * nada. Un refresco que el visor no lista en `supportedFrameRates` no se pide (lo rechazaría).
 */
export function aplicarASesion(
    sesion: SesionAjustable,
    renderer: RendererAjustable,
    ajustes: Pick<AjustesSesion, "foveacion" | "frameRate">,
    alFallar?: (ajuste: AjusteFallido, error: unknown) => void,
): number {
    let aplicados = 0;
    try {
        const xr = renderer.xr;
        if (xr && typeof xr.setFoveation === "function") {
            xr.setFoveation(ajustes.foveacion);
            aplicados++;
        }
    } catch (e) {
        alFallar?.("foveacion", e);
    }
    try {
        const hz = ajustes.frameRate;
        const soportados = sesion.supportedFrameRates ? Array.from(sesion.supportedFrameRates) : [];
        const admitido = hz !== undefined && (soportados.length === 0 || soportados.includes(hz));
        if (admitido && typeof sesion.updateTargetFrameRate === "function") {
            const promesa = sesion.updateTargetFrameRate(hz);
            aplicados++;
            Promise.resolve(promesa).catch((e: unknown) => alFallar?.("frameRate", e));
        }
    } catch (e) {
        alFallar?.("frameRate", e);
    }
    return aplicados;
}
