export function useAppearance() { const m = new URLSearchParams(location.search).get("mode") || "standard"; return { config: { themeStore: { activeMode: m }, styling: { crystalPreset: "none" } } }; }
