import { beforeEach, describe, expect, it, vi } from "vitest";

const fila = vi.hoisted(() => ({ data: null as unknown, error: null as unknown, llamadas: 0 }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { fila.llamadas++; return { data: fila.data, error: fila.error }; } }) }) }),
  }),
}));

import { _olvidarLecturasFrescasParaPruebas, leerAparatoFresco, textoHaceTiempo } from "../version-reportada";

const ahora = Date.parse("2026-11-12T12:00:00Z");
const hace = (s: number) => new Date(ahora - s * 1000).toISOString();

describe("textoHaceTiempo (LLA1112B)", () => {
  it("escalas", () => {
    expect(textoHaceTiempo(hace(10), ahora)).toBe("hace un momento");
    expect(textoHaceTiempo(hace(5 * 60), ahora)).toBe("hace 5 min");
    expect(textoHaceTiempo(hace(3 * 3600), ahora)).toBe("hace 3 h");
    expect(textoHaceTiempo(hace(30 * 3600), ahora)).toBe("ayer");
    expect(textoHaceTiempo(hace(4 * 86400), ahora)).toBe("hace 4 días");
  });
  it("fecha ilegible, vacía o futura: null", () => {
    expect(textoHaceTiempo(null, ahora)).toBeNull();
    expect(textoHaceTiempo("no", ahora)).toBeNull();
    expect(textoHaceTiempo(hace(-3600), ahora)).toBeNull();
  });
});

describe("leerAparatoFresco (LLA1112B)", () => {
  beforeEach(() => {
    _olvidarLecturasFrescasParaPruebas();
    fila.data = null;
    fila.error = null;
    fila.llamadas = 0;
  });
  it("lee la versión actual de la ficha y la cachea un minuto", async () => {
    fila.data = { capabilities: { aparato: { v: 1, medio: "android", app: "os", so: "android", soV: "16", equipo: "Tab", version: "0.5.1-prueba.39", visto: hace(60) } } };
    const a = await leerAparatoFresco("tablet", ahora);
    expect(a?.version).toBe("0.5.1-prueba.39");
    await leerAparatoFresco("tablet", ahora + 5_000);
    expect(fila.llamadas).toBe(1);
    await leerAparatoFresco("tablet", ahora + 120_000);
    expect(fila.llamadas).toBe(2);
  });
  it("si falla la lectura no lanza", async () => {
    fila.error = { message: "x" };
    expect(await leerAparatoFresco("t2", ahora)).toBeNull();
    expect(await leerAparatoFresco("", ahora)).toBeNull();
  });
});
