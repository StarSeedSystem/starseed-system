import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";

/** Tipo de cuenta elegido en el primer paso del onboarding. */
export type AccountKind = "individual" | "grupo";

/** Fase comunitaria, solo aplicable a cuentas de grupo. */
export type CommunityPhase = "semilla" | "nodo" | "fortaleza";

/** Estado persistido del onboarding; sustituye a los `any` de los pasos. */
export interface OnboardingState {
  kind?: AccountKind;
  mode?: "enter" | "create";
  username?: string;
  password?: string;
  email?: string;
  themeId?: string;
  themeVariant?: string;
  phase?: CommunityPhase;
  profile?: { displayName: string; bio: string; avatar?: string; cover?: string };
}

/** Orden canónico de pasos; la fase solo existe para cuentas de grupo. */
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

/** Firma tipada del `setState` que reciben los pasos. */
export type GuardarOnboarding = Dispatch<SetStateAction<OnboardingState>>;

export interface PropsPasoKind {
  state: OnboardingState;
  setState: GuardarOnboarding;
  onNext: () => void;
}

export interface PropsTarjetaTipo {
  icon: LucideIcon;
  label: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}

/**
 * Pasos visibles para un tipo de cuenta. Las cuentas individuales saltan
 * «phase»; sin tipo elegido se asume el recorrido individual.
 */
export function ordenDePasos(kind: AccountKind | undefined): PasoOnboarding[] {
  if (kind === "grupo") return [...PASOS_ONBOARDING];
  return PASOS_ONBOARDING.filter((paso) => paso !== "phase");
}

/** Índice del paso dentro del recorrido visible; -1 si no pertenece. */
export function indiceDePaso(paso: PasoOnboarding, kind: AccountKind | undefined): number {
  return ordenDePasos(kind).indexOf(paso);
}

/** Paso siguiente del recorrido, o null al final. */
export function pasoSiguiente(
  paso: PasoOnboarding,
  kind: AccountKind | undefined,
): PasoOnboarding | null {
  const orden = ordenDePasos(kind);
  const i = orden.indexOf(paso);
  return i >= 0 && i < orden.length - 1 ? orden[i + 1] : null;
}

/** Paso anterior del recorrido, o null al principio. */
export function pasoAnterior(
  paso: PasoOnboarding,
  kind: AccountKind | undefined,
): PasoOnboarding | null {
  const orden = ordenDePasos(kind);
  const i = orden.indexOf(paso);
  return i > 0 ? orden[i - 1] : null;
}
