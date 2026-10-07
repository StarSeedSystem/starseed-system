import { describe, it, expect } from "vitest";
import { vistaPublica } from "../vista-publica";

const base = {
  ambito: { nombre: "X", visibilidad: "publico" as const },
  olas: [],
  integradas: [],
  motor: { estado: "parado", ultimo_reporte: Date.now() },
  chat: [],
};

describe("vistaPublica · casos nulos y límites", () => {
  it("sin olas → avanceMedio 0 y vista no nula", () => {
    const r = vistaPublica(base);
    expect(r).not.toBeNull();
    expect(r?.avanceMedio).toBe(0);
    expect(r?.olas).toEqual([]);
  });

  it("ultimo_reporte inválido no devuelve NaN en haceMin", () => {
    const r = vistaPublica({ ...base, motor: { estado: "parado", ultimo_reporte: "no-es-fecha" } });
    expect(r?.motor.haceMin).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r?.motor.haceMin)).toBe(true);
  });

  it("ultimo_reporte en el futuro → haceMin 0, nunca negativo", () => {
    const r = vistaPublica({ ...base, motor: { estado: "parado", ultimo_reporte: Date.now() + 600000 } });
    expect(r?.motor.haceMin).toBe(0);
  });

  it("integradas con fecha Date se serializa a string ISO", () => {
    const fecha = new Date("2026-02-01T12:00:00Z");
    const r = vistaPublica({ ...base, integradas: [{ titulo: "I", fecha }] });
    expect(r?.integradas[0].fecha).toBe(fecha.toISOString());
  });

  it("chat vacío → lista vacía sin error", () => {
    const r = vistaPublica(base);
    expect(r?.chat).toEqual([]);
  });
});
