/**
 * Orden de pasos del onboarding guiado (`/onboarding`).
 *
 * Módulo puro: sin disco, sin red, sin React. La página lo usa para avanzar y
 * retroceder, y las pruebas verifican que la fase comunitaria solo la cruza un
 * grupo.
 */

export const PASOS_ONBOARDING = [
  'kind', 'authMode', 'auth', 'theme', 'walkthrough', 'profile', 'ai-guide', 'phase', 'done',
] as const;

export type PasoOnboarding = (typeof PASOS_ONBOARDING)[number];

/** Cuenta elegida en el primer paso («kind»). */
export type CuentaOnboarding = 'individual' | 'grupo';

/** Pasos activos según la cuenta: solo un grupo pasa por la fase comunitaria. */
export function ordenPasos(cuenta: CuentaOnboarding | undefined): PasoOnboarding[] {
  return cuenta === 'grupo'
    ? [...PASOS_ONBOARDING]
    : PASOS_ONBOARDING.filter((paso) => paso !== 'phase');
}

/** Paso siguiente o `null` si ya se llegó al final. */
export function siguientePaso(
  paso: PasoOnboarding,
  cuenta: CuentaOnboarding | undefined,
): PasoOnboarding | null {
  const orden = ordenPasos(cuenta);
  const i = orden.indexOf(paso);
  if (i < 0 || i >= orden.length - 1) return null;
  return orden[i + 1];
}

/** Paso anterior o `null` si ya se está al inicio. */
export function anteriorPaso(
  paso: PasoOnboarding,
  cuenta: CuentaOnboarding | undefined,
): PasoOnboarding | null {
  const orden = ordenPasos(cuenta);
  const i = orden.indexOf(paso);
  if (i <= 0) return null;
  return orden[i - 1];
}
