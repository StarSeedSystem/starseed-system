import { describe, expect, it } from "vitest";

import {
  defaultMemoryDestinations,
  normalizeMemoryDestinations,
} from "@/lib/brains/memory-destinations";

describe("destinos de memoria · configuración", () => {
  it("sin configuración: local fijo, StarSeed encendido y Syncthing apagado sin etiqueta", () => {
    const d = normalizeMemoryDestinations(undefined);
    expect(d).toEqual(defaultMemoryDestinations());
    expect(d.local).toEqual({ enabled: true });
    expect(d.starseed).toEqual({ enabled: true });
    expect(d.external).toEqual([]);
    expect(d.p2p).toEqual({ enabled: false });
  });

  it("local siempre activo; respeta StarSeed, la etiqueta externa y el folder de Syncthing", () => {
    const d = normalizeMemoryDestinations({
      local: { enabled: false },
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, folderId: "f1", label: "PC de casa" },
    });
    expect(d).toEqual({
      local: { enabled: true },
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, folderId: "f1", label: "PC de casa" },
    });
  });

  it("listas vacías o basura no lanzan, descartan externos sin id o sin url y ponen etiqueta", () => {
    expect(normalizeMemoryDestinations({ external: [] }).external).toEqual([]);
    const vacia = normalizeMemoryDestinations(null);
    expect(vacia.local.enabled).toBe(true);
    expect(vacia.starseed.enabled).toBe(true);
    expect(vacia.p2p.enabled).toBe(false);

    const d = normalizeMemoryDestinations({
      external: [null, { id: "sin-url" }, { url: "https://x.example" }, { id: "n1", url: "u", label: "" }],
    });
    expect(d.external).toHaveLength(1);
    expect(d.external[0]).toMatchObject({ id: "n1", url: "u", label: "Destino externo" });
  });
});
