"use client";

/**
 * AppGlobals — ventanas/efectos globales CURADOS del grupo (app), Adenda 129.
 * ============================================================================
 * Conjunto de bajo riesgo que activa lo que el usuario pidió, tras confirmar que el
 * grupo (app) no tenía layout (por eso estos globales estaban muertos):
 *   · AuroraIntro → AuroraSetupCenter: el modal «Configurar Neurona» (escucha
 *     `starseed:open-aurora-setup`). Antes NO se montaba → el botón «no hacía nada».
 *   · StartupUpdatesModal: la ventana de inicio/OmniVoice (novedades de modelos +
 *     el nuevo orden de preferencia de modelos IA de la Adenda 129).
 *   · ModelDownloadNotifier / NeuronActivityLogger: avisos de descarga y bitácora
 *     de neurona; inocuos y sin UI hasta que hay un evento.
 *
 * NO se monta aquí el conjunto COMPLETO de `app-providers.tsx` (AuthGate,
 * OnboardingGate, StoriesProvider, alarmas del Sincrómetro, toolbars de selección):
 * la revisión adversarial (Adenda 129) mostró que activarlos de golpe introduce
 * regresiones reales —AuthGate taparía contenido PÚBLICO (perfiles, gobernanza),
 * datos demo de historias, dos toolbars de selección solapadas—. Su activación
 * SEGURA (allowlist de rutas públicas, dedupe, coordinación de modales) queda para
 * una ola dedicada; `app-providers.tsx` se conserva como versión completa de referencia.
 *
 * Adenda 137 (a11y): el `<ConfirmProvider>` (useConfirm/usePrompt, reemplazo in-app de
 * window.confirm/alert/prompt) NO se monta aquí, sino en el layout RAÍZ (cubre TODO el
 * árbol —incluida la chrome global y la not-found—, no solo (app)). AppGlobals sigue
 * siendo HERMANO de `{children}` (no lo envuelve) para no reintroducir el React #310.
 */

import { AuroraIntro } from "@/components/onboarding/aurora-intro";
import { StartupUpdatesModal } from "@/components/astraura/startup-updates-modal";
import { AstrauraConfigDrawer } from "@/components/astraura/astraura-config-drawer";
import { ModelDownloadNotifier } from "@/components/neurons/model-download-notifier";
import { NeuronActivityLogger } from "@/components/neurons/neuron-activity-logger";
import { useEffect } from "react";
import { startAstraura158Feed } from "@/lib/astraura/astraura-158-feed";

/** (Ola 3 · Adenda 155) Sondeo del puente de eventos Astraura 1.58 → centro de
 * notificaciones del OS + siembra de personalidades/agentes 1.58. Singleton. */
function Astraura158FeedMount() {
  useEffect(() => startAstraura158Feed(), []);
  return null;
}

// AppGlobals es HERMANO de `{children}` (ver app/(app)/layout.tsx): NO envuelve a
// los children (eso reintroduce el React #310 y rompe el prerender de not-found).
// `<ConfirmProvider>` (Adenda 137) se monta en el layout, no aquí.
export default function AppGlobals() {
  return (
    <>
      <AuroraIntro />
      <StartupUpdatesModal />
      {/* Drawer global de configuración de Astraura + OmniVoice (Adenda 132):
          se monta UNA vez y escucha `starseed:open-astraura-config`. */}
      <AstrauraConfigDrawer />
      <ModelDownloadNotifier />
      <NeuronActivityLogger />
      {/* Eventos de los procesos de fondo Astraura 1.58 (imaginación · enjambre ·
          director) → avisos del OS con deep-link al Studio (Adenda 155). */}
      <Astraura158FeedMount />
    </>
  );
}
