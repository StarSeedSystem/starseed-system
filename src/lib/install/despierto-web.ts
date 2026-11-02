/**
 * KAL1101E · Neuronas despiertas con la pantalla cerrada (keepalive, lado web)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica PURA de cuándo pedir y cuándo soltar la Screen Wake Lock del
 * navegador mientras una pestaña de StarSeed tiene un proceso largo
 * (transmisión, estación, contenedor). El componente que la use pide al
 * entrar y suelta al acabar, al ocultarse la pestaña o si el proceso muere;
 * reintenta al volver a ser visible.
 *
 * Aviso honesto (regla de Alex): la Wake Lock del navegador mantiene
 * encendida la PANTALLA mientras la pestaña está en primer plano; no evita
 * que el equipo duerma al cerrar la tapa ni con el navegador en segundo
 * plano. Para procesos que deben seguir sin mirar la pantalla, la app
 * nativa o `keepalive` (aserciones de IOKit / peticiones Windows / inhibitor
 * de systemd-logind) son el camino; si la neurona va a dormir igual, sus
 * tareas pasan al A1 (colmena).
 */

export interface EntradaDespierto {
    /** Hay un proceso largo en marcha en esta pestaña. */
    proceso: boolean;
    /** La pestaña está en primer plano (visibilityState === "visible"). */
    visible: boolean;
    /** El navegador expone `navigator.wakeLock`. */
    soportado: boolean;
    /** Ya hay una Wake Lock pedida y sin soltar. */
    bloqueoActivo: boolean;
}

export type AccionDespierto = "pedir" | "soltar" | "nada";

/** PURA: qué hacer con la Wake Lock dada la situación actual. */
export function decidirDespierto(e: EntradaDespierto): AccionDespierto {
    if (!e.soportado) return "nada";
    if (!e.proceso) return e.bloqueoActivo ? "soltar" : "nada";
    if (!e.visible) return e.bloqueoActivo ? "soltar" : "nada";
    return e.bloqueoActivo ? "nada" : "pedir";
}

/** PURA: texto honesto para la interfaz, según haya o no soporte. */
export function avisoDespierto(soportado: boolean): string {
    if (soportado) {
        return (
            "La pantalla se mantiene encendida mientras el proceso corre y la pestaña " +
            "está a la vista. Ojo: cerrar la tapa duerme el equipo igual, y con la " +
            "pestaña en segundo plano el navegador suelta el bloqueo. Para procesos " +
            "que deben seguir sin ti, usa la app nativa o keepalive."
        );
    }
    return (
        "Este navegador no permite Wake Lock. Además, ningún navegador puede " +
        "mantener el equipo despierto con la tapa cerrada: para eso están la app " +
        "nativa o keepalive; si la neurona va a dormir igual, sus tareas pasan al A1."
    );
}
