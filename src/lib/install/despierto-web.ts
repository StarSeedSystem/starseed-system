/**
 * Despierto web (tarea 1101) — cuándo pedir y cómo perder el Wake Lock del
 * navegador mientras esta pestaña sostiene un proceso largo.
 *
 * Quien transmite, manda voz a la estación o aloja un contenedor de agentes
 * pide `navigator.wakeLock.request("screen")`; lo suelta al acabar o al
 * ocultarse la pestaña, y vuelve a pedirlo cuando vuelve a verse. Esta
 * capa es la LÓGICA PURA de esa decisión, sin DOM ni red, para probarla
 * entera; el componente que la cablee queda para su propia tarea.
 *
 * El límite honesto que este módulo sabe decir: el navegador solo puede
 * mantener la pantalla encendida mientras la pestaña está visible. Con la
 * pantalla cerrada el equipo duerme por diseño del sistema, y un Wake Lock
 * no lo impide: para eso están la app nativa de StarSeed OS o keepalive.
 */

/** Procesos largos que sostienen un Wake Lock en una pestaña del OS. */
export type ProcesoLargo = "transmision" | "estacion" | "contenedor";

export const PROCESOS_LARGOS: readonly ProcesoLargo[] = [
    "transmision",
    "estacion",
    "contenedor",
];

/** Cuatro acciones concretas que puede tomar quien cablea el helper. */
export type AccionDespiertoWeb = "pedir" | "soltar" | "nada" | "sin-soporte";

/** Qué ve ahora mismo la pestaña que quiere mantenerse despierta. */
export interface DespiertoWebEntrada {
    /** Proceso largo en marcha en esta pestaña, o `null` si ya terminó. */
    proceso: ProcesoLargo | null;
    /** La pestaña está visible (no oculta, no minimizada, no otra). */
    visible: boolean;
    /** Este navegador ofrece `navigator.wakeLock`. */
    soportaWakeLock: boolean;
    /** Hay un bloqueo de pantalla vivo ahora mismo en esta pestaña. */
    tieneBloqueo: boolean;
}

/**
 * PURA: qué hacer con el Wake Lock en el estado dado. Nunca propone «pedir»
 * sin soporte, sin proceso a la vista o con la pestaña oculta (el navegador
 * suelta el bloqueo solo al ocultarla); nunca deja un bloqueo vivo tras
 * terminar el proceso.
 */
export function decidirDespiertoWeb(entrada: DespiertoWebEntrada): AccionDespiertoWeb {
    if (!entrada.soportaWakeLock) {
        return entrada.tieneBloqueo ? "soltar" : "sin-soporte";
    }
    if (!entrada.proceso || !entrada.visible) {
        return entrada.tieneBloqueo ? "soltar" : "nada";
    }
    return entrada.tieneBloqueo ? "nada" : "pedir";
}

const ETIQUETAS: Record<ProcesoLargo, string> = {
    transmision: "Transmisión en vivo",
    estacion: "Estación de voz",
    contenedor: "Contenedor de agentes",
};

/** PURA: nombre legible de un proceso largo, para avisos y tarjetas. */
export function etiquetaProcesoLargo(proceso: ProcesoLargo): string {
    return ETIQUETAS[proceso];
}

/** PURA: si un id del sistema (p. ej. de una ruta o evento) es un proceso largo. */
export function esProcesoLargo(id: string): id is ProcesoLargo {
    return (PROCESOS_LARGOS as readonly string[]).includes(id);
}

/**
 * PURA: el aviso honesto asociado al Wake Lock de esta pestaña. Con soporte o
 * sin él, la promesa es la misma y modesta: mientras la pestaña esté visible
 * la pantalla se mantiene; el navegador NO puede mantener el equipo despierto
 * con la pantalla cerrada, así que se ofrecen la app nativa o keepalive.
 */
export function avisoDespiertoWeb(soportaWakeLock: boolean): string {
    if (!soportaWakeLock) {
        return (
            "Este navegador no ofrece Wake Lock, así que no puede mantener la pantalla " +
            "encendida. Con la pestaña oculta o la pantalla cerrada el equipo duerme y el " +
            "proceso se detiene: usa la app nativa de StarSeed OS o keepalive."
        );
    }
    return (
        "El navegador mantiene la pantalla encendida solo mientras esta pestaña esté visible. " +
        "Con la pantalla cerrada el equipo duerme por diseño del sistema, aunque el Wake Lock " +
        "siga vivo: para esos procesos usa la app nativa de StarSeed OS o keepalive."
    );
}
