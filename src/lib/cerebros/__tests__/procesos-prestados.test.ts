// Pruebas de procesos-prestados: solo funciones puras, sin red, sin disco y sin reloj propio.
import { describe, it, expect } from "vitest";
import {
  consumoLegible,
  resumenPrestamos,
  sumaConsumoMb,
  type SesionPrestamo,
} from "@/lib/cerebros/procesos-prestados";

function sesion(ajustes: Partial<SesionPrestamo> & { id: string }): SesionPrestamo {
  return {
    otro: "otro",
    tipo: "capacidad",
    recurso: "voz",
    desde: null,
    vence: null,
    revocada: false,
    consumoMb: null,
    ...ajustes,
  };
}

const AHORA = 1000;

describe("consumoLegible", () => {
  it("devuelve «sin medida» cuando el consumo no se midió o no es un número fiable", () => {
    expect(consumoLegible(null)).toBe("sin medida");
    expect(consumoLegible(Number.NaN)).toBe("sin medida");
    expect(consumoLegible(-5)).toBe("sin medida");
  });

  it("redondea a un decimal y usa GB a partir del megabyte 1024", () => {
    expect(consumoLegible(0)).toBe("0 MB");
    expect(consumoLegible(12.34)).toBe("12,3 MB");
    expect(consumoLegible(2048)).toBe("2 GB");
  });
});

describe("sumaConsumoMb", () => {
  it("sume solo el consumo medido de las sesiones activas", () => {
    const sesiones = [
      sesion({ id: "a", consumoMb: 10 }),
      sesion({ id: "b", consumoMb: null }),
      sesion({ id: "c", consumoMb: 5, vence: AHORA - 1 }),
      sesion({ id: "d", consumoMb: 2.5, revocada: true }),
    ];
    expect(sumaConsumoMb(sesiones, AHORA)).toBe(10);
  });

  it("devuelve null si ninguna sesión activa tiene consumo medido", () => {
    expect(sumaConsumoMb([], AHORA)).toBeNull();
    expect(sumaConsumoMb([sesion({ id: "a" })], AHORA)).toBeNull();
  });
});

describe("resumenPrestamos", () => {
  it("construye filas legibles con dirección, quién, qué, inicio y consumo", () => {
    const r = resumenPrestamos(
      [sesion({ id: "d1", otro: "vecina-2", recurso: "render", desde: 900, consumoMb: 30 })],
      [sesion({ id: "t1", otro: "anfitriona-7", tipo: "app", recurso: "Biblioteca", desde: 950, consumoMb: 4 })],
      AHORA,
    );
    expect(r.filas.map((f) => f.quien)).toEqual(["vecina-2", "anfitriona-7"]);
    expect(r.filas.map((f) => f.que)).toEqual(["Capacidad · render", "App · Biblioteca"]);
    expect(r.filas.map((f) => f.direccion)).toEqual(["da", "toma"]);
    expect(r.filas.map((f) => f.desde)).toEqual([900, 950]);
    expect(r.filas.map((f) => f.consumoTexto)).toEqual(["30 MB", "4 MB"]);
  });

  it("marca inactivas las sesiones revocadas o expiradas y pone su consumo en «sin medida»", () => {
    const r = resumenPrestamos(
      [sesion({ id: "d1", consumoMb: 30, revocada: true })],
      [sesion({ id: "t1", consumoMb: 8, vence: AHORA - 1 })],
      AHORA,
    );
    expect(r.filas).toHaveLength(2);
    expect(r.filas.every((f) => !f.activa)).toBe(true);
    expect(r.filas.every((f) => f.consumoTexto === "sin medida")).toBe(true);
    expect(r.totales).toEqual({
      dadosActivos: 0,
      tomadosActivos: 0,
      consumoDadosMb: null,
      consumoTomadosMb: null,
    });
  });

  it("ordena: lo dado antes que lo tomado y, dentro de cada grupo, lo más nuevo primero", () => {
    const r = resumenPrestamos(
      [sesion({ id: "d1", otro: "a", desde: 100 }), sesion({ id: "d2", otro: "b", desde: 900 })],
      [sesion({ id: "t1", otro: "c", desde: 500 })],
      AHORA,
    );
    expect(r.filas.map((f) => f.quien)).toEqual(["b", "a", "c"]);
  });

  it("desempata por id cuando dos sesiones empezaron igual", () => {
    const r = resumenPrestamos(
      [sesion({ id: "z", otro: "última", desde: 100 }), sesion({ id: "a", otro: "primera", desde: 100 })],
      [],
      AHORA,
    );
    expect(r.filas.map((f) => f.quien)).toEqual(["primera", "última"]);
  });

  it("cuenta los totales de préstamos activos con su consumo medido", () => {
    const r = resumenPrestamos(
      [sesion({ id: "d1", consumoMb: 10 }), sesion({ id: "d2", consumoMb: 5, vence: AHORA - 1 })],
      [sesion({ id: "t1", consumoMb: 7 }), sesion({ id: "t2", consumoMb: null, otro: "otra" })],
      AHORA,
    );
    expect(r.totales.dadosActivos).toBe(1);
    expect(r.totales.tomadosActivos).toBe(2);
    expect(r.totales.consumoDadosMb).toBe(10);
    expect(r.totales.consumoTomadosMb).toBe(7);
  });

  it("nunca inventa lo que no se midió: partes vacías dan filas vacías y totales en cero", () => {
    const r = resumenPrestamos([], [], AHORA);
    expect(r.filas).toEqual([]);
    expect(r.totales).toEqual({
      dadosActivos: 0,
      tomadosActivos: 0,
      consumoDadosMb: null,
      consumoTomadosMb: null,
    });
  });
});
