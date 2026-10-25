/**
 * Destinos de memoria de un cerebro (contrato §8) — casos de la rama CB1013S
 * adaptados a la API de hoy. Main no tiene `medios-puras`/`destinosDeMemorias`:
 * el normalizador vigente es `normalizeMemoryDestinations`, y estas pruebas fijan
 * las garantías que siguen en pie: espejo local siempre encendido, StarSeed
 * encendido por defecto, externos con su etiqueta y Syncthing apagado sin
 * etiqueta salvo que se configure. Módulo puro: sin red, disco ni procesos.
 */
import { describe, expect, it } from "vitest";
import { defaultMemoryDestinations, normalizeMemoryDestinations } from "@/lib/brains/memory-destinations";

describe("destinos de memorias normalizados", () => {
  it("sin configuración: local y StarSeed por defecto; Syncthing apagado y sin etiqueta", () => {
    const d = normalizeMemoryDestinations(undefined);
    expect(d).toEqual(defaultMemoryDestinations());
    expect(d.local.enabled).toBe(true);
    expect(d.starseed.enabled).toBe(true);
    expect(d.external).toEqual([]);
    expect(d.p2p).toEqual({ enabled: false });
  });

  it("local siempre encendido; conserva StarSeed apagado, la etiqueta externa y el folder de Syncthing", () => {
    const d = normalizeMemoryDestinations({
      local: { enabled: false },
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, folderId: "f1", label: "PC de casa" },
    });
    expect(d.local.enabled).toBe(true);
    expect(d.starseed.enabled).toBe(false);
    expect(d.external).toEqual([
      { id: "ext1", url: "https://x.example", label: "Mi servidor", serverId: undefined, keyRef: undefined },
    ]);
    expect(d.p2p).toEqual({ enabled: true, folderId: "f1", label: "PC de casa" });
  });

  it("no lanza con basura y descarta externos sin id o sin url", () => {
    for (const basura of [null, "roto", 42, []]) {
      expect(normalizeMemoryDestinations(basura)).toEqual(defaultMemoryDestinations());
    }
    const d = normalizeMemoryDestinations({
      external: [{ id: "sin-url" }, { url: "https://y.example" }, { id: "ok", url: "https://z.example" }],
    });
    expect(d.external).toEqual([
      { id: "ok", url: "https://z.example", label: "Destino externo", serverId: undefined, keyRef: undefined },
    ]);
  });
});
