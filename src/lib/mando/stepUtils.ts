"use client";

import type { AccountKind, StepKindState } from "./stepKind";
import type * as React from "react";
import { User, Users } from "lucide-react";

/**
 * Implementación pura de utilidades para el paso Kind (sin any).
 *
 * Proporciona funciones tipadas para validar y obtener metadatos
 * del tipo de cuenta (individuo/grupo) en el onboarding.
 */

const KIND_LABELS: Record<AccountKind, string> = {
  individual: "Individuo",
  grupo: "Grupo",
};

const KIND_DESCRIPTIONS: Record<AccountKind, string> = {
  individual: "Una persona soberana en la red.",
  grupo: "Comunidad / Sangha / colectivo.",
};

const KIND_ICONS: Record<AccountKind, React.ComponentType<{ className?: string }>> = {
  individual: User,
  grupo: Users,
};

export const stepKindUtils = {
  isKindValid(state: StepKindState): boolean {
    return state.kind === "individual" || state.kind === "grupo";
  },

  getKindLabel(kind: AccountKind | undefined): string | null {
    if (!kind) return null;
    return KIND_LABELS[kind] ?? null;
  },

  getKindDescription(kind: AccountKind | undefined): string | null {
    if (!kind) return null;
    return KIND_DESCRIPTIONS[kind] ?? null;
  },

  getKindIcon(kind: AccountKind | undefined): React.ComponentType<{ className?: string }> | null {
    if (!kind) return null;
    return KIND_ICONS[kind] ?? null;
  },
} as const;

export type StepKindUtils = typeof stepKindUtils;