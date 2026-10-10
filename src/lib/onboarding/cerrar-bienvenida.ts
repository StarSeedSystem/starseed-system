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
}): boolean {
  const e = p.estado ?? { completed: false, skipped: false };
  if (e.completed || e.skipped) return false;
  if (!p.tienePerfil) return true;
  return p.ritoEnBienvenida;
}
