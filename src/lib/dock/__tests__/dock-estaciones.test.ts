// StarSeed · «Estaciones» en el dock (Ola 1010E · ES1010Q).
//
// La garantía de botones predeterminados (Adenda 149 · tanda 3) decide por la
// VERSIÓN del payload si «Estaciones» debe encenderse: una cuenta con payload
// v22 (anterior a la app) la recibe encendida; una con payload v23 donde la
// persona la apagó conserva su decisión. Y la semilla de respaldo
// (FALLBACK_SEEDS, la que usa el camino del sync sin el catálogo cargado)
// debe ser espejo exacto del preset del catálogo.
import { describe, expect, it } from "vitest";
import {
  DOCK_DEFAULTS_VERSION,
  DOCK_DEFAULT_ON_IDS,
  normalizeDockState,
  registerDockSeedProvider,
} from "@/lib/dock/dock-defaults";
import { DOCK_ICON_MAP, DOCK_PRESETS } from "@/components/layout/dock-config";

// El catálogo registra su proveedor canónico al importarse; lo anulamos para
// que la garantía siembre desde la SEMILLA DE RESPALDO, que es lo que usa el
// camino del sync cuando dock-config no está cargado. Así el espejo se prueba
// de verdad y no a través del proveedor (que devolvería el propio preset).
registerDockSeedProvider(() => null);

const preset = DOCK_PRESETS.find((p) => p.id === "estaciones");
const habilitados = (items: Array<{ id: string; enabled?: boolean }>) =>
  items.filter((i) => i.enabled === true).map((i) => i.id);

describe("Estaciones · preset del catálogo", () => {
  it("existe, apunta a /estaciones, usa el icono Cast y nace encendida", () => {
    expect(preset).toBeDefined();
    expect(preset?.label).toBe("Estaciones");
    expect(preset?.path).toBe("/estaciones");
    expect(preset?.iconKey).toBe("Cast");
    expect(preset?.enabled).toBe(true);
    expect(preset?.origin).toBe("preset");
  });

  it("Cast resuelve en el mapa de iconos y la garantía la incluye al final", () => {
    expect(DOCK_ICON_MAP.Cast).toBeDefined();
    expect(DOCK_DEFAULT_ON_IDS).toContain("estaciones");
    expect(DOCK_DEFAULT_ON_IDS[DOCK_DEFAULT_ON_IDS.length - 1]).toBe("estaciones");
  });
});

describe("Estaciones · garantía por versión del payload", () => {
  it("la versión de predeterminados sube a 23", () => {
    expect(DOCK_DEFAULTS_VERSION).toBe(23);
  });

  it("un payload v22 sin estaciones la recibe ENCENDIDA y estampa la v23", () => {
    const r = normalizeDockState({
      defaultsVersion: 22,
      items: [{ id: "dashboard", label: "Dashboard", enabled: true, origin: "preset" }],
    });
    expect(r.changed).toBe(true);
    expect(r.payload.defaultsVersion).toBe(23);
    expect(habilitados(r.payload.items)).toContain("estaciones");
    // Se añade una sola vez, sin duplicados.
    expect(r.payload.items.filter((i) => i.id === "estaciones")).toHaveLength(1);
  });

  it("un payload v23 donde la persona la apagó SE RESPETA (no se re-enciende)", () => {
    const r = normalizeDockState({
      defaultsVersion: 23,
      items: [
        { id: "dashboard", label: "Dashboard", enabled: true, origin: "preset" },
        { id: "estaciones", label: "Estaciones", enabled: false, origin: "preset" },
      ],
    });
    expect(r.changed).toBe(false);
    const est = r.payload.items.find((i) => i.id === "estaciones");
    expect(est?.enabled).toBe(false);
  });
});

describe("Estaciones · semilla de respaldo", () => {
  it("es idéntica al preset del catálogo (espejo del camino de sync)", () => {
    // Con el proveedor anulado, lo que la garantía siembra viene SOLO de
    // FALLBACK_SEEDS: si el espejo se desincroniza, esta prueba lo caza.
    const r = normalizeDockState({ defaultsVersion: 22, items: [] });
    const semilla = r.payload.items.find((i) => i.id === "estaciones");
    expect(semilla).toBeDefined();
    expect(semilla).toEqual(preset);
  });
});
