import type { ReactNode } from "react";
import AppGlobals from "./app-globals";

/**
 * Layout del grupo de rutas (app) — Adenda 129.
 * ============================================================================
 * ⚠️ Este archivo FALTABA: existía `layout-server.tsx`, pero Next.js SOLO reconoce
 * `layout.tsx` como layout de grupo. Sin él, TODO el grupo (app) renderizaba sin
 * layout de grupo y los efectos/ventanas globales de la sección NUNCA se montaban →
 * quedaban MUERTOS en producción. Por eso el botón «Configurar Neurona» «no hacía
 * nada» (emitía `starseed:open-aurora-setup` hacia el vacío, sin oyente) y la ventana
 * de inicio/OmniVoice no aparecía.
 *
 * Server Component (sin "use client", sin hooks) que monta el Client Component
 * `AppGlobals` como HERMANO de `{children}` → evita el "Invalid hook call" (#310) del
 * React duplicado de Next 15 (motivo por el que en su día se separó el archivo).
 * ⚠️ NO envolver `{children}` DENTRO de `AppGlobals`: reintroduce el #310 y rompe el
 * prerender de la página not-found (regresión de la Adenda 137, revertida).
 *
 * Se monta el conjunto CURADO `AppGlobals` (modal Configurar Neurona + ventana
 * OmniVoice + avisos), NO el `app-providers.tsx` completo: la revisión adversarial
 * (Adenda 129) mostró que activar de golpe TODOS sus globales introduce regresiones
 * (AuthGate taparía contenido PÚBLICO, datos demo de historias, toolbars duplicadas).
 * Su activación segura queda para una ola dedicada. NO añade `<AppHeader/>` ni `<main>`:
 * el chrome global (OmniDock, orbe, fondos, Trinity) ya lo aporta el layout RAÍZ.
 *
 * Adenda 137 (a11y): el `<ConfirmProvider>` de useConfirm/usePrompt vive en el layout
 * RAÍZ (cubre TODO el árbol, no solo (app)); aquí NO se monta.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AppGlobals />
    </>
  );
}
