/**
 * Eventos internos del Centro de Control (Logic/Este).
 * ----------------------------------------------------------------------------
 * Pequeño puente para que las pestañas (quick-settings-tab.tsx, etc.) puedan
 * pedir un cambio de pestaña activa al contenedor (control-center.tsx) sin
 * acoplarse directamente a su implementación. `detail.tab` es uno de los ids
 * de sección: "quick" (Inicio) | "grabar" | "home" (Atmósfera) | "conexiones"
 * | "notif" (Alertas) | "system" (Sistema).
 */

export const CONTROL_CENTER_NAVIGATE_EVENT = "starseed:control-center-navigate";

export interface ControlCenterNavigateDetail {
    tab: string;
}

/** Pide al Centro de Control que muestre la sección `tab` (si no está oculta). Nunca lanza. */
export function pedirSeccion(tab: string): void {
    try {
        window.dispatchEvent(new CustomEvent<ControlCenterNavigateDetail>(CONTROL_CENTER_NAVIGATE_EVENT, { detail: { tab } }));
    } catch {
        /* sin window (servidor) o sin CustomEvent: no hay nada que navegar */
    }
}

/*
 * Sección pendiente para cuando el Centro de Control aún no está montado (vive dentro de la cortina Logic y solo
 * se monta al abrirla). Quien abre la cortina para ir a una sección concreta la deja aquí; el Centro la toma
 * una vez al montarse. Ej.: la habilidad «grabar la pantalla» (`starseed:abrir-grabar`).
 */
let seccionPendiente: string | null = null;

export function pedirSeccionAlAbrir(tab: string): void {
    seccionPendiente = tab;
}

/** Devuelve la sección pendiente (si la hay) y la olvida. */
export function tomarSeccionPendiente(): string | null {
    const t = seccionPendiente;
    seccionPendiente = null;
    return t;
}
