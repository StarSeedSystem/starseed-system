import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAjustesInternet } from "../use-ajustes-internet";
import { ajustesPorDefecto } from "../defectos-audiencia";

const CLAVE_AJUSTES = "starseed.malla.internet.v1";
const AHORA = 1700000000000;

function crearAlmacen(datos: Record<string, string> = {}) {
  const internos = datos;
  return {
    getItem: (clave: string) => internos[clave] ?? null,
    setItem: (clave: string, valor: string) => {
      internos[clave] = valor;
    },
  };
}

function montar(almacen = crearAlmacen()) {
  return renderHook(() =>
    useAjustesInternet({ almacen, ahora: () => AHORA, desfaseMin: 0 })
  );
}

describe("defectos integrados en el hook de ajustes", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("sin nada guardado enciende solo la malla de «mi-cuenta», sin límite", () => {
    const { result } = montar();

    expect(result.current.ajustes.porAudiencia["mi-cuenta"]).toEqual({
      mesh: true,
      limiteMeshMb: null,
    });
    expect(result.current.ajustes.porAudiencia.entidad).toEqual({
      mesh: false,
      limiteMeshMb: null,
    });
    expect(result.current.ajustes.porAudiencia.publico).toEqual({
      mesh: false,
      limiteMeshMb: null,
    });
    expect(result.current.ajustes.compartirConOtros).toBe(false);
  });

  it("el primer render es el mismo en servidor y cliente (defectos fijos)", () => {
    const { result } = montar();

    expect(result.current.ajustes).toEqual(ajustesPorDefecto());
  });

  it("con algo guardado manda lo guardado", () => {
    const guardado = {
      version: 1,
      compartirConOtros: true,
      banco: { activo: true, modo: "diario", diarioMb: 250, ventanas: [] },
      porAudiencia: {
        "mi-cuenta": { mesh: true, limiteMeshMb: 80 },
        entidad: { mesh: true, limiteMeshMb: null },
        publico: { mesh: false, limiteMeshMb: null },
      },
      declaraLimitada: false,
      compartirMedidas: true,
    };
    const { result } = montar(crearAlmacen({ [CLAVE_AJUSTES]: JSON.stringify(guardado) }));

    expect(result.current.ajustes.porAudiencia["mi-cuenta"].limiteMeshMb).toBe(80);
    expect(result.current.ajustes.porAudiencia.entidad.mesh).toBe(true);
    expect(result.current.ajustes.compartirConOtros).toBe(true);
    expect(result.current.ajustes.banco.diarioMb).toBe(250);
    expect(result.current.ajustes.compartirMedidas).toBe(true);
  });

  it("un guardado parcial completa lo que falta con los defectos", () => {
    const parcial = {
      version: 1,
      porAudiencia: { entidad: { mesh: true, limiteMeshMb: 10 } },
    };
    const { result } = montar(crearAlmacen({ [CLAVE_AJUSTES]: JSON.stringify(parcial) }));

    expect(result.current.ajustes.porAudiencia.entidad).toEqual({
      mesh: true,
      limiteMeshMb: 10,
    });
    expect(result.current.ajustes.porAudiencia["mi-cuenta"]).toEqual({
      mesh: true,
      limiteMeshMb: null,
    });
    expect(result.current.ajustes.compartirConOtros).toBe(false);
  });
});
