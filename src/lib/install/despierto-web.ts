/**
 * «Despierto» en el navegador — la parte PURA (sin navegador).
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-11-01) Alex: «que funcionen los procesos en segundo plano aun con las
 * pantallas cerradas». La Screen Wake Lock del navegador mantiene la pantalla
 * mientras esta pestaña tiene un proceso largo (transmisión, estación,
 * contenedor); NO puede evitar que el equipo duerma con la tapa cerrada: para
 * eso la app nativa o `keepalive` (architecture/neurona-insomne.md). Aquí vive
 * la máquina de estados de cuándo pedir y cuándo soltar; el lado con navegador
 * (`useDespierto`) solo ejecuta la acción que esta decide.
 */

/** Tipos de proceso del OS que merecen bloqueo de pantalla. */
export type ProcesoLargo = "transmision" | "estacion" | "contenedor";

/** Lo que pasa en la pestaña; el lado con navegador despacha estos eventos. */
export type EventoDespierto =
    | "proceso-inicia" | "proceso-termina" | "pestaña-visible" | "pestaña-oculta"
    | "bloqueo-pedido" | "bloqueo-suelto" | "bloqueo-fallo";

/** Lo que el lado con navegador debe hacer ahora mismo. */
export type AccionDespierto = "pedir" | "soltar" | "nada";

/** Estado que consume y produce la máquina: todo inmutable.
 * proceso: hay un proceso largo en curso · visible: la pestaña está a la vista
 * soportado: navigator.wakeLock existe · bloqueo: en firme · falloReciente: la
 * última petición falló y el reintento espera una señal fresca.
 */
export interface EstadoDespierto {
    proceso: boolean;
    visible: boolean;
    soportado: boolean;
    bloqueo: boolean;
    falloReciente: boolean;
}

/** Fase legible de ESTE dispositivo, para el aviso de la interfaz. */
export type EtapaDespierto = "activo" | "oculta" | "suelto" | "sin-soporte";

/** ¿Corresponde tener el bloqueo en firme con este estado? */
function haberBloqueo(e: EstadoDespierto): boolean {
    return e.proceso && e.visible && e.soportado;
}

/** Un evento de la pestaña → el siguiente estado y la acción a ejecutar.
 * PURA: nunca toca `navigator` ni el DOM; quien la llama ejecuta la acción.
 * Tras `bloqueo-fallo` no se insiste en bucle: se reintenta solo al volver
 * visible o al arrancar un proceso nuevo.
 */
export function avanzarDespierto(e: EstadoDespierto, evento: EventoDespierto): { estado: EstadoDespierto; accion: AccionDespierto } {
    // Sin soporte todo cae en «nada»: la fase queda «sin-soporte».
    if (!e.soportado) return { estado: e, accion: "nada" };

    let estado: EstadoDespierto;
    switch (evento) {
        case "proceso-inicia":
            estado = { ...e, proceso: true, falloReciente: false };
            break;
        case "proceso-termina":
            estado = { ...e, proceso: false, bloqueo: false, falloReciente: false };
            break;
        case "pestaña-visible":
            estado = { ...e, visible: true, falloReciente: false };
            break;
        case "pestaña-oculta":
            estado = { ...e, visible: false, bloqueo: false };
            break;
        case "bloqueo-pedido":
            estado = { ...e, bloqueo: true, falloReciente: false };
            break;
        case "bloqueo-suelto":
            estado = { ...e, bloqueo: false };
            break;
        case "bloqueo-fallo":
            estado = { ...e, bloqueo: false, falloReciente: true };
            break;
    }

    const deseado = haberBloqueo(estado);
    if (deseado && !estado.bloqueo && !estado.falloReciente) return { estado, accion: "pedir" };
    if (!deseado && e.bloqueo) return { estado, accion: "soltar" };
    return { estado, accion: "nada" };
}

/** ¿Este tipo de proceso merece pedir el bloqueo de pantalla? */
export function esProcesoLargo(tipo: string): tipo is ProcesoLargo {
    return tipo === "transmision" || tipo === "estacion" || tipo === "contenedor";
}

/** La máquina vista por un navegador sin Wake Lock (o sin proceso todavía). */
export const ESTADO_INICIAL_DESPIERTO: EstadoDespierto = {
    proceso: false, visible: true, soportado: true, bloqueo: false, falloReciente: false,
};

/** Igual, pero para un navegador que no ofrece Wake Lock. */
export function estadoDespierto(soportado: boolean): EstadoDespierto {
    return { ...ESTADO_INICIAL_DESPIERTO, soportado };
}

/** Fase legible: lo que enseña el aviso en cada momento. */
export function etapaDespierto(e: EstadoDespierto): EtapaDespierto {
    if (!e.soportado) return "sin-soporte";
    if (e.proceso && e.bloqueo && e.visible) return "activo";
    return !e.proceso || !e.visible ? (e.proceso ? "oculta" : "suelto") : "suelto";
}

/**
 * Aviso honesto de la interfaz, por fase. El navegador NUNCA puede mantener el
 * equipo despierto con la pantalla apagada ni con la tapa cerrada: lo dice, y
 * ofrece la app nativa o `keepalive` como salida de verdad.
 */
export function avisoDespierto(fase: EtapaDespierto): string {
    switch (fase) {
        case "activo":
            return "El navegador mantiene la pantalla encendida mientras dura el proceso. Aun así, con la tapa cerrada el equipo se dormirá igual: para procesos largos usa la app nativa o keepalive.";
        case "oculta":
            return "Pestaña en segundo plano: el navegador soltó el bloqueo y lo volverá a pedir al volver. Con la tapa cerrada el equipo se dormirá igual: usa la app nativa o keepalive.";
        case "sin-soporte":
            return "Este navegador no ofrece Screen Wake Lock. Para no perder el proceso usa la app nativa o keepalive.";
        default:
            return "Sin proceso largo no hay bloqueo: se pide al iniciar una transmisión, la estación o un contenedor. Con la tapa cerrada el equipo se dormirá igual (app nativa o keepalive).";
    }
}
