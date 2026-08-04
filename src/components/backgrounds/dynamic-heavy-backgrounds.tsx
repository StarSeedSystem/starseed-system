"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * DynamicHeavyBackgrounds — Adenda 136 (rendimiento).
 * ---------------------------------------------------------------------------
 * `src/app/layout.tsx` es un SERVER component (no lleva "use client" — usa
 * `export const metadata`, exclusivo de Server Components). Next 15 PROHÍBE
 * `next/dynamic(..., { ssr: false })` fuera de un límite "use client": si se
 * llama en un Server Component, el build falla. Por eso este pequeño wrapper
 * cliente existe únicamente para alojar los `dynamic()` de los tres fondos
 * pesados y dejar que layout.tsx los monte por composición, sin tocar su
 * propia naturaleza de Server Component.
 *
 * Qué resuelve: WebGLBackground (three.js vía LiquidGradient) y
 * SplineDefaultBackground (@splinetool/react-spline + runtime vía
 * SplineBackground) y ThemeBackgroundHost (módulo weather/NOAA del tema
 * "climatico") se importaban ESTÁTICAMENTE en el layout raíz ⇒ three.js +
 * Spline + weather quedaban dentro del chunk inicial de layout, descargado en
 * TODAS las rutas (incluida /login, que no los usa en el primer paint).
 *
 * Con `ssr:false` + `loading:() => null`:
 *  - three.js/Spline/weather salen del chunk inicial de layout → First Load
 *    JS baja en TODAS las rutas.
 *  - Los 3 siguen renderizándose (decorativos, sin SEO/contenido) — solo se
 *    cargan y montan en el cliente, tras la hidratación, en el MISMO sitio
 *    del árbol donde estaban (mismo z-index/posición: cada componente fija
 *    su propio z-index internamente, no depende del wrapper).
 *  - `loading: () => null` evita cualquier flash: no hay nada que pintar
 *    mientras carga el chunk (igual que antes, estos componentes devuelven
 *    null hasta que su propia lógica decide qué fondo pintar).
 *
 * Uso en layout.tsx (Server Component): se importan y montan estos 3
 * wrappers en EXACTAMENTE el mismo lugar donde antes se importaban y
 * montaban los componentes originales directamente.
 * ═══════════════════════════════════════════════════════════════════════════ */

import dynamic from "next/dynamic";

/** WebGLBackground — export NOMBRADO (sin default) en webgl-background.tsx. */
export const DynamicWebGLBackground = dynamic(
  () =>
    import("@/components/ui/backgrounds/webgl-background").then((m) => ({
      default: m.WebGLBackground,
    })),
  { ssr: false, loading: () => null }
);

/** SplineDefaultBackground — export NOMBRADO (sin default) en spline-default-background.tsx. */
export const DynamicSplineDefaultBackground = dynamic(
  () =>
    import("@/components/ui/backgrounds/spline-default-background").then(
      (m) => ({ default: m.SplineDefaultBackground })
    ),
  { ssr: false, loading: () => null }
);

/** ThemeBackgroundHost — tiene export default en theme-live-background.tsx, no hace falta `.then()`. */
export const DynamicThemeBackgroundHost = dynamic(
  () => import("@/components/backgrounds/theme-live-background"),
  { ssr: false, loading: () => null }
);
