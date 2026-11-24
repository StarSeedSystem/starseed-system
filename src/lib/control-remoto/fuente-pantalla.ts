/**
 * RST1116A · regla pura de la fuente de pantalla: lo que se pide («auto» | «proyeccion»), lo que
 * contesta el aparato («accesibilidad» | «proyeccion» | null), el veredicto (¿se cumplió?) y el rótulo
 * para la persona. Sin red, sin disco, sin `node:*`.
 */

export type FuentePedida = "auto" | "proyeccion";

export const FUENTE_DEFECTO: FuentePedida = "auto";

export type FuenteReal = "accesibilidad" | "proyeccion";

export function fuentePedidaValida(x: unknown): FuentePedida {
    return x === "proyeccion" ? "proyeccion" : "auto";
}

export interface VeredictoFuente {
    cumplida: boolean;
    aviso: string | null;
}

export function veredictoFuente(pedida: FuentePedida, real: FuenteReal | null): VeredictoFuente {
    if (pedida === "auto") {
        return { cumplida: true, aviso: null };
    }
    if (real === null) {
        return { cumplida: false, aviso: null };
    }
    if (real === "proyeccion") {
        return { cumplida: true, aviso: null };
    }
    return {
        cumplida: false,
        aviso:
            "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
    };
}

export function rotuloFuente(real: FuenteReal | null): string {
    if (real === "proyeccion") return "Pantalla fluida (proyección)";
    if (real === "accesibilidad") return "Pantalla por accesibilidad";
    return "Pantalla: aún sin fuente";
}

// ── CTL1118F · la pantalla fluida es lo de siempre ───────────────────────────────────────────────

/** Cuánto espera el aparato a que su persona conteste el diálogo de la pantalla fluida antes de dejarlo estar (sigue con accesibilidad). */
export const ESPERA_FLUIDA_MS = 90_000;
/** Cada cuánto mira si la persona ya dio el «Sí» (una lectura de capacidades; no vuelve a preguntar nada). */
export const SONDEO_FLUIDA_MS = 1500;

export function fuenteRealValida(x: unknown): FuenteReal | null {
    return x === "proyeccion" || x === "accesibilidad" ? x : null;
}

/** `control_capacidades().pantalla.proyeccion`: el «Sí» de ESTA sesión está dado en el aparato. */
export function proyeccionConcedida(cap: unknown): boolean {
    const p = cap && typeof cap === "object" ? (cap as { pantalla?: unknown }).pantalla : undefined;
    return !!p && typeof p === "object" && (p as { proyeccion?: unknown }).proyeccion === true;
}

/** `control_capacidades().pantalla.fuente_activa`: la fuente que escribe cuadros AHORA según el aparato (null: no lo dijo o ninguna). */
export function fuenteActivaDe(cap: unknown): FuenteReal | null {
    const p = cap && typeof cap === "object" ? (cap as { pantalla?: unknown }).pantalla : undefined;
    return p && typeof p === "object" ? fuenteRealValida((p as { fuente_activa?: unknown }).fuente_activa) : null;
}

/**
 * ¿Hay que pedir la pantalla fluida? Solo si va por accesibilidad, UNA vez por sesión por sí solo (`pedidas` = las ya hechas) y, además,
 * cada vez que la persona lo pida (`manual`). Nunca en bucle: sin «Sí» el aparato sigue con accesibilidad.
 */
export function debePedirFluida(real: FuenteReal | null, pedidas: number, manual: boolean): boolean {
    return real === "accesibilidad" && (manual || pedidas === 0);
}

/** Los cuadros por segundo tal como se enseñan: medidos, con un decimal por debajo de 10 y sin decimales por encima. */
export function textoFps(fps: number | undefined): string | null {
    if (fps === undefined || !Number.isFinite(fps) || fps < 0) return null;
    return fps < 10 ? fps.toFixed(1).replace(".", ",") : String(Math.round(fps));
}

/** «Pantalla por accesibilidad · 2,9 cuadros/s»: la fuente REAL y lo medido; sin número, solo la fuente. */
export function rotuloFuenteMedida(real: FuenteReal | null, fps?: number): string {
    const f = textoFps(fps);
    return f === null || real === null ? rotuloFuente(real) : `${rotuloFuente(real)} · ${f} cuadros/s`;
}

/** Una línea para quien manda cuando la pantalla va por accesibilidad: la fluida se acepta EN el aparato (nadie la acepta por la persona). */
export function ayudaFluida(real: FuenteReal | null): string | null {
    return real === "accesibilidad" ? "Va por accesibilidad (pocos cuadros por segundo). En el aparato se puede aceptar la pantalla fluida." : null;
}

/** CTL1124C: si el aparato es Linux y no tiene WebRTC utilizable, la pantalla no se para por «sin oferta»;
 *  sigue sirviendo cuadros por la malla (misma vía que el Mac controlado). Pura: sin E/S, sin red. */
export function esModoMalla(sistemaOperativo: string, hayWebRtc: boolean): boolean {
    return sistemaOperativo === "linux" && !hayWebRtc;
}

/** CTL1124C: tiempo de gracia (ms) antes de exigir malla en Linux sin WebRTC. */
export const GRACIA_MALLA_MS = 30_000;

/** CTL1124C: vigencia de la malla (ms) tras la última petición; sin peticiones se para con «sin-malla». */
export const VIGENCIA_MALLA_MS = 8_000;

