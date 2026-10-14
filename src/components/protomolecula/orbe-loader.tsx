"use client";

/**
 * Loader de la orbe gemela de la Protomolécula (PM1010F0L).
 * `src/app/layout.tsx` es un Server Component y Next 15 prohíbe
 * `next/dynamic(..., { ssr: false })` fuera de "use client": este wrapper
 * (mismo patrón que `dynamic-heavy-backgrounds.tsx`) saca la orbe del chunk
 * inicial del layout raíz — CLAUDE.md prohíbe cargar motores de forma
 * estática ahí (medido: 3 min → 27 min de build).
 */
import dynamic from "next/dynamic";

const OrbeProtomolecula = dynamic(() => import("./orbe-protomolecula"), { ssr: false });

export function OrbeProtomoleculaLoader() {
  return <OrbeProtomolecula />;
}
