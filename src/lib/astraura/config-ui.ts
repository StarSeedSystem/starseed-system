"use client";

/**
 * Astraura · OmniVoice — puente de APERTURA del panel de configuración (Adenda 132).
 * ============================================================================
 * Módulo LIVIANO (sin React, sin I/O de red) que expone un evento global y un
 * disparador para abrir el DRAWER global de configuración de Astraura+OmniVoice
 * desde CUALQUIER parte del OS (ajustes, notificaciones, atajos…), igual que
 * `openAuroraSetup` / `openStartupUpdates`. El drawer (`AstrauraConfigDrawer`) se
 * monta una sola vez en `app-globals.tsx` y escucha este evento.
 *
 * SSR-safe y defensivo: sin `window` no hace nada y nunca lanza.
 */

/** Evento que abre el drawer global de configuración de Astraura + OmniVoice. */
export const ASTRAURA_CONFIG_EVENT = "starseed:open-astraura-config";

/**
 * Abre el drawer de configuración de Astraura + OmniVoice. `section` (opcional)
 * indica a qué apartado desplazarse al abrir (p.ej. "orden", "cuenta", "voz").
 */
export function openAstrauraConfig(section?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(ASTRAURA_CONFIG_EVENT, { detail: { section } }));
  } catch {
    /* noop: apertura best-effort, nunca rompe */
  }
}
