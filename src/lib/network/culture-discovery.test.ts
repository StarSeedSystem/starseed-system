// src/lib/network/culture-discovery.test.ts
import { describe, it, expect } from "vitest";
import { fechaRelativaEs, proximoEvento } from "@/lib/network/culture-discovery";
import type { OsEvent } from "@/lib/os-social";

// Fecha de referencia fija EN HORA LOCAL (10:00): «hoy/mañana» se cuentan en el día local,
// así que un instante UTC fijo (antes 1_700_000_000_000 = 22:13 UTC) daba «mañana» en la CI
// (UTC) y «hoy» en la Mac: la CI de la web estaba en rojo solo por la zona horaria.
const AHORA = new Date(2023, 10, 14, 10, 0).getTime();
const DIA_MS = 24 * 60 * 60 * 1000;

/** Construye un evento REAL mínimo con la fecha dada en ms. */
function ev(slug: string, startsAtMs: number, isSample = false): OsEvent {
  return {
    id: slug,
    slug,
    title: slug,
    kind: "circulo",
    description: "",
    startsAt: new Date(startsAtMs).toISOString(),
    location: "",
    organizerSlug: "o",
    tags: [],
    attendeeCount: 0,
    isSample,
  };
}

describe("fechaRelativaEs", () => {
  it("devuelve «hoy» para el mismo día", () => {
    expect(fechaRelativaEs(AHORA, AHORA)).toBe("hoy");
    expect(fechaRelativaEs(AHORA, AHORA + 3 * 60 * 60 * 1000)).toBe("hoy");

    const inicio = new Date(2024, 0, 15, 0, 30).getTime();
    const final = new Date(2024, 0, 15, 23, 30).getTime();
    expect(fechaRelativaEs(inicio, final)).toBe("hoy");
  });

  it("devuelve «mañana» para el día siguiente", () => {
    expect(fechaRelativaEs(AHORA, AHORA + DIA_MS)).toBe("mañana");

    const antesDeMedianoche = new Date(2024, 0, 15, 23, 30).getTime();
    const despuesDeMedianoche = new Date(2024, 0, 16, 0, 30).getTime();
    expect(fechaRelativaEs(antesDeMedianoche, despuesDeMedianoche)).toBe("mañana");
  });

  it("devuelve «pasado mañana» para dentro de dos días", () => {
    expect(fechaRelativaEs(AHORA, AHORA + 2 * DIA_MS)).toBe("pasado mañana");
  });

  it("devuelve «en N días» para más allá de dos días", () => {
    expect(fechaRelativaEs(AHORA, AHORA + 3 * DIA_MS)).toBe("en 3 días");
    expect(fechaRelativaEs(AHORA, AHORA + 10 * DIA_MS)).toBe("en 10 días");
  });

  it("devuelve «hace N días» para el pasado", () => {
    expect(fechaRelativaEs(AHORA, AHORA - DIA_MS)).toBe("hace 1 días");
    expect(fechaRelativaEs(AHORA, AHORA - 5 * DIA_MS)).toBe("hace 5 días");
  });
});

describe("proximoEvento", () => {
  const eventos = [
    ev("pasado", AHORA - DIA_MS),
    ev("lejano", AHORA + 10 * DIA_MS),
    ev("inmediato", AHORA + DIA_MS),
    ev("maqueta", AHORA + DIA_MS, true),
  ];

  it("devuelve el real más cercano por venir", () => {
    expect(proximoEvento(eventos, AHORA)?.slug).toBe("inmediato");
  });

  it("ignora los eventos de maqueta (isSample)", () => {
    expect(proximoEvento([eventos[3]], AHORA)).toBeNull();
  });

  it("devuelve null si no hay nada por venir", () => {
    expect(proximoEvento([eventos[0]], AHORA)).toBeNull();
    expect(proximoEvento([], AHORA)).toBeNull();
  });
});
