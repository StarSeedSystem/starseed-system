import { describe, expect, it } from "vitest";

import {
  defaultMemoryDestinations,
  normalizeMemoryDestinations,
} from "@/lib/brains/memory-destinations";

describe("destinos de memoria · configuración", () => {
  it("sin configuración: local fijo, StarSeed encendido y Syncthing apagado sin etiqueta", () => {
    const porDefecto = defaultMemoryDestinations();
    const d = normalizeMemoryDestinations(undefined);
    expect(d.local).toEqual(porDefecto.local);
    expect(d.starseed).toEqual(porDefecto.starseed);
    expect(d.external).toEqual(porDefecto.external);
    expect(d.p2p.enabled).toBe(porDefecto.p2p.enabled);
    expect(d.p2p.label).toBeUndefined();
  });

  it("local siempre activo; respeta StarSeed, la etiqueta externa y el folder de Syncthing", () => {
    const d = normalizeMemoryDestinations({
      local: { enabled: false },
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, folderId: "f1", label: "PC de casa" },
    });
    expect(d.local.enabled).toBe(true);
    expect(d.starseed.enabled).toBe(false);
    expect(d.external).toHaveLength(1);
    expect(d.external[0]).toMatchObject({ id: "ext1", url: "https://x.example", label: "Mi servidor" });
    expect(d.p2p).toMatchObject({ enabled: true, folderId: "f1", label: "PC de casa" });
  });

  it("listas vacías o basura no lanzan y descartan externos sin id o sin url", () => {
    expect(normalizeMemoryDestinations({ external: [] }).external).toEqual([]);
    expect(
      normalizeMemoryDestinations({ external: [null, { id: "sin-url" }, { url: "https://x.example" }] }).external,
    ).toEqual([]);
    const roto = normalizeMemoryDestinations(null);
    expect(roto.local.enabled).toBe(true);
    expect(roto.starseed.enabled).toBe(true);
    expect(roto.p2p.enabled).toBe(false);
  });
});
