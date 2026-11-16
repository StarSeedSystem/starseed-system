/**
 * Tipos puros del asistente de bienvenida (`/onboarding`).
 *
 * Viven aparte de la página para que las pruebas de tipos puedan importarlos
 * sin cargar la página cliente ni sus componentes de UI, y para que cada paso
 * tenga una firma concreta en vez de `any`.
 */
import type { LucideIcon } from "lucide-react";

export type TipoCuenta = "individual" | "grupo";
export type FaseComunitaria = "semilla" | "nodo" | "fortaleza";

export interface EstadoOnboarding {
  kind?: TipoCuenta;
  mode?: "enter" | "create";
  username?: string;
  password?: string;
  email?: string;
  themeId?: string;
  themeVariant?: string;
  phase?: FaseComunitaria;
  profile?: { displayName: string; bio: string; avatar?: string; cover?: string };
}

/** Props comunes de cada paso del asistente: estado, actualizador y avanzar. */
export interface PropsPaso {
  state: EstadoOnboarding;
  setState: (siguiente: EstadoOnboarding) => void;
  onNext: () => void;
}

/** Props de la tarjeta seleccionable del paso «Individuo o grupo». */
export interface PropsTarjetaTipo {
  icon: LucideIcon;
  label: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}
