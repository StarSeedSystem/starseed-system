/**
 * Cerrar la Bienvenida · Guía de StarSeed con Astraura (DSB1010 · 2026-10-10).
 *
 * POR QUÉ: Alex — «la ventana Bienvenida · Guía de StarSeed con Astraura no cierra con el botón
 * de cerrar». Desde el 2026-09-25 todos los diálogos llevan la X común del OS (`BotonCerrar`,
 * clases de CSS Module). El rito la escondía con `[&>button.absolute]:hidden` y no atendía
 * `onOpenChange`: como la X nueva ya no es un `button.absolute`, se VEÍA y no hacía nada.
 *
 * Regla desde hoy: cerrar la bienvenida FUNCIONA y equivale a «Saltar por ahora». Queda
 * POSPUESTA EN LA CUENTA (`onboarding_state.skipped`, que viaja a todas sus neuronas y medios),
 * así que no vuelve a abrirse sola en ningún otro sitio; se relanza a mano desde la guía o
 * Ajustes. El rito de ESTA pestaña se abandona para que una recarga no la reabra.
 *
 * Módulo PURO (sin React ni Supabase): las dependencias se inyectan y se prueban en Node.
 */

import type { OnboardingState } from "@/lib/onboarding/onboarding";

export interface DependenciasCierre {
  /** Calla la voz del rito (Astraura deja de narrar al instante). */
  callarVoz: () => void;
  /** Quita la ventana de la pantalla (primero: la respuesta al clic es inmediata). */
  ocultar: () => void;
  /** Abandona el rito de esta pestaña (sessionStorage), para que una recarga no lo reabra. */
  abandonarRito: () => void;
  /** Guarda en la cuenta (onboarding_state). Nunca debe bloquear el cierre. */
  guardar: (patch: Partial<OnboardingState>) => Promise<unknown>;
  /**
   * (INT1010D) Recuerda el cierre EN ESTE APARATO para esta cuenta. Sin esto, cuando la cuenta no se
   * puede leer (freno de consumo, sin red) el portero no ve el «pospuesto» y la reabre en cada página.
   */
  recordarLocal?: () => void;
  ahora?: () => Date;
}

/** El cambio que se guarda en la cuenta al cerrar: pospuesto, no completado. */
export function cambioAlCerrar(ahora: Date = new Date()): Partial<OnboardingState> {
  return { completed: false, skipped: true, skippedAt: ahora.toISOString() };
}

/**
 * Cierra la bienvenida. Orden pensado para que el clic SIEMPRE cierre: primero se calla y se
 * oculta (local, no puede fallar), luego se abandona el rito y por último se guarda en la cuenta;
 * un fallo de red al guardar no deja la ventana abierta (se devuelve `false` para avisar).
 */
export async function cerrarBienvenida(d: DependenciasCierre): Promise<boolean> {
  try { d.callarVoz(); } catch { /* sin voz: se cierra igual */ }
  d.ocultar();
  try { d.recordarLocal?.(); } catch { /* sin storage: se cierra igual */ }
  try { d.abandonarRito(); } catch { /* sin storage: se cierra igual */ }
  try {
    const r = await d.guardar(cambioAlCerrar(d.ahora ? d.ahora() : new Date()));
    return r !== null && r !== undefined;
  } catch {
    return false;
  }
}

/**
 * ¿Debe el portero global abrir la bienvenida SOLA? (OnboardingGate).
 *
 * Antes una cuenta sin @handle la veía en cada página de cada medio aunque la hubiera cerrado:
 * el portero miraba el perfil ANTES que el «pospuesto». Ahora lo pospuesto o completado en la
 * cuenta manda siempre; abrirla a mano (`starseed:open-onboarding`) sigue funcionando.
 */
export function debeAbrirseSola(p: {
  tienePerfil: boolean;
  estado: Pick<OnboardingState, "completed" | "skipped"> | null | undefined;
  ritoEnBienvenida: boolean;
  /** (INT1010D) Esta cuenta ya la cerró en este aparato (`cerradaEnEsteAparato`). */
  cerradaLocal?: boolean;
}): boolean {
  // (INT1010D · 2026-10-10) Lo cerrado aquí manda aunque la cuenta no se pueda leer: con el freno
  // diario de Supabase `getOnboarding()` devuelve el estado por defecto y la guía volvía en cada página.
  if (p.cerradaLocal) return false;
  const e = p.estado ?? { completed: false, skipped: false };
  if (e.completed || e.skipped) return false;
  if (!p.tienePerfil) return true;
  return p.ritoEnBienvenida;
}

/** Clave local (por aparato) de las cuentas que ya cerraron la bienvenida. INT1010D · 2026-10-10. */
export const CLAVE_CIERRE_LOCAL = "starseed.bienvenida.cerrada.v1";

export interface AlmacenCierre {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function leerCierres(almacen: AlmacenCierre | null | undefined): Record<string, string> {
  try {
    const crudo = almacen?.getItem(CLAVE_CIERRE_LOCAL);
    const datos = crudo ? JSON.parse(crudo) : null;
    return datos && typeof datos === "object" && !Array.isArray(datos) ? (datos as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Apunta que `cuenta` cerró la bienvenida en este aparato. Nunca lanza. */
export function recordarCierreLocal(cuenta: string | null | undefined, almacen: AlmacenCierre | null | undefined, ahora: Date = new Date()): void {
  if (!cuenta || !almacen) return;
  try {
    const cierres = leerCierres(almacen);
    cierres[cuenta] = ahora.toISOString();
    almacen.setItem(CLAVE_CIERRE_LOCAL, JSON.stringify(cierres));
  } catch {
    /* sin storage: el cierre de la cuenta sigue valiendo */
  }
}

/** ¿`cuenta` ya cerró la bienvenida en este aparato? Otra cuenta en el mismo aparato no cuenta. */
export function cerradaEnEsteAparato(cuenta: string | null | undefined, almacen: AlmacenCierre | null | undefined): boolean {
  if (!cuenta) return false;
  return typeof leerCierres(almacen)[cuenta] === "string";
}
