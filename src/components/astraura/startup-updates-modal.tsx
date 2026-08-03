"use client";

/**
 * StartupUpdatesModal — VENTANA UNIFICADA DE INICIO / ACTUALIZACIONES (Adenda 111 · refactor 132).
 * ============================================================================
 * ENVOLTORIO FINO: conserva el GATE de auto-apertura (primera entrada de la neurona o
 * novedades de catálogo, `shouldShowUpdates`, retardo ~1200 ms), el evento de apertura
 * manual (`subscribeStartupOpen` / `openStartupUpdates`) y su overlay centrado z-[120].
 * El CONTENIDO es ahora el componente reutilizable `AstrauraOmniVoiceConfig`
 * (variant="modal"), que gestiona todo el estado y la persistencia
 * (`markUpdatesSeen` + `saveModelPreferences`) — ver `astraura-omnivoice-config.tsx`.
 *
 * Adenda 132: si el Centro de Configuración de Aurora está PENDIENTE (`isSetupPending`),
 * NO auto-abrimos esta ventana en esta sesión, para evitar dos modales apilados en la
 * primera visita a /agent (AuroraSetupCenter + esta ventana). La apertura MANUAL por
 * evento sigue funcionando siempre.
 *
 * SSR-safe: no renderiza en servidor; decide abrir tras montar. Nunca lanza.
 */

import { useEffect, useState } from "react";
import { shouldShowUpdates, subscribeStartupOpen, openStartupUpdates } from "@/lib/astraura/startup-updates";
import { isSetupPending } from "@/lib/aurora/setup-config";
import { AstrauraOmniVoiceConfig } from "@/components/astraura/astraura-omnivoice-config";

export function StartupUpdatesModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Auto-apertura: primera entrada o novedades — salvo que el Centro de
    // Configuración esté pendiente (evita el solape de doble modal).
    const t = setTimeout(() => {
      try { if (isSetupPending()) return; } catch { /* si falla, seguimos con el gate normal */ }
      if (shouldShowUpdates()) setOpen(true);
    }, 1200);
    // Apertura manual por evento (desde ajustes/notificaciones): siempre abre.
    const off = subscribeStartupOpen(() => setOpen(true));
    // Paridad con openAuroraSetup: disparador global.
    try { (window as unknown as { openAstrauraStartup?: () => void }).openAstrauraStartup = openStartupUpdates; } catch { /* */ }
    return () => { clearTimeout(t); off(); };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <AstrauraOmniVoiceConfig
        variant="modal"
        onApply={() => setOpen(false)}
        onDismiss={() => setOpen(false)}
      />
    </div>
  );
}

export default StartupUpdatesModal;
