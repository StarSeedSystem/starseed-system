"use client";

/**
 * Astraura · OmniVoice — puente de APERTURA del panel de configuración
 * (Adenda 132 · ampliado en la 149 con personalidad preseleccionada).
 * ============================================================================
 * Módulo LIVIANO (sin React, sin I/O de red) que expone un evento global y un
 * disparador para abrir el DRAWER global de «Configuración/actualización de
 * sistemas de Astraura en esta neurona» desde CUALQUIER parte del OS (ajustes,
 * notificaciones, atajos, hub de Personalidades…), igual que `openAuroraSetup`
 * / `openStartupUpdates`. El drawer (`AstrauraConfigDrawer`) se monta una sola
 * vez en `app-globals.tsx` y escucha este evento.
 *
 * SSR-safe y defensivo: sin `window` no hace nada y nunca lanza.
 */

/** Evento que abre el drawer global de configuración de Astraura + OmniVoice. */
export const ASTRAURA_CONFIG_EVENT = "starseed:open-astraura-config";

/** Detalle del evento de apertura (todo opcional; retro-compatible con A132). */
export interface AstrauraConfigOpenDetail {
  /** Sección/pestaña a abrir: "llm" · "astraura" · "openvoice" · "cerebro" ·
   *  "senales"… (admite los sinónimos históricos: "orden", "cuenta", "voz"). */
  section?: string;
  /** Personalidad a preseleccionar en el selector (id de PersonalityProfile). */
  personalityId?: string;
}

/**
 * Abre el drawer de sistemas de Astraura en esta neurona. `section` (opcional)
 * indica a qué pestaña ir; `opts.personalityId` (opcional) preselecciona una
 * personalidad (p.ej. desde el hub de Personalidades: «Sistemas en esta
 * neurona» de Aurora o Hermione).
 */
export function openAstrauraConfig(section?: string, opts?: { personalityId?: string }): void {
  if (typeof window === "undefined") return;
  try {
    const detail: AstrauraConfigOpenDetail = { section, personalityId: opts?.personalityId };
    window.dispatchEvent(new CustomEvent(ASTRAURA_CONFIG_EVENT, { detail }));
  } catch {
    /* noop: apertura best-effort, nunca rompe */
  }
}
