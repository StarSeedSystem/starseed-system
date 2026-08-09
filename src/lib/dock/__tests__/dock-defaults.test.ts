// StarSeed · Garantía de botones predeterminados del dock (Adenda 149 · tanda 3).
//
// `normalizeDockState` es la ÚNICA función que decide si «Señales» y «Feed de
// red» deben forzarse. La cubrimos con tests porque este fallo se ha reabierto
// tres veces: los intentos anteriores usaban banderas one-shot por navegador,
// imposibles de probar y ciegas al payload que llega sincronizado de la cuenta.
// Aquí la lógica es pura (sin localStorage ni red), así que cada caso del bug
// real queda fijado.
import { describe, expect, it } from "vitest";
import {
  DOCK_DEFAULTS_VERSION,
  normalizeDockState,
  normalizeDockSyncValue,
  parseDockPayload,
} from "@/lib/dock/dock-defaults";

/** Item cualquiera que no participa en la garantía (debe sobrevivir intacto). */
const otro = { id: "dashboard", label: "Dashboard", enabled: true, origin: "preset" };

const idsHabilitados = (items: Array<{ id: string; enabled?: boolean }>) =>
  items.filter((i) => i.enabled === true).map((i) => i.id);

describe("parseDockPayload", () => {
  it("entiende el array LEGADO (lo que hay guardado en las cuentas ya generadas)", () => {
    const r = parseDockPayload(JSON.stringify([otro]));
    expect(r.items).toHaveLength(1);
    expect(r.defaultsVersion).toBe(0); // sin versionar ⇒ debe normalizarse
  });

  it("entiende el sobre versionado nuevo", () => {
    const r = parseDockPayload({ defaultsVersion: DOCK_DEFAULTS_VERSION, items: [otro] });
    expect(r.defaultsVersion).toBe(DOCK_DEFAULTS_VERSION);
  });

  it("devuelve items:null ante basura o ausencia (no hay config guardada usable)", () => {
    expect(parseDockPayload(null).items).toBeNull();
    expect(parseDockPayload("{{no json").items).toBeNull();
    expect(parseDockPayload({ cualquier: "cosa" }).items).toBeNull();
  });
});

describe("normalizeDockState · payload viejo (sin defaultsVersion)", () => {
  it("AÑADE los botones ausentes y estampa la versión", () => {
    const r = normalizeDockState([otro]);
    expect(r.changed).toBe(true);
    expect(r.payload.defaultsVersion).toBe(DOCK_DEFAULTS_VERSION);
    expect(idsHabilitados(r.payload.items)).toEqual(
      expect.arrayContaining(["senales", "red-feed"]),
    );
  });

  it("RE-ENCIENDE los botones presentes pero apagados — el caso que fallaba", () => {
    // Este es exactamente el payload que llegaba sincronizado de una cuenta
    // antigua y que `ensureDefaultDockItems` no reparaba (solo añadía ausentes).
    const r = normalizeDockState([
      otro,
      { id: "senales", label: "Señales", enabled: false, origin: "preset" },
      { id: "red-feed", label: "Feed de red", enabled: false, origin: "preset" },
    ]);
    expect(r.changed).toBe(true);
    expect(idsHabilitados(r.payload.items)).toEqual(
      expect.arrayContaining(["senales", "red-feed"]),
    );
  });

  it("no duplica items ni pierde los demás accesos del usuario", () => {
    const r = normalizeDockState([otro, { id: "senales", enabled: false }]);
    expect(r.payload.items.filter((i) => i.id === "senales")).toHaveLength(1);
    expect(r.payload.items.some((i) => i.id === "dashboard")).toBe(true);
  });

  it("marca changed aunque los items ya estén bien (hay que estampar la versión)", () => {
    const r = normalizeDockState([{ id: "senales", enabled: true }, { id: "red-feed", enabled: true }]);
    expect(r.changed).toBe(true);
    expect(r.payload.defaultsVersion).toBe(DOCK_DEFAULTS_VERSION);
  });
});

describe("normalizeDockState · payload ya versionado", () => {
  it("RESPETA que el usuario los haya apagado (personalizable de verdad)", () => {
    const r = normalizeDockState({
      defaultsVersion: DOCK_DEFAULTS_VERSION,
      items: [{ id: "senales", enabled: false }, { id: "red-feed", enabled: false }],
    });
    expect(r.changed).toBe(false);
    expect(idsHabilitados(r.payload.items)).toEqual([]);
  });

  it("es idempotente: normalizar dos veces no vuelve a cambiar nada", () => {
    const primera = normalizeDockState([otro]);
    const segunda = normalizeDockState(primera.payload);
    expect(segunda.changed).toBe(false);
    expect(segunda.payload.items).toEqual(primera.payload.items);
  });
});

describe("normalizeDockSyncValue · camino del sync entrante", () => {
  it("repara el payload remoto viejo y avisa de que hay que empujarlo de vuelta", () => {
    const { value, changed } = normalizeDockSyncValue([{ id: "senales", enabled: false }]);
    expect(changed).toBe(true);
    const payload = value as { defaultsVersion: number; items: Array<{ id: string; enabled?: boolean }> };
    expect(payload.defaultsVersion).toBe(DOCK_DEFAULTS_VERSION);
    expect(idsHabilitados(payload.items)).toEqual(expect.arrayContaining(["senales", "red-feed"]));
  });

  it("deja intacto un valor que no es estado de dock (no inventa items)", () => {
    const original = { cualquier: "cosa" };
    const { value, changed } = normalizeDockSyncValue(original);
    expect(changed).toBe(false);
    expect(value).toBe(original);
  });
});
