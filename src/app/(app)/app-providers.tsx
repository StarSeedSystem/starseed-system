"use client";

// AppProviders — providers y efectos globales de la sección (app).
// Vive como Client Component hijo de (app)/layout (Server Component) para que
// el layout NO use hooks de React directamente → elimina el "Invalid hook call"
// (#310) que aparecía en producción (Vercel) por el react duplicado de
// Next 15. El layout server solo renderiza el JSX estructural.
import { CalendarProvider } from "@/contexts/calendar-context";
import { StoriesProvider } from "@/contexts/stories-context";
import { AlarmScheduler } from "@/components/calendar/alarm-scheduler";
import { ActiveAlertModal } from "@/components/calendar/active-alert-modal";
import { useEffect } from "react";
import { hermes } from "@/hermes-integration";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { AuroraIntro } from "@/components/onboarding/aurora-intro";
import { AuthGate } from "@/components/auth/auth-gate";
import { GlobalEntityCreator } from "@/components/layout/global-entity-creator";
import { GlobalSelectionMenu } from "@/components/layout/global-selection-menu";
import { TextSelectionToolbar } from "@/components/aurora/text-selection-toolbar";
import type { ReactNode } from "react";

export default function AppProviders({ children }: { children: ReactNode }) {
  // Initialize Hermes integration system on mount
  useEffect(() => {
    hermes.init().catch((err) =>
      console.warn("[Hermes] Init delayed:", err.message),
    );
  }, []);

  return (
    <CalendarProvider>
      <StoriesProvider>
        {children}
        <TextSelectionToolbar />
        <AuthGate />
        <OnboardingGate />
        {/* Presentación breve de Aurora (tras el alta de cuenta): 3-5
            preguntas opcionales que alimentan voz/personalidad/contexto. */}
        <AuroraIntro />
        {/* Motor de alarmas global + modal de aviso activo */}
        <AlarmScheduler />
        <ActiveAlertModal />
        <GlobalEntityCreator />
        <GlobalSelectionMenu />
      </StoriesProvider>
    </CalendarProvider>
  );
}
