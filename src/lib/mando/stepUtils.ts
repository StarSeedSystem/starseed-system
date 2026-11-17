"use client";

import type { OnboardingState } from "@/lib/onboarding/onboarding";

/**
 * Utilidades puras para los pasos de onboarding (sin any).
 *
 * Define funciones puras para:
 * - Validación de estados
 * - Obtención de etiquetas/descripciones/iconos para cada paso
 * - Helper functions sin cualquier efecto secundario
 */
export interface StepUtils {
  /** Tipo de cuenta */
  Kind: {
    /** Valida si el estado actual es un estado de tipo de cuenta válido. */
    isValid: (state: OnboardingState) => boolean;
    /** Obtiene la etiqueta legible para un tipo de cuenta. */
    getLabel: (kind: OnboardingState["kind"]) => string | null;
    /** Obtiene la descripción legible para un tipo de cuenta. */
    getDescription: (kind: OnboardingState["kind"]) => string | null;
    /** Obtiene el icono para un tipo de cuenta. */
    getIcon: (kind: OnboardingState["kind"]) => React.ComponentType<{ className?: string }> | null;
  };
  /** Modo de autenticación */
  AuthMode: {
    /** Valida si el modo de autenticación es válido. */
    isValid: (state: OnboardingState) => boolean;
    /** Obtiene la etiqueta legible para un modo de autenticación. */
    getLabel: (mode: OnboardingState["mode"]) => string | null;
    /** Obtiene la descripción legible para un modo de autenticación. */
    getDescription: (mode: OnboardingState["mode"]) => string | null;
  };
  /** Autenticación */
  Auth: {
    /** Valida si las credenciales son válidas. */
    isValid: (state: OnboardingState) => boolean;
    /** Obtiene el error de validación para las credenciales. */
    getError: (state: OnboardingState) => string | null;
  };
  /** Tema visual */
  Theme: {
    /** Valida si el tema es válido. */
    isValid: (state: OnboardingState) => boolean;
    /** Obtiene la etiqueta legible para un tema. */
    getLabel: (themeId: OnboardingState["themeId"]) => string | null;
    /** Obtiene la descripción legible para un tema. */
    getDescription: (themeId: OnboardingState["themeId"]) => string | null;
  };
  /** Perfil */
  Profile: {
    /** Valida si el perfil es válido. */
    isValid: (state: OnboardingState) => boolean;
    /** Obtiene el error de validación para el perfil. */
    getError: (state: OnboardingState) => string | null;
  };
  /** Guía de IA */
  AiGuide: {
    /** Valida si la guía de IA es válida. */
    isValid: () => boolean;
  };
  /** Fase comunitaria */
  Phase: {
    /** Valida si la fase es válida. */
    isValid: (state: OnboardingState) => boolean;
    /** Obtiene la etiqueta legible para una fase. */
    getLabel: (phase: OnboardingState["phase"]) => string | null;
    /** Obtiene la descripción legible para una fase. */
    getDescription: (phase: OnboardingState["phase"]) => string | null;
    /** Obtiene el icono para una fase. */
    getIcon: (phase: OnboardingState["phase"]) => React.ComponentType<{ className?: string }> | null;
  };
}
