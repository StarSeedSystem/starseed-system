/**
 * Eventos internos del Centro de Control (Logic/Este).
 * ----------------------------------------------------------------------------
 * Pequeño puente para que las pestañas (quick-settings-tab.tsx, etc.) puedan
 * pedir un cambio de pestaña activa al contenedor (control-center.tsx) sin
 * acoplarse directamente a su implementación. `detail.tab` es uno de los ids
 * de módulo: "system" | "quick" | "home" | "notif".
 */

export const CONTROL_CENTER_NAVIGATE_EVENT = "starseed:control-center-navigate";

export interface ControlCenterNavigateDetail {
    tab: string;
}
