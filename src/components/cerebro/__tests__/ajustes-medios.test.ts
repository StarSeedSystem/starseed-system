/**
 * Destinos de memoria de un cerebro (contrato §8) — casos de la rama CB1013S
 * adaptados a la API de hoy. Main no tiene `medios-puras`/`destinosDeMemorias`:
 * el normalizador vigente es `normalizeMemoryDestinations`, y estas pruebas fijan
 * lo que sigue en pie: espejo local siempre encendido, StarSeed encendido por
 * defecto, externos con su etiqueta y Syncthing apagado y sin etiqueta salvo que
 * se configure. Módulo puro: sin red, disco ni procesos.
 */
import { describe, expect, it } from "vitest";
import {
  defaultMemoryDestinations,
  getMemoryDestinations,
  normalizeMemoryDestinations,
} from "@/lib/brains/memory-destinations";

describe("destinos de memorias normalizados", () => {
  it("sin configuración: local fijo, StarSeed encendido y Syncthing apagado sin etiqueta", () => {
    for (const vacia of [undefined, null, "roto", 42, []]) {
      expect(normalizeMemoryDestinations(vacia)).toEqual(defaultMemoryDestinations());
    }
    const d = normalizeMemoryDestinations(undefined);
    expect(d.local).toEqual({ enabled: true });
    expect(d.starseed).toEqual({ enabled: true });
    expect(d.external).toEqual([]);
    expect(d.p2p).toEqual({ enabled: false });
    expect(d.p2p.label).toBeUndefined();
    expect(d.p2p.folderId).toBeUndefined();
    expect(getMemoryDestinations(null)).toEqual(defaultMemoryDestinations());
  });

  it("local no se apaga aunque la config lo diga; conserva StarSeed, externos y p2p", () => {
    const d = normalizeMemoryDestinations({
      local: { enabled: false },
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, folderId: "f1", label: "PC de casa" },
    });
    expect(d.local).toEqual({ enabled: true });
    expect(d.starseed).toEqual({ enabled: false });
    expect(d.external).toHaveLength(1);
    expect(d.external[0]).toMatchObject({ id: "ext1", url: "https://x.example", label: "Mi servidor" });
    expect(d.p2p).toEqual({ enabled: true, folderId: "f1", label: "PC de casa" });

    const cerebro = { config: { memoryDestinations: d } } as unknown as Parameters<typeof getMemoryDestinations>[0];
    expect(getMemoryDestinations(cerebro)).toEqual(d);
  });

  it("no lanza con basura, descarta externos incompletos y pone la etiqueta por defecto", () => {
    const d = normalizeMemoryDestinations({
      external: [
        null,
        "basura",
        { id: "sin-url" },
        { url: "https://y.example" },
        { id: "ok", url: "https://z.example" },
        { id: "con-nombre", url: "https://n.example", label: "Con nombre" },
      ],
      p2p: { enabled: false, label: "", folderId: "" },
    });
    expect(d.external).toHaveLength(2);
    expect(d.external[0]).toMatchObject({ id: "ok", url: "https://z.example", label: "Destino externo" });
    expect(d.external[1]).toMatchObject({ id: "con-nombre", label: "Con nombre" });
    expect(d.p2p).toEqual({ enabled: false });
  });
});
