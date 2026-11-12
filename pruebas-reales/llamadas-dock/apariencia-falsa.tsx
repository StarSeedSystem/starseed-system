// LLA1112B · el contexto de apariencia, con la sensibilidad de borde que se pida en la URL (?borde=60).
export function useAppearance() {
  const borde = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("borde") ?? 20) : 20;
  return { config: { trinity: { edgeSensitivity: borde, showEdgeIndicators: false, dockBehavior: "anchor-only" } }, updateSection: () => undefined };
}
