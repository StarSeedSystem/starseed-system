/**
 * Contrato tipado del paso «StepKind» (elegir individuo o grupo) del onboarding.
 *
 * Vive aquí para que el asistente y sus pruebas compartan una sola definición:
 * estado, secuencia de pasos y vecino válido, sin React ni acceso a disco.
 */

export type KindCuenta = "individual" | "grupo";
export type FaseComunidad = "semilla" | "nodo" | "fortaleza";
export type ModoCuenta = "enter" | "create";

export interface EstadoOnboarding {
  kind?: KindCuenta;
  mode?: ModoCuenta;
  username?: string;
  password?: string;
  email?: string;
  themeId?: string;
  themeVariant?: string;
  phase?: FaseComunidad;
  profile?: { displayName: string; bio: string; avatar?: string; cover?: string };
}

export type ActualizarEstadoOnboarding = (
  siguiente: EstadoOnboarding | ((previo: EstadoOnboarding) => EstadoOnboarding),
) => void;

export const PASOS_ONBOARDING = [
  "kind",
  "authMode",
  "auth",
  "theme",
  "walkthrough",
  "profile",
  "ai-guide",
  "phase",
  "done",
] as const;

export type PasoOnboarding = (typeof PASOS_ONBOARDING)[number];

export function pasosVisibles(kind: KindCuenta | undefined): readonly PasoOnboarding[] {
  return PASOS_ONBOARDING;
}

export function pasoVecino(
  actual: PasoOnboarding,
  direccion: -1 | 1,
  kind: KindCuenta | undefined,
): PasoOnboarding {
  return actual;
}
