"use client";

/*
 * ⚠️ DEPRECADO (Adenda 68 · D — 2026-07-13). NO USAR.
 * ----------------------------------------------------------------------------
 * Este componente montaba el visualizador Audiomorphic como FONDO EXCLUSIVO del
 * OS (`config.background.type === "audiomorphic"`) con una URL cuyos parámetros
 * (`?bg&autostart&full&mic&cam&preset`) **la app externa NUNCA ha entendido**
 * (verificado leyendo su bundle: aparecen cero veces). Resultado: el iframe
 * cargaba la app ENTERA con su tour de bienvenida — la "capa intermedia
 * translúcida" que reportó el usuario — y, al ir con `pointer-events: none`,
 * era imposible cerrarla.
 *
 * Sustituido por el sistema de CAPAS:
 *   • modelo   → src/lib/appearance/background-layers.ts
 *   • render   → src/components/ui/backgrounds/background-layer-stack.tsx
 *   • ajustes  → src/components/settings/appearance/background-layers-panel.tsx
 *
 * Se conserva el archivo (sin efectos) porque hay catálogos de diseño que
 * referencian su ruta. Renderiza null: es imposible que vuelva a aparecer solo.
 */

export function AudiomorphicBackground() {
    return null;
}
