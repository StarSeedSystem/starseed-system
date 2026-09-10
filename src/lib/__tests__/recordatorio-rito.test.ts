import { describe, it, expect } from "vitest";
import {
  debeRecordarRetomarGuia,
  HORAS_UMBRAL_RECORDATORIO_POR_DEFECTO,
} from "../onboarding/recordatorio";

const HORA_MS = 60 * 60 * 1000;

describe("debeRecordarRetomarGuia (rito pospuesto → recordatorio)", () => {
  const ahora = new Date("2026-09-10T12:00:00Z");

  it("no recuerda si el rito está completado", () => {
    expect(
      debeRecordarRetomarGuia(
        { completed: true, skipped: false, skippedAt: "2026-09-01T00:00:00Z" },
        ahora,
      ),
    ).toBe(false);
  });

  it("no recuerda si el rito nunca se pospuso (skipped ausente o false)", () => {
    expect(debeRecordarRetomarGuia({ completed: false }, ahora)).toBe(false);
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: false, skippedAt: null }, ahora),
    ).toBe(false);
  });

  it("no recuerda antes del umbral (por defecto 24 h)", () => {
    const hace2h = new Date(ahora.getTime() - 2 * HORA_MS).toISOString();
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: true, skippedAt: hace2h }, ahora),
    ).toBe(false);
  });

  it("sí recuerda pasado el umbral por defecto", () => {
    const hace48h = new Date(ahora.getTime() - 48 * HORA_MS).toISOString();
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: true, skippedAt: hace48h }, ahora),
    ).toBe(true);
  });

  it("respeta un umbral personalizado y el límite exacto", () => {
    const justo = new Date(ahora.getTime() - HORAS_UMBRAL_RECORDATORIO_POR_DEFECTO * HORA_MS).toISOString();
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: true, skippedAt: justo }, ahora),
    ).toBe(true);
    const hace30min = new Date(ahora.getTime() - 0.5 * HORA_MS).toISOString();
    expect(
      debeRecordarRetomarGuia(
        { completed: false, skipped: true, skippedAt: hace30min },
        ahora,
        0.25,
      ),
    ).toBe(true);
  });

  it("ante dato corrupto o futuro, no recuerda", () => {
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: true, skippedAt: "no-es-fecha" }, ahora),
    ).toBe(false);
    const futuro = new Date(ahora.getTime() + HORA_MS).toISOString();
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: true, skippedAt: futuro }, ahora),
    ).toBe(false);
    expect(
      debeRecordarRetomarGuia({ completed: false, skipped: true, skippedAt: null }, ahora),
    ).toBe(false);
  });
});
