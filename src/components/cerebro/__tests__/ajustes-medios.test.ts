/**
 * Destinos de memorias · casos rescatados de la rama de la nube (RTCB1013L).
 * La API de hoy es `normalizeMemoryDestinations`: un contrato de configuración
 * (sin textos de UI) que conserva las mismas garantías de local, StarSeed y P2P.
 */
import { describe, expect, it } from "vitest";
import { normalizeMemoryDestinations } from "@/lib/brains/memory-destinations";

describe("normalizeMemoryDestinations · casos rescatados de la rama", () => {
  it("sin configuración: StarSeed encendido por defecto, Syncthing apagado y sin etiqueta", () => {
    const destinos = normalizeMemoryDestinations(undefined);

    expect(destinos.local).toEqual({ enabled: true });
    expect(destinos.starseed).toEqual({ enabled: true });
    expect(destinos.external).toEqual([]);
    expect(destinos.p2p).toEqual({ enabled: false });
    expect(destinos.p2p.label).toBeUndefined();
  });

  it("marca local fijo y conserva el estado de StarSeed, la etiqueta externa y el P2P", () => {
    const destinos = normalizeMemoryDestinations({
      local: { enabled: false },
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, label: "PC de casa" },
    });

    expect(destinos.local).toEqual({ enabled: true });
    expect(destinos.starseed).toEqual({ enabled: false });
    expect(destinos.external).toEqual([
      { id: "ext1", url: "https://x.example", label: "Mi servidor" },
    ]);
    expect(destinos.p2p).toEqual({ enabled: true, label: "PC de casa" });
  });

  it("local siempre activo y capacidades encendidas solo si lo están en la entrada", () => {
    const destinos = normalizeMemoryDestinations({
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Servidor" }],
      p2p: { enabled: true },
    });

    expect(destinos.local.enabled).toBe(true);
    expect(destinos.starseed.enabled).toBe(false);
    expect(destinos.external.map((d) => d.id)).toEqual(["ext1"]);
    expect(destinos.p2p.enabled).toBe(true);
  });
});
