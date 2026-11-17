"use client";

/**
 * Tipos para el paso "Kind" del onboarding (primer paso: individuo o grupo).
 *
 * Define tipos estrictos (sin any) para el componente StepKind y sus utilidades.
 */

export type AccountKind = "individual" | "grupo";

/** Estado mínimo que necesita el paso Kind. */
export interface StepKindState {
  kind?: AccountKind;
}

/** Props del componente principal StepKind. */
export interface StepKindProps {
  /** Estado actual del onboarding (solo los campos que usa este paso). */
  state: StepKindState;
  /** Función para actualizar el campo kind. */
  setState: React.Dispatch<React.SetStateAction<StepKindState>>;
  /** Función para avanzar al siguiente paso. */
  onNext: () => void;
}

/** Props de la tarjeta de selección (individuo/grupo). */
export interface KindCardProps {
  /** Icono para la tarjeta (componente Lucide). */
  icon: React.ComponentType<{ className?: string }>;
  /** Etiqueta legible. */
  label: string;
  /** Descripción legible. */
  desc: string;
  /** Si la tarjeta está seleccionada. */
  selected: boolean;
  /** Handler de clic. */
  onClick: () => void;
}

/** Handlers para el paso Kind (componentes tipados). */
export interface StepKindHandlers {
  /** Componente principal StepKind. */
  StepKind: React.ComponentType<StepKindProps>;
  /** Componente KindCard. */
  KindCard: React.ComponentType<KindCardProps>;
}

/** Utilidades puras para el paso Kind. */
export interface StepKindUtils {
  /** Valida si el estado tiene un kind válido. */
  isKindValid: (state: StepKindState) => boolean;
  /** Obtiene la etiqueta legible para un kind. */
  getKindLabel: (kind: AccountKind | undefined) => string | null;
  /** Obtiene la descripción legible para un kind. */
  getKindDescription: (kind: AccountKind | undefined) => string | null;
  /** Obtiene el icono para un kind. */
  getKindIcon: (kind: AccountKind | undefined) => React.ComponentType<{ className?: string }> | null;
}