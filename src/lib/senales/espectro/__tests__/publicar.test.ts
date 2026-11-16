/**
 * Tests de publicarSenales (MAP1116B).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  publicarSenales,
  reiniciarEstadoPublicarParaTests,
  esFaltaDeEsquema,
} from "../publicar";
import type { FilaPublicable } from "../publicacion";

const AHORA = 1_700_000_000_000;

function filaPublicable(overrides: Partial<FilaPublicable> = {}): FilaPublicable {
  return {
    id: "device-1:s1",
    medio: "lora",
    banda: "EU 868",
    frecuenciaKhz: 868100,
    anchoKhz: 125000,
    fuerzaDbm: -85,
    calidad: 0.7,
    origen: "medida",
    capa: "publica",
    comunidad: null,
    zona: null,
    medidoEn: AHORA,
    fuente: "radio Meshtastic",
    ...overrides,
  };
}

describe("publicarSenales", () => {
  beforeEach(() => {
    reiniciarEstadoPublicarParaTests();
  });

  it("tabla ausente → motivo y silencio 5 min", async () => {
    const errorEsquema = { code: "42P01", message: "relation does not exist" };
    const cliente = {
      from: () => ({
        upsert: async () => ({ error: errorEsquema }),
        select: () => ({
          eq: () => ({
            then: async () => ({ data: [], error: errorEsquema }),
          }),
        }),
        delete: () => ({ eq: () => ({ then: async () => {} }) }),
      }),
    };

    const resultado = await publicarSenales({
      cliente: cliente as any,
      uid: "uid-1",
      filas: [filaPublicable()],
      ahora: AHORA,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("las señales públicas aún no están activadas en este servidor");
    expect(resultado.reintentarEnMs).toBeGreaterThan(0);
  });

  it("filas vacías devuelve ok con 0 publicadas", async () => {
    const cliente = {
      from: () => ({
        upsert: async () => ({ error: null }),
      }),
    };

    const resultado = await publicarSenales({
      cliente: cliente as any,
      uid: "uid-1",
      filas: [],
      ahora: AHORA,
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.publicadas).toBe(0);
  });

  it("error de red devuelve motivo", async () => {
    const errorRed = { message: "Network error" };
    const cliente = {
      from: () => ({
        upsert: async () => ({ error: errorRed }),
      }),
    };

    const resultado = await publicarSenales({
      cliente: cliente as any,
      uid: "uid-1",
      filas: [filaPublicable()],
      ahora: AHORA,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("Network error");
  });
});

describe("esFaltaDeEsquema", () => {
  it("detecta error 42P01: tabla no existe", () => {
    expect(esFaltaDeEsquema({ code: "42P01", message: "table not found" })).toBe(true);
  });

  it("detecta error 42703: columna no existe", () => {
    expect(esFaltaDeEsquema({ code: "42703", message: "column not found" })).toBe(true);
  });

  it("detecta PGRST205: tabla no está en caché", () => {
    expect(esFaltaDeEsquema({ code: "PGRST205", message: "schema cache" })).toBe(true);
  });

  it("no detecta error que no es falta de esquema", () => {
    expect(esFaltaDeEsquema({ code: "42501", message: "permission denied" })).toBe(false);
  });

  it("detecta mensaje con 'does not exist'", () => {
    expect(esFaltaDeEsquema({ message: "relation 'os_senales_publicas' does not exist" })).toBe(true);
  });
});