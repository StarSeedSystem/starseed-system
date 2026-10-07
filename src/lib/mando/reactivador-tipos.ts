/**
 * Reactivador de todos los directores (2026-10-06): tipos y decisiones PURAS del parte, sin
 * nada de Node, para que el botón del navegador las pueda usar. La lectura del disco vive en
 * `reactivador.ts` (solo servidor).
 */
export type EstadoPaso = "ok" | "reparado" | "aviso" | "fallo";

export interface PasoReactivador {
    paso: string;
    estado: EstadoPaso;
    detalle?: string;
}

export interface InformeReactivador {
    t: string;
    origen?: string;
    enMarcha: boolean;
    pasos: PasoReactivador[];
    resumen: string;
    segundos?: number;
    /** Lo pone `informeVigente` cuando un parte «en marcha» lleva demasiado sin acabar. */
    colgado?: boolean;
}

/** Un parte en marcha que pasa de esto sin acabar se da por cortado (el proceso murió). */
export const TOPE_EN_MARCHA_MS = 10 * 60_000;

/** `t` del parte («YYYY-MM-DD HH:MM:SS», hora local de la Mac) en milisegundos. */
export function msDeInforme(t: string): number | null {
    const ms = Date.parse(t.replace(" ", "T"));
    return Number.isFinite(ms) ? ms : null;
}

/** PURA. Si el parte dice «en marcha» pero hace más de TOPE_EN_MARCHA_MS, se marca cortado. */
export function informeVigente(informe: InformeReactivador | null, ahora: number): InformeReactivador | null {
    if (!informe) return null;
    const ms = msDeInforme(informe.t);
    if (informe.enMarcha && ms !== null && ahora - ms > TOPE_EN_MARCHA_MS) {
        return { ...informe, enMarcha: false, colgado: true, resumen: "se cortó a medias: vuelve a lanzarlo" };
    }
    return informe;
}

/** PURA. ¿Se puede lanzar otro? Uno solo a la vez. */
export function puedeLanzar(informe: InformeReactivador | null, ahora: number): boolean {
    const v = informeVigente(informe, ahora);
    return !v?.enMarcha;
}

/** PURA. El tono del parte entero: el peor de sus pasos. */
export function tonoDelInforme(informe: InformeReactivador | null): EstadoPaso | "nada" {
    if (!informe || informe.pasos.length === 0) return "nada";
    const orden: EstadoPaso[] = ["fallo", "aviso", "reparado", "ok"];
    for (const e of orden) if (informe.pasos.some((p) => p.estado === e)) return e;
    return "ok";
}

/** PURA. «hace 3 min», «hace 2 h» o «ahora». */
export function haceCuanto(t: string, ahora: number): string {
    const ms = msDeInforme(t);
    if (ms === null) return "";
    const min = Math.max(0, Math.round((ahora - ms) / 60_000));
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    return `hace ${Math.round(min / 60)} h`;
}
