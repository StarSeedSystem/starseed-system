/**
 * StarSeed XR · CONFORT Y ACCESIBILIDAD. Giro por saltos, viñeta, altura, subtítulos, movimiento reducido,
 * una mano y tamaño de texto. Lo persistido (localStorage / cuenta) se SANEA al leerlo —una preferencia vieja
 * o rota nunca deja a nadie sin poder salir ni mareado— y el movimiento reducido manda sobre todo lo demás.
 * Regla de la casa (CLAUDE.md, propagación de actualizaciones): al añadir un campo, `sanearConfort` le da su
 * valor por defecto a quien ya tenía la configuración guardada. Módulo PURO.
 */
import type { Mano, Postura } from "./tipos";
import { acotar } from "./tipos";

export const ANGULOS_SALTO = [15, 30, 45, 60, 90] as const;
export type AnguloSalto = (typeof ANGULOS_SALTO)[number];

export interface PreferenciasConfort {
    giro: "saltos" | "continuo";
    anguloSalto: AnguloSalto;
    vineta: "auto" | "siempre" | "nunca";
    /** 0–1: cuánto cierra la viñeta en su máximo. */
    fuerzaVineta: number;
    locomocion: "teletransporte" | "continua" | "ninguna";
    subtitulos: boolean;
    movimientoReducido: boolean;
    contrasteAlto: boolean;
    reducirTransparencia: boolean;
    postura: Postura;
    manoDominante: Mano;
    /** 0,8–1,5. */
    escala: number;
    /** Altura de ojos fijada a mano (m); `null` = la que mide el visor. */
    alturaOjos: number | null;
    /** Tamaño angular mínimo de un texto (grados). */
    textoMinGrados: number;
}

export const CONFORT_DEFECTO: PreferenciasConfort = {
    giro: "saltos", anguloSalto: 30, vineta: "auto", fuerzaVineta: 0.6, locomocion: "teletransporte", subtitulos: true,
    movimientoReducido: false, contrasteAlto: false, reducirTransparencia: false, postura: "de-pie", manoDominante: "derecha",
    escala: 1, alturaOjos: null, textoMinGrados: 1,
};

const en = <T extends string | number>(v: unknown, lista: readonly T[], def: T): T => ((lista as readonly unknown[]).includes(v) ? (v as T) : def);
const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
const num = (v: unknown, min: number, max: number, def: number): number => (typeof v === "number" && Number.isFinite(v) ? acotar(v, min, max) : def);

/** El movimiento reducido (del sistema o de la persona) fija lo que marea: nada de giro continuo ni de caminar. */
export function aplicarMovimientoReducido(c: PreferenciasConfort): PreferenciasConfort {
    if (!c.movimientoReducido) return c;
    return { ...c, giro: "saltos", vineta: "siempre", fuerzaVineta: Math.max(c.fuerzaVineta, 0.6), locomocion: c.locomocion === "continua" ? "teletransporte" : c.locomocion };
}

/**
 * Lee preferencias de cualquier origen. Lo desconocido se ignora, lo inválido vuelve a su valor por defecto y
 * cada corrección se cuenta en `avisos` (para mostrarla en ajustes, nunca en silencio).
 */
export function sanearConfort(crudo: unknown, delSistema: { movimientoReducido?: boolean; contrasteAlto?: boolean; reducirTransparencia?: boolean } = {}): { confort: PreferenciasConfort; avisos: string[] } {
    console.log('sanearConfort called with crudo:', crudo, 'delSistema:', delSistema);
    const r = typeof crudo === "object" && crudo !== null && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : {};
    console.log('sanearConfort: r:', r);
    const d = CONFORT_DEFECTO;
    const avisos: string[] = [];
    const c: PreferenciasConfort = {
        giro: en(r.giro, ["saltos", "continuo"] as const, d.giro),
        anguloSalto: en(r.anguloSalto, ANGULOS_SALTO, d.anguloSalto),
        vineta: en(r.vineta, ["auto", "siempre", "nunca"] as const, d.vineta),
        fuerzaVineta: num(r.fuerzaVineta, 0, 1, d.fuerzaVineta),
        locomocion: en(r.locomocion, ["teletransporte", "continua", "ninguna"] as const, d.locomocion),
        subtitulos: bool(r.subtitulos, d.subtitulos),
        movimientoReducido: bool(r.movimientoReducido, d.movimientoReducido) || delSistema.movimientoReducido === true,
        contrasteAlto: bool(r.contrasteAlto, d.contrasteAlto) || delSistema.contrasteAlto === true,
        reducirTransparencia: bool(r.reducirTransparencia, d.reducirTransparencia) || delSistema.reducirTransparencia === true,
        postura: en(r.postura, ["de-pie", "sentado", "una-mano"] as const, d.postura),
        manoDominante: en(r.manoDominante, ["izquierda", "derecha"] as const, d.manoDominante),
        escala: num(r.escala, 0.8, 1.5, d.escala),
        alturaOjos: r.alturaOjos === null || r.alturaOjos === undefined ? null : num(r.alturaOjos, 0.8, 2.1, 1.6),
        textoMinGrados: num(r.textoMinGrados, 0.8, 3, d.textoMinGrados),
    };
    console.log('sanearConfort: c:', c);
    for (const k of Object.keys(r)) {
        if (!(k in d)) avisos.push(`Se ignoró «${k}»: no es una preferencia de confort.`);
        else if (JSON.stringify((c as unknown as Record<string, unknown>)[k]) !== JSON.stringify(r[k]) && r[k] !== undefined) avisos.push(`«${k}» tenía un valor no válido y se corrigió.`);
    }
    const final = aplicarMovimientoReducido(c);
    if (final.giro !== c.giro || final.locomocion !== c.locomocion) avisos.push("El movimiento reducido está activo: el giro es por saltos y no se camina de forma continua.");
    return { confort: final, avisos };
}

/**
 * Opacidad de la viñeta (0 = ninguna) según cuánto se mueve la persona por el mundo. Sube con la velocidad
 * angular (de 20 a 120 °/s) y lineal (de 0,5 a 3 m/s); jamás oscurece del todo (tope 0,85).
 */
export function opacidadVineta(c: PreferenciasConfort, mov: { lineal: number; angularGradosS: number }): number {
    if (c.vineta === "nunca" && !c.movimientoReducido) return 0;
    const ang = acotar((Math.abs(mov.angularGradosS) - 20) / 100, 0, 1);
    const lin = acotar((Math.abs(mov.lineal) - 0.5) / 2.5, 0, 1);
    const piso = c.vineta === "siempre" || c.movimientoReducido ? 0.25 : 0;
    return Math.min(0.85, Math.max(piso, Math.max(ang, lin)) * c.fuerzaVineta + (piso > 0 ? piso * 0.5 : 0));
}

/** Giro por saltos: el siguiente ángulo (rad) al girar a la izquierda (-1) o a la derecha (+1), alineado a la rejilla. */
export function siguienteGiro(yaw: number, dir: -1 | 1, c: PreferenciasConfort): number {
    const paso = (c.anguloSalto * Math.PI) / 180;
    const celda = Math.round(yaw / paso) * paso;
    return Math.abs(celda - yaw) < 1e-6 ? yaw + dir * paso : dir > 0 ? Math.ceil(yaw / paso) * paso : Math.floor(yaw / paso) * paso;
}

/** Alto mínimo (m) de una línea de texto a `distancia` m para que mida `grados` de arco. */
export const altoMinimoTexto = (distancia: number, grados: number): number => 2 * Math.max(0.1, distancia) * Math.tan((grados * Math.PI) / 360);
