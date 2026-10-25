/**
 * Rescate RTCB1013L · destinos de memorias de un cerebro, adaptado a la API de hoy.
 *
 * La rama nube/40144614377 probaba `destinosDeMemorias`, `idsElegidosDestinos` y
 * `parcheDestinos`, que main no tiene: el contrato vive ahora en
 * `normalizeMemoryDestinations` / `getMemoryDestinations`. Aquí se conservan solo los
 * casos que main aún no cubre (valores por defecto, local fijo y etiquetas).
 */
import { describe, expect, it } from "vitest";

import {
  defaultMemoryDestinations,
  getMemoryDestinations,
  normalizeMemoryDestinations,
} from "@/lib/brains/memory-destinations";

type CerebroConDestinos = Parameters<typeof getMemoryDestinations>[0];

describe("normalizeMemoryDestinations", () => {
  it("sin configuración: local fijo, StarSeed encendido y Syncthing apagado sin etiqueta", () => {
    expect(normalizeMemoryDestinations(undefined)).toEqual(defaultMemoryDestinations());
    expect(defaultMemoryDestinations()).toEqual({
      local: { enabled: true },
      starseed: { enabled: true },
      external: [],
      p2p: { enabled: false },
    });
  });

  it("local no se apaga aunque la config lo diga; StarSeed sí respeta el apagado", () => {
    const d = normalizeMemoryDestinations({
      local: { enabled: false },
      starseed: { enabled: false },
    });
    expect(d.local).toEqual({ enabled: true });
    expect(d.starseed).toEqual({ enabled: false });
  });

  it("conserva la etiqueta de cada externo y el p2p con su carpeta", () => {
    const d = normalizeMemoryDestinations({
      external: [
        { id: "ext1", url: "https://x.example", label: "Mi servidor" },
        { id: "sin-url" },
        "basura",
      ],
      p2p: { enabled: true, folderId: "f1", label: "PC de casa" },
    });
    expect(d.external).toHaveLength(1);
    expect(d.external[0]).toMatchObject({
      id: "ext1",
      url: "https://x.example",
      label: "Mi servidor",
    });
    expect(d.p2p).toEqual({ enabled: true, folderId: "f1", label: "PC de casa" });
  });

  it("un externo sin etiqueta recibe el nombre por defecto y el p2p vacío no inventa datos", () => {
    const d = normalizeMemoryDestinations({
      external: [{ id: "ext2", url: "https://y.example" }],
      p2p: { enabled: false, label: "", folderId: "" },
    });
    expect(d.external[0]).toMatchObject({ label: "Destino externo" });
    expect(d.p2p.enabled).toBe(false);
    expect(d.p2p.label).toBeUndefined();
    expect(d.p2p.folderId).toBeUndefined();
  });
});

describe("getMemoryDestinations", () => {
  it("lee config.memoryDestinations y cae en los valores por defecto sin cerebro", () => {
    const conConfig = {
      config: {
        memoryDestinations: {
          starseed: { enabled: false },
          external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
        },
      },
    } as unknown as CerebroConDestinos;
    const d = getMemoryDestinations(conConfig);
    expect(d.starseed).toEqual({ enabled: false });
    expect(d.external.map((e) => e.label)).toEqual(["Mi servidor"]);
    expect(d.local).toEqual({ enabled: true });
    expect(getMemoryDestinations(null)).toEqual(defaultMemoryDestinations());
  });
});
