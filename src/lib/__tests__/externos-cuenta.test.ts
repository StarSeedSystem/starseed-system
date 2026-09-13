/**
 * Pruebas de la lógica pura de la vista global de vínculos (Ola 281 · E6A).
 * Solo se importan funciones de `cuenta.ts` (puras: sin red ni disco).
 */

import { describe, expect, it } from "vitest";
import {
  activosPorAmbito,
  caducaEnMenosDeMs,
  estadoVinculo,
  ETIQUETAS_AMBITO,
  HORAS_24,
} from "@/lib/externos/cuenta";
import type { Vinculo } from "@/lib/externos/tipos";

function vParcial(revocado: string | null, expira: string | null) {
  return { revocado_en: revocado, expira_en: expira };
}

describe("estadoVinculo", () => {
  it("revocado manda por encima de la caducidad", () => {
    expect(estadoVinculo(vParcial("2026-01-01T00:00:00Z", "2030-01-01T00:00:00Z"))).toBe("revocado");
  });

  it("caducado cuando la caducidad ya pasó", () => {
    expect(estadoVinculo(vParcial(null, "2020-01-01T00:00:00Z"), Date.parse("2026-09-08T00:00:00Z"))).toBe("caducado");
  });

  it("activo sin revocación y con caducidad futura (o ninguna)", () => {
    expect(estadoVinculo(vParcial(null, "2030-01-01T00:00:00Z"))).toBe("activo");
    expect(estadoVinculo(vParcial(null, null))).toBe("activo");
  });
});

describe("caducaEnMenosDeMs", () => {
  it("avisa cuando caduca dentro del umbral de 24 h", () => {
    const ahora = Date.parse("2026-09-08T00:00:00Z");
    const expira = new Date(ahora + HORAS_24 / 2).toISOString();
    expect(caducaEnMenosDeMs(vParcial(null, expira), HORAS_24, ahora)).toBe(true);
  });

  it("no avisa si caduca más allá del umbral", () => {
    const ahora = Date.parse("2026-09-08T00:00:00Z");
    const expira = new Date(ahora + HORAS_24 * 2).toISOString();
    expect(caducaEnMenosDeMs(vParcial(null, expira), HORAS_24, ahora)).toBe(false);
  });

  it("no avisa si ya está caducado o revocado o no tiene caducidad", () => {
    const ahora = Date.parse("2026-09-08T00:00:00Z");
    const pasada = new Date(ahora - 1000).toISOString();
    expect(caducaEnMenosDeMs(vParcial(null, pasada), HORAS_24, ahora)).toBe(false);
    expect(caducaEnMenosDeMs(vParcial("2026-01-01T00:00:00Z", null), HORAS_24, ahora)).toBe(false);
    expect(caducaEnMenosDeMs(vParcial(null, null), HORAS_24, ahora)).toBe(false);
  });
});

describe("activosPorAmbito", () => {
  const base: Vinculo = {
    id: "id", owner: "o", ambito_tipo: "chat", ambito_id: "", nombre: "",
    prefijo: "aa", permisos: { leer: true, escribir: false, hablar: false, memoria: false, herramientas: false },
    expira_en: null, ultimo_uso: null, usos: 0, creado_en: "2026-01-01T00:00:00Z", revocado_en: null, origen: "os",
  };

  it("cuenta solo los activos y con una clave por ámbito", () => {
    const vinculos: Vinculo[] = [
      { ...base, ambito_tipo: "chat" },
      { ...base, id: "id2", ambito_tipo: "chat" },
      { ...base, id: "id3", ambito_tipo: "cuenta", revocado_en: "2026-01-01T00:00:00Z" },
    ];
    const r = activosPorAmbito(vinculos);
    expect(r.chat).toBe(2);
    expect(r.cuenta).toBe(0);
    expect(Object.keys(r).length).toBe(Object.keys(ETIQUETAS_AMBITO).length);
  });
});