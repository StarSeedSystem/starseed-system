/**
 * Reparación de un medidor de Genesis (2026-10-23) — lo que escribe `scripts/puente/reparar_medidor.py`
 * en `starseed_memory_root/mando/comprobaciones/reparacion-<medidor>.json` y lee el botón «Reparar».
 *
 * Alex: «agrega un botón de reparar junto al de comprobar en los medidores; debería funcionar
 * automáticamente por la supervisión de los directores… pero aun así agrégalo para poder hacerlo
 * manualmente». El mismo archivo lo escriben el botón (origen «boton») y los directores («directores»).
 */

export type VeredictoReparacion = { proceso: string; estado: string; detalle: string };

export type AccionReparacion = {
    accion: string;
    titulo: string;
    por_que: string;
    ok?: boolean;
    resultado?: string;
    segundos?: number;
};

export type ResultadoReparacion = "reparado" | "mejorado" | "sigue" | "nada" | "sin_reparacion" | "ocupado";

export type Reparacion = {
    medidor: string;
    origen?: string;
    empezado: string;
    terminado: string | null;
    resultado?: ResultadoReparacion;
    resumen: string;
    /** Mientras trabaja: «comprobando» o «reparando: <acción>». */
    paso?: string;
    acciones: AccionReparacion[];
    sin_reparacion?: string[];
    antes?: { resumen?: string | null; veredictos?: VeredictoReparacion[] };
    despues?: { resumen?: string | null; veredictos?: VeredictoReparacion[] };
};

/** Quién la hizo, en palabras: el botón eres tú; los directores, la supervisión automática. */
export function quienReparo(r: Pick<Reparacion, "origen">): string {
    return r.origen === "directores" ? "los directores (automática)" : "ti";
}

/** Color del resultado: verde si quedó sano, ámbar si a medias, rojo si sigue o no hay arreglo. */
export function tonoReparacion(resultado: ResultadoReparacion | undefined): "ok" | "aviso" | "peligro" | "normal" {
    if (resultado === "reparado" || resultado === "nada") return "ok";
    if (resultado === "mejorado" || resultado === "ocupado") return "aviso";
    if (resultado === "sigue" || resultado === "sin_reparacion") return "peligro";
    return "normal";
}

/** Una reparación vieja no se enseña como si fuera de ahora (mismo criterio que «Comprobar»). */
export const MINUTOS_REPARACION_VIGENTE = 60;

export function reparacionVigente(r: Pick<Reparacion, "terminado"> | null | undefined, ahoraMs = Date.now()): boolean {
    if (!r?.terminado) return false;
    const t = Date.parse(r.terminado);
    return Number.isFinite(t) && ahoraMs - t <= MINUTOS_REPARACION_VIGENTE * 60_000;
}
