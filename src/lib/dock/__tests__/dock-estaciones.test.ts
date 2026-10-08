// StarSeed · Ola 1010E (ES1010Q) — «Estaciones» en el dock de todas las cuentas.
//
// La regla dorada de descubribilidad (CLAUDE.md §11) no termina al añadir el
// preset: una cuenta que ya existe solo ve el botón si la versión de los
// predeterminados garantizados sube y viaja dentro de su payload. Aquí se
// fijan los casos del contrato (§11 de architecture/estaciones.md): el payload
// v22 lo recibe encendido, el v23 que lo apagó se respeta, y la semilla de
// respaldo es espejo exacto del preset del catálogo.
import { describe, expect, it } from "vitest";
import {
  DOCK_DEFAULT_ON_IDS,
  DOCK_DEFAULTS_VERSION,
  FALLBACK_SEEDS,
  normalizeDockState,
} from "@/lib/dock/dock-defaults";
import { DOCK_ICON_MAP, DOCK_PRESETS } from "@/components/layout/dock-config";

/** Última versión ANTERIOR a la de esta ola: la que viaja hoy en las cuentas. */
const VERSION_V22 = 22;

/** Item que no participa en la garantía (debe sobrevivir intacto). */
const otro = { id: "dashboard", label: "Dashboard", enabled: true, origin: "preset" };

const idsEncendidos = (items: Array<{ id: string; enabled?: boolean }>) =>
  items.filter((i) => i.enabled === true).map((i) => i.id);

const presetEstaciones = DOCK_PRESETS.find((p) => p.id === "estaciones");

describe("Estaciones en el dock (Ola 1010E)", () => {
  it("el catálogo trae el preset del contrato y `estaciones` cierra la garantía v23", () => {
    expect(presetEstaciones).toEqual({
      id: "estaciones",
      label: "Estaciones",
      iconKey: "Cast",
      path: "/estaciones",
      color: "crimson", // el contrato pedía 'rose'; la paleta del dock no lo tiene
      enabled: true,
      origin: "preset",
    });
    expect(DOCK_DEFAULTS_VERSION).toBe(23);
    expect(DOCK_DEFAULT_ON_IDS[DOCK_DEFAULT_ON_IDS.length - 1]).toBe("estaciones");
  });

  it("DOCK_ICON_MAP conoce 'Cast' y cubre todos los iconKey del catálogo", () => {
    expect("Cast" in DOCK_ICON_MAP).toBe(true);
    for (const p of DOCK_PRESETS) {
      expect(p.iconKey in DOCK_ICON_MAP, `iconKey sin icono: ${p.iconKey}`).toBe(true);
    }
  });

  it("un payload v22 sin `estaciones` lo recibe ENCENDIDO y estampa la versión 23", () => {
    const r = normalizeDockState({ defaultsVersion: VERSION_V22, items: [otro] });
    expect(r.changed).toBe(true);
    expect(r.payload.defaultsVersion).toBe(DOCK_DEFAULTS_VERSION);
    expect(idsEncendidos(r.payload.items)).toEqual(expect.arrayContaining(["estaciones"]));
    const nuevo = r.payload.items.find((i) => i.id === "estaciones");
    expect(nuevo).toMatchObject({
      label: "Estaciones",
      path: "/estaciones",
      enabled: true,
      origin: "preset",
    });
  });

  it("un payload v23 que apagó `estaciones` se respeta: es decisión del usuario", () => {
    const r = normalizeDockState({
      defaultsVersion: DOCK_DEFAULTS_VERSION,
      items: [otro, { id: "estaciones", enabled: false, origin: "preset" }],
    });
    expect(r.changed).toBe(false);
    const boton = r.payload.items.find((i) => i.id === "estaciones");
    expect(boton?.enabled).toBe(false);
  });

  it("la semilla de respaldo es idéntica al preset del catálogo", () => {
    expect(FALLBACK_SEEDS.estaciones).toEqual(presetEstaciones);
  });
});
