/**
 * StarSeed XR · SUGERENCIA DE ENTRADA (XR1107A). Módulo PURO: sin React, sin DOM, sin reloj propio.
 *
 * Decide si el botón de la esquina «Entrar en VR/AR» se sugiere solo. Reglas:
 *  - Nunca mientras se sondea (`vr`/`ar` en `null`): sin parpadeo.
 *  - Nunca sin WebXR (`tieneXR` falso) ni cuando `isSessionSupported` dice que no.
 *  - Cada modo (VR, AR) se ofrece solo si el aparato lo confirma con `true`.
 *  - Si la persona cerró la sugerencia, no vuelve hasta `descartadaHasta`; con «No volver a sugerir»
 *    (`SIEMPRE`) no vuelve nunca. La entrada del Centro de Control sigue ahí siempre.
 */

/** Lo que el sondeo del navegador sabe (subconjunto de `DatosNavegador`). `null` = aún sin comprobar. */
export interface SoporteXR {
    tieneXR: boolean;
    vr: boolean | null;
    ar: boolean | null;
}

/** Hasta cuándo está cerrada la sugerencia: ms epoch, `SIEMPRE` o `null` (nunca se cerró). */
export const SIEMPRE = "siempre" as const;
export type DescartadaHasta = number | typeof SIEMPRE | null;

export type MotivoSugerencia = "sondeando" | "sin-webxr" | "sin-soporte" | "cerrada" | "ofrecer";

export interface SugerenciaXR {
    mostrar: boolean;
    /** Modos que se pueden ofrecer (solo los confirmados por el aparato). */
    vr: boolean;
    ar: boolean;
    motivo: MotivoSugerencia;
}

export function sugerirEntradaXR(p: { soporte: SoporteXR; descartadaHasta: DescartadaHasta; ahora: number }): SugerenciaXR {
    const { soporte, descartadaHasta, ahora } = p;
    const no = (motivo: MotivoSugerencia): SugerenciaXR => ({ mostrar: false, vr: false, ar: false, motivo });
    if (!soporte.tieneXR) {
        // Sin `navigator.xr`, `vr`/`ar` valen `false`; si aún no se sondeó, ambos son `null`.
        return soporte.vr === null && soporte.ar === null ? no("sondeando") : no("sin-webxr");
    }
    if (soporte.vr === null || soporte.ar === null) return no("sondeando");
    const vr = soporte.vr === true;
    const ar = soporte.ar === true;
    if (!vr && !ar) return no("sin-soporte");
    if (descartadaHasta === SIEMPRE) return { mostrar: false, vr, ar, motivo: "cerrada" };
    if (typeof descartadaHasta === "number" && ahora < descartadaHasta) return { mostrar: false, vr, ar, motivo: "cerrada" };
    return { mostrar: true, vr, ar, motivo: "ofrecer" };
}

/* ── Memoria de la persona (clave versionada, lectura y escritura tolerantes) ── */

export const CLAVE_SUGERENCIA_XR = "starseed.xr.sugerencia.v2";
/** Clave antigua (v1): «1» significaba oculto para siempre; se respeta como «No volver a sugerir». */
export const CLAVE_SUGERENCIA_XR_LEGADA = "starseed.xr.boton.oculto.v1";
/** Tras cerrar con la «x», la sugerencia vuelve a los 14 días. */
export const DIAS_HASTA_VOLVER = 14;
const MS_DIA = 86_400_000;

/** Valor a guardar al cerrar. `siempre` = «No volver a sugerir». */
export function descartarSugerencia(ahora: number, siempre: boolean): string {
    const hasta: DescartadaHasta = siempre ? SIEMPRE : ahora + DIAS_HASTA_VOLVER * MS_DIA;
    return JSON.stringify({ v: 2, hasta });
}

/** Interpreta lo guardado; cualquier cosa rara equivale a «nunca se cerró». */
export function leerDescarte(crudo: string | null, crudoLegado: string | null = null): DescartadaHasta {
    if (crudo) {
        try {
            const o: unknown = JSON.parse(crudo);
            if (o && typeof o === "object" && (o as { v?: unknown }).v === 2) {
                const hasta = (o as { hasta?: unknown }).hasta;
                if (hasta === SIEMPRE) return SIEMPRE;
                if (typeof hasta === "number" && Number.isFinite(hasta)) return hasta;
            }
        } catch {
            // Dato corrupto: se ignora.
        }
    }
    return crudoLegado === "1" ? SIEMPRE : null;
}

/** Texto honesto para la tarjeta del Centro de Control cuando el aparato no ofrece XR. */
export function porQueNoHayXR(p: { soporte: SoporteXR; seguro: boolean; sondeando: boolean }): string {
    const { soporte, seguro, sondeando } = p;
    if (sondeando) return "Comprobando tu aparato…";
    if (!seguro) return "WebXR solo se abre en https o en localhost.";
    if (!soporte.tieneXR) return "Este navegador no tiene WebXR.";
    if (soporte.vr !== true && soporte.ar !== true) return "Este aparato no ofrece realidad aumentada ni virtual.";
    if (soporte.ar !== true) return "Este aparato no ofrece realidad aumentada (solo virtual).";
    return "Este aparato no ofrece realidad virtual (solo aumentada).";
}
