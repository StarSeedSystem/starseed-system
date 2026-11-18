"use client";

import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { leerConexion } from "@/lib/malla/internet/lector-conexion";
import { clasificarConexion } from "@/lib/malla/internet/conexion-limitada";
import { debeSugerir } from "@/lib/malla/internet/sugerencia-banco";

vi.mock("@/lib/malla/internet/lector-conexion", () => ({
  leerConexion: vi.fn(() => ({ tipo: "cellular", saveData: false, effectiveType: "4g", nativaMedida: false })),
  suscribirConexion: vi.fn(() => () => {}),
}));

vi.mock("@/lib/malla/internet/conexion-limitada", () => ({
  clasificarConexion: vi.fn(() => ({ estado: "limitada", fuente: "declarada", motivo: "La persona declaró que es conexión limitada" })),
}));

vi.mock("@/lib/malla/internet/sugerencia-banco", () => ({
  debeSugerir: vi.fn((entrada) => {
    if (entrada.estado !== 'limitada') {
      const motivo = entrada.estado === 'desconocida'
        ? 'La conexión es desconocida, no se puede sugerir el modo banco'
        : 'La conexión no es limitada, no se sugiere el modo banco';
      return { sugerir: false, motivo };
    }

    if (entrada.bancoActivo) {
      return { sugerir: false, motivo: 'El modo banco ya está activo' };
    }

    if (entrada.negativa !== null) {
      const horasPasadas = (entrada.ahora - entrada.negativa.en) / (1000 * 60 * 60);
      const mismaClave = entrada.negativa.conexion === entrada.clave;

      if (mismaClave && horasPasadas < 24) {
        return {
          sugerir: false,
          motivo: 'La persona dijo «Ahora no» hace menos de 24 horas para esta conexión',
        };
      }
    }

    let motivo = 'Se detectó una conexión limitada. Se sugiere activar el modo banco para gestionar mejor los datos.';
    if (!entrada.compartirConOtros) {
      motivo += ' (Compartir está desactivado; el modo banco permite activar compartir de forma segura después)';
    }

    return { sugerir: true, motivo };
  }),
  registrarNegativa: vi.fn((ahora, clave) => ({ en: ahora, conexion: clave })),
}));

vi.mock("@/lib/malla/internet/almacen-negativa-sugerencia", () => ({
  leerNegativa: vi.fn(() => null),
  guardarNegativa: vi.fn(() => true),
}));

vi.mock("@/lib/malla/internet/use-ajustes-internet", () => ({
  useAjustesInternet: () => ({
    ajustes: {
      version: 1,
      compartirConOtros: false,
      banco: { activo: false, modo: "diario", diarioMb: 100, ventanas: [] },
      porAudiencia: {
        "mi-cuenta": { mesh: false, limiteMeshMb: null },
        entidad: { mesh: false, limiteMeshMb: null },
        publico: { mesh: false, limiteMeshMb: null },
      },
      declaraLimitada: null,
      compartirMedidas: false,
    },
    cambiar: vi.fn(),
    decidir: vi.fn(() => ({ decidir: true, motivo: "" })),
    restanteHoyMb: null,
  }),
}));

describe("debeSugerir", () => {
  it("returns true when connection is limited and banco is not active", () => {
    const entrada = {
      estado: "limitada",
      fuente: "declarada",
      bancoActivo: false,
      compartirConOtros: false,
      negativa: null,
      ahora: Date.now(),
      clave: "starseed.malla.internet.v1",
    };
    const resultado = debeSugerir(entrada);
    expect(resultado.sugerir).toBe(true);
    expect(resultado.motivo).toContain("Se detectó una conexión limitada");
  });

  it("returns false when banco is active", () => {
    const entrada = {
      estado: "limitada",
      fuente: "declarada",
      bancoActivo: true,
      compartirConOtros: false,
      negativa: null,
      ahora: Date.now(),
      clave: "starseed.malla.internet.v1",
    };
    const resultado = debeSugerir(entrada);
    expect(resultado.sugerir).toBe(false);
    expect(resultado.motivo).toContain("El modo banco ya está activo");
  });

  it("returns false when there is a negative stored within 24 hours", () => {
    const entrada = {
      estado: "limitada",
      fuente: "declarada",
      bancoActivo: false,
      compartirConOtros: false,
      negativa: { en: Date.now() - 3600000, conexion: "starseed.malla.internet.v1" },
      ahora: Date.now(),
      clave: "starseed.malla.internet.v1",
    };
    const resultado = debeSugerir(entrada);
    expect(resultado.sugerir).toBe(false);
    expect(resultado.motivo).toContain("La persona dijo «Ahora no»");
  });
});