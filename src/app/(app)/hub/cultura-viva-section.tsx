"use client";

// src/app/(app)/hub/cultura-viva-section.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Sección «Cultura viva» del Hub (Adenda 77 · Agente H2 · PACK 2 cultural).
// Se monta desde `hub/page.tsx` con un cambio MÍNIMO (import + pestaña al final,
// sin reordenar nada — coordinado con H1 que también toca hub/page.tsx).
// Toda la lógica cultural vive en `src/components/hub/cultural/**`.
// ─────────────────────────────────────────────────────────────────────────────

import { Sparkles } from "lucide-react";
import type { SectionTabItem } from "@/components/ui/section-tabs";
import { CulturaVivaPanel } from "@/components/hub/cultural/cultura-viva-panel";

/** Valor de la pestaña (para HUB_TABS y deep-linking `?tab=cultura-viva`). */
export const CULTURA_VIVA_TAB_VALUE = "cultura-viva" as const;

/** Ítem del menú unificado del Hub para «Cultura viva». */
export const CULTURA_VIVA_TAB_ITEM: SectionTabItem = {
    value: CULTURA_VIVA_TAB_VALUE,
    label: "Cultura viva",
    icon: Sparkles,
    title: "Cultura viva: idiomas, festivos, puente cultural, hermanamientos y salas de voz",
};

/** Contenido de la pestaña «Cultura viva». */
export function CulturaVivaSection() {
    return <CulturaVivaPanel />;
}

export default CulturaVivaSection;
