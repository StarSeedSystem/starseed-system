import { describe, expect, it } from "vitest";
import {
  defaultMemoryDestinations,
  normalizeMemoryDestinations,
} from "@/lib/brains/memory-destinations";

/**
 * Casos rescatados de la rama nube/40144614377 y adaptados al contrato de hoy:
 * los destinos de memoria se normalizan en `memory-destinations.ts` (el texto
 * que ve la persona lo pinta `ajustes-sync.tsx`). Se prueban las garantías
 * puras: local siempre encendido, StarSeed por defecto y Syncthing apagado.
 */
describe("destinos de memoria", () => {
  it("sin configuración: local fijo, StarSeed encendido por defecto y Syncthing apagado", () => {
    const destinos = normalizeMemoryDestinations(undefined);
    expect(destinos).toEqual(defaultMemoryDestinations());
    expect(destinos.local).toEqual({ enabled: true });
    expect(destinos.starseed.enabled).toBe(true);
    expect(destinos.external).toEqual([]);
    expect(destinos.p2p).toEqual({ enabled: false });
  });

  it("local no se apaga aunque la configuración lo intente", () => {
    const destinos = normalizeMemoryDestinations({ local: { enabled: false } });
    expect(destinos.local).toEqual({ enabled: true });
  });

  it("conserva la etiqueta del externo y la carpeta de Syncthing, y apaga StarSeed si se pide", () => {
    const destinos = normalizeMemoryDestinations({
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, label: "PC de casa", folderId: "f1" },
    });
    expect(destinos.starseed.enabled).toBe(false);
    expect(destinos.external).toMatchObject([{ id: "ext1", url: "https://x.example", label: "Mi servidor" }]);
    expect(destinos.p2p).toEqual({ enabled: true, label: "PC de casa", folderId: "f1" });
  });

  it("descarta externos sin id o sin url y no inventa Syncthing encendido", () => {
    const destinos = normalizeMemoryDestinations({
      external: [
        { url: "https://sin-id.example" },
        { id: "sin-url" },
        { id: "ok", url: "https://ok.example" },
      ],
      p2p: { enabled: "true" },
    });
    expect(destinos.external.map((d) => d.id)).toEqual(["ok"]);
    expect(destinos.external[0].label).toBe("Destino externo");
    expect(destinos.p2p.enabled).toBe(false);
  });

  it("valores basura no lanzan y vuelven a los valores por defecto", () => {
    expect(normalizeMemoryDestinations("basura")).toEqual(defaultMemoryDestinations());
    expect(normalizeMemoryDestinations({ p2p: "no-es-un-objeto" })).toEqual(defaultMemoryDestinations());
    expect(normalizeMemoryDestinations(null)).toEqual(defaultMemoryDestinations());
  });
});
