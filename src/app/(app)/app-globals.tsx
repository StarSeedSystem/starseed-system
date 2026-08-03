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
 */

import { AuroraIntro } from "@/components/onboarding/aurora-intro";
import { StartupUpdatesModal } from "@/components/astraura/startup-updates-modal";
import { AstrauraConfigDrawer } from "@/components/astraura/astraura-config-drawer";
import { ModelDownloadNotifier } from "@/components/neurons/model-download-notifier";
import { NeuronActivityLogger } from "@/components/neurons/neuron-activity-logger";

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
    </>
  );
}
