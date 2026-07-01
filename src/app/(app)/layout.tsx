"use client";

import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/header";
import { useAppearance } from "@/context/appearance-context";
import { CalendarProvider } from "@/contexts/calendar-context";
import { StoriesProvider } from "@/contexts/stories-context";
import { AlarmScheduler } from "@/components/calendar/alarm-scheduler";
import { ActiveAlertModal } from "@/components/calendar/active-alert-modal";
import { useEffect } from "react";
import { hermes } from "@/hermes-integration";
import { AuroraProvider } from "@/components/aurora/aurora-provider";
import { AuroraWidget } from "@/components/aurora/aurora-widget";
// DecisionsBell retirado: el botón flotante de «Decisiones» (abajo-izquierda)
// se elimina para despejar esa esquina. Las decisiones siguen accesibles desde
// /decisiones y desde el sistema de notificaciones; el componente se conserva
// en el repo por si se reubica dentro de una sección más adelante.
// import { DecisionsBell } from "@/components/decisions/decisions-bell";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { AuthGate } from "@/components/auth/auth-gate";
// AiOverlay retirado: el botón flotante del bot de IA se elimina; la función de
// IA vive ahora en el Exocórtex del menú Trinity (Zenith). El componente se
// conserva en el repo por si se reutiliza, pero ya no se monta globalmente.
// import { AiOverlay } from "@/components/hermes/ai-overlay";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();

  // Initialize Hermes integration system on mount
  useEffect(() => {
    hermes.init().catch((err) =>
      console.warn("[Hermes] Init delayed:", err.message)
    );
  }, []);

  return (
    <CalendarProvider>
      <StoriesProvider>
        <div className="flex flex-col min-h-screen transition-all duration-300 ease-in-out">
          <div className="flex flex-col min-w-0 transition-all duration-300 flex-1">
            <AppHeader />
            <main className="flex-1 flex flex-col bg-transparent transition-all duration-300 overflow-y-auto">
              <div className="w-full px-[clamp(0.75rem,2vw,2rem)] py-[clamp(0.75rem,1.5vw,1.5rem)] flex flex-col gap-[clamp(0.75rem,1.5vw,1.5rem)] flex-1">
                <AuroraProvider>
                  {children}
                  <AuroraWidget />
                  <AuthGate />
          <OnboardingGate />
                </AuroraProvider>
              </div>
            </main>
          </div>
        </div>
        {/* Motor de alarmas global + modal de aviso activo */}
        <AlarmScheduler />
        <ActiveAlertModal />
        {/* IA: ahora se accede desde el Exocórtex del menú Trinity (Zenith),
            no desde un botón flotante. */}
      </StoriesProvider>
    </CalendarProvider>
  );
}
