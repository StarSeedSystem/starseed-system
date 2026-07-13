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
// Aurora (provider + orbe) se monta ahora en el layout RAÍZ (src/app/layout.tsx)
// para existir en TODAS las rutas — dashboard (main), login, onboarding — y para
// que el ZenithCurtain quede dentro del provider. Aquí ya no se monta nada.
// DecisionsBell retirado: el botón flotante de «Decisiones» (abajo-izquierda)
// se elimina para despejar esa esquina. Las decisiones siguen accesibles desde
// /decisiones y desde el sistema de notificaciones; el componente se conserva
// en el repo por si se reubica dentro de una sección más adelante.
// import { DecisionsBell } from "@/components/decisions/decisions-bell";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { AuroraIntro } from "@/components/onboarding/aurora-intro";
import { AuthGate } from "@/components/auth/auth-gate";
// AiOverlay retirado: el botón flotante del bot de IA se elimina; la función de
// IA vive ahora en el Exocórtex del menú Trinity (Zenith). El componente se
// conserva en el repo por si se reutiliza, pero ya no se monta globalmente.
// import { AiOverlay } from "@/components/hermes/ai-overlay";
import { GlobalEntityCreator } from "@/components/layout/global-entity-creator";

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
                {children}
                <AuthGate />
                <OnboardingGate />
                {/* Presentación breve de Aurora (tras el alta de cuenta): 3-5
                    preguntas opcionales que alimentan voz/personalidad/contexto. */}
                <AuroraIntro />
              </div>
            </main>
          </div>
        </div>
        {/* Motor de alarmas global + modal de aviso activo */}
        <AlarmScheduler />
        <ActiveAlertModal />
        <GlobalEntityCreator />
        {/* IA: ahora se accede desde el Exocórtex del menú Trinity (Zenith),
            no desde un botón flotante. */}
      </StoriesProvider>
    </CalendarProvider>
  );
}
