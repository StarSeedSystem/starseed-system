"use client";

import type { OnboardingState } from "@/lib/onboarding/onboarding";
import type * as React from "react";

/**
 * Handlers para los pasos de onboarding (puros, sin any).
 *
 * Define handlers para cada paso de onboarding:
 * - Kind: determina si es individuo o grupo
 * - AuthMode: entrada o creación
 * - Auth: credenciales
 * - Theme: tema visual
 * - Walkthrough: guía de secciones principales
 * - Profile: información básica del usuario
 * - AiGuide: configuración de IA personal
 * - Phase: fase comunitaria (solo para grupos)
 * - Done: pantalla de finalización
 */
export interface StepHandlers {
  /** Paso 1: ¿Individuo o grupo? */
  Kind: {
    /** Renderiza el selector de tipo de cuenta */
    Component: React.ComponentType<{
      state: OnboardingState;
      setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
      onNext: () => void;
    }>;
  };
  /** Paso 2: ¿Ya tienes cuenta? */
  AuthMode: {
    /** Renderiza el selector de entrada/creación */
    Component: React.ComponentType<{
      state: OnboardingState;
      setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
      onNext: () => void;
      onFinish: () => void;
    }>;
  };
  /** Paso 3: Credenciales */
  Auth: {
    /** Renderiza el formulario de credenciales */
    Component: React.ComponentType<{
      state: OnboardingState;
      setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
      onNext: () => void;
    }>;
  };
  /** Paso 4: Tema visual */
  Theme: {
    /** Renderiza el selector de temas */
    Component: React.ComponentType<{
      state: OnboardingState;
      setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
      onNext: () => void;
    }>;
  };
  /** Paso 5: Guía de secciones principales */
  Walkthrough: {
    /** Renderiza la guía de walkthrough */
    Component: React.ComponentType<{
      onNext: () => void;
    }>;
  };
  /** Paso 6: Perfil */
  Profile: {
    /** Renderiza el formulario de perfil */
    Component: React.ComponentType<{
      state: OnboardingState;
      setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
      onNext: () => void;
    }>;
  };
  /** Paso 7: Guía de IA */
  AiGuide: {
    /** Renderiza la guía de IA */
    Component: React.ComponentType<{
      onNext: () => void;
    }>;
  };
  /** Paso 8: Fase comunitaria (solo para grupos) */
  Phase: {
    /** Renderiza el selector de fase */
    Component: React.ComponentType<{
      state: OnboardingState;
      setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
      onNext: () => void;
    }>;
  };
  /** Paso 9: Terminado */
  Done: {
    /** Renderiza la pantalla de finalización */
    Component: React.ComponentType<{
      state: OnboardingState;
      onFinish: () => void;
    }>;
  };
}