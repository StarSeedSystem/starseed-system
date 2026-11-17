"use client";

import type { OnboardingState } from "@/lib/onboarding/onboarding";

/**
 * El tipo principal de StepKind (el primer paso del onboarding).
 *
 * Defino aquí las propiedades estrictas (sin any) que el componente
 * StepKind de la página necesita y que todos los manejadores y utilidades
 * deben cumplir.
 */
export interface StepKindProps {
  /** Estado de onboarding actual (sin any). */
  state: OnboardingState;
  /** Función para actualizar el estado de onboarding (sin any). */
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  /** Función para avanzar al siguiente paso (sin any). */
  onNext: () => void;
}

export interface KindCardProps {
  /** Icono para la tarjeta */
  icon: React.ComponentType<{ className?: string }>;
  /** Etiqueta legible para la tarjeta */
  label: string;
  /** Descripción legible para la tarjeta */
  desc: string;
  /** Si la tarjeta está seleccionada */
  selected: boolean;
  /** Handler para el clic */
  onClick: () => void;
}

/**
 * Handler para el paso "tipo de cuenta" - determina si el usuario es individuo o grupo.
 *
 * Define el handler puro para StepKind, eliminando any.
 */
export interface StepKindHandlers {
  /** El componente principal de StepKind (sin any). */
  StepKind: React.ComponentType<StepKindProps>;
  /** Tarjeta para el selector de tipo de cuenta (sin any). */
  KindCard: React.ComponentType<KindCardProps>;
}

/**
 * Utilidades para StepKind - helper functions sin any.
 *
 * Define utilidades puras para StepKind, eliminando any.
 */
export interface StepKindUtils {
  /** Valida si el estado actual es un estado de tipo de cuenta válido. */
  isKindValid: (state: OnboardingState) => boolean;
  /** Obtiene la etiqueta legible para un tipo de cuenta. */
  getKindLabel: (kind: OnboardingState["kind"]) => string | null;
  /** Obtiene la descripción legible para un tipo de cuenta. */
  getKindDescription: (kind: OnboardingState["kind"]) => string | null;
  /** Obtiene el icono para un tipo de cuenta. */
  getKindIcon: (kind: OnboardingState["kind"]) => React.ComponentType<{ className?: string }> | null;
}
