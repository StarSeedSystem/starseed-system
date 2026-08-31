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
import { AuroraIntro } from "@/components/onboarding/aurora-intro";
import { ModelDownloadNotifier } from "@/components/neurons/model-download-notifier";
import { NeuronActivityLogger } from "@/components/neurons/neuron-activity-logger";
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
        {/* OnboardingGate ahora vive en el layout RAÍZ (Adenda 188): cubre
            todas las rutas y evita el doble montaje aquí. */}
        {/* Presentación breve de Aurora (tras el alta de cuenta): 3-5
            preguntas opcionales que alimentan voz/personalidad/contexto. */}
        <AuroraIntro />
        {/* Ventana unificada de inicio/actualizaciones de Astraura + OmniVoice
            (Adenda 111): primera entrada de la neurona o novedades de modelos/fuentes. */}
        {/* (Adenda 193) StartupUpdatesModal se monta en el layout RAÍZ: aquí
          sería un SEGUNDO montaje (dos ventanas y dos helpers globales). */}
        {/* Aviso global al completar una descarga de modelo en 2º plano (Adenda 113). */}
        <ModelDownloadNotifier />
        {/* Alimenta la bitácora por neurona con eventos reales de red/descargas (Adenda 115). */}
        <NeuronActivityLogger />
        {/* Motor de alarmas global + modal de aviso activo */}
        <AlarmScheduler />
        <ActiveAlertModal />
        <GlobalEntityCreator />
        <GlobalSelectionMenu />
      </StoriesProvider>
    </CalendarProvider>
  );
}
