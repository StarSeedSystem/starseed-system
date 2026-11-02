/**
 * Neuronas despiertas mientras la pestaña corre un proceso largo (KAL1101E) — la parte PURA.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Alex (01-11): «que funcionen los procesos en segundo plano… siempre que esté abierto
 * el sistema». Mientras una pestaña de StarSeed corra una transmisión, una estación o un
 * contenedor, conviene pedir la Screen Wake Lock del navegador para que la pestaña no
 * se congelen los temporizadores; al acabar (o al ocultar la pestaña, que el navegador
 * suelta igualmente) se deja de pedir. Módulo sin navegador: todas las señales llegan
 * ya medidas y aquí solo se decide CUÁNDO pedir, CUÁNDO soltar y qué decir en la UI.
 *
 * Límite honesto que la UI debe enseñar: el bloqueo del navegador protege LA PESTAÑA
 * VISIBLE y no impide que el SISTEMA se duerma al cerrar la tapa o apagarse la pantalla.
 * Para procesos de verdad en segundo plano: la app nativa o keepalive
 * (brew/scoop/go install · `keepalive run -- <cmd>`).
 */

/** Los procesos largos que están en vivo en una pestaña de StarSeed OS. */
export type ProcesoLargo = "transmision" | "estacion" | "contenedor";

/** Señales del navegador y de esta pestaña, ya medidas fuera del módulo. */
export interface EntradaDespiertoWeb {
    /** ¿El navegador expone `navigator.wakeLock`? */
    soporte: boolean;
    /** ¿La pestaña está visible (`visibilityState === "visible"`)? */
    visible: boolean;
    /** Procesos largos vivos en esta pestaña; puede venir duplicado o sucio. */
    procesos: readonly string[];
    /** ¿El bloqueo de pantalla está ya concedido? */
    bloqueo: boolean;
}

export type DecisionDespiertoWeb = "pedir" | "soltar" | "nada";

/** Quita vacíos, blancos y duplicados: dos veces «estacion» es un proceso. */
export function normalizarProcesos(procesos: readonly string[]): string[] {
    const limpios: string[] = [];
    for (const p of procesos) {
        const t = p.trim();
        if (t !== "" && limpios.indexOf(t) === -1) limpios.push(t);
    }
    return limpios;
}

/** PURA: la decisión de la pestaña. Sin soporte o con pestaña oculta nunca se pide. */
export function decidirDespiertoWeb(entrada: EntradaDespiertoWeb): DecisionDespiertoWeb {
    if (!entrada.soporte || !entrada.visible) return entrada.bloqueo ? "soltar" : "nada";
    const importa = normalizarProcesos(entrada.procesos).length > 0;
    if (importa && !entrada.bloqueo) return "pedir";
    if (!importa && entrada.bloqueo) return "soltar";
    return "nada";
}

/** Aviso honesto constante para la tarjeta/UI: el navegador NO cuida del sistema. */
export const AVISO_PANTALLA_CERRADA =
    "El navegador solo puede mantener despierta la pantalla mientras esta pestaña está visible: " +
    "al apagarse la pantalla o cerrarse la tapa el sistema se duerme igual y tus tareas pasan a la colmena. " +
    "Para procesos largos de verdad en segundo plano, usa la app nativa o keepalive en el equipo.";

/** PURA: el texto de estado para la UI, en la voz del módulo. */
export function textoEstadoDespiertoWeb(entrada: EntradaDespiertoWeb): string {
    const procesos = normalizarProcesos(entrada.procesos);
    if (!entrada.soporte) return "Este navegador no permite el bloqueo de pantalla (sin Wake Lock).";
    if (!entrada.visible) return "Pestaña en segundo plano: el bloqueo queda suelto hasta que vuelvas.";
    if (procesos.length === 0) return "Sin procesos largos: no se pide bloqueo de pantalla.";
    const lista = procesos.map((p) => `«${p}»`).join(", ");
    const afirma = entrada.bloqueo ? "Manteniendo" : "Pedir bloqueo para";
    return `${afirma} la pantalla mientras corren ${procesos.length === 1 ? lista : `${procesos.length} procesos: ${lista}`}.`;
}
