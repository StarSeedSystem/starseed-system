// Pruebas de los valores por defecto de los ajustes de internet (INT19). Contrato:
// architecture/malla-cristalina-sio2.md §8.2 — sin nada guardado, la malla de «mi-cuenta» sale
// encendida y sin límite; las otras dos, apagadas; con algo guardado, manda lo guardado.
//
// Aviso de alcance: el contrato cambia el valor por defecto del gancho, así que la prueba de
// `use-ajustes-internet.test.tsx` (INT08), que comparaba con `AJUSTES_APAGADOS` al montar, se
// actualizó a los valores por defecto en ese archivo (no estaba en la lista de esta tarea).

import { cleanup, renderHook } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { useAjustesInternet } from "../use-ajustes-internet";
import { leerAjustes } from "../almacen-ajustes";
import { ajustesPorDefecto } from "../defectos-audiencia";
import type { AjustesInternet } from "../tipos";

const CLAVE_AJUSTES = "starseed.malla.internet.v1";
const ahoraBase = 1700000000000;
const desfaseBase = -new Date().getTimezoneOffset();

function crearAlmacen(datos: Record<string, string> = {}) {
  const internos = datos;
  return {
    getItem: (clave: string) => internos[clave] ?? null,
    setItem: (clave: string, valor: string) => { internos[clave] = valor; },
  };
}

function ajustesGuardados(): AjustesInternet {
  return {
    version: 1,
    compartirConOtros: true,
    banco: { activo: true, modo: "diario", diarioMb: 500, ventanas: [] },
    porAudiencia: {
      "mi-cuenta": { mesh: false, limiteMeshMb: 120 },
      entidad: { mesh: true, limiteMeshMb: null },
      publico: { mesh: false, limiteMeshMb: null },
    },
    declaraLimitada: true,
    compartirMedidas: true,
  };
}

function montar(almacen = crearAlmacen()) {
  return renderHook(() =>
    useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase, almacen })
  );
}

describe("useAjustesInternet · valores por defecto", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("sin nada guardado, «mi-cuenta» sale con la malla encendida y sin límite y las otras dos apagadas", () => {
    const { result } = montar();

    expect(result.current.ajustes.porAudiencia["mi-cuenta"].mesh).toBe(true);
    expect(result.current.ajustes.porAudiencia["mi-cuenta"].limiteMeshMb).toBeNull();
    expect(result.current.ajustes.porAudiencia.entidad.mesh).toBe(false);
    expect(result.current.ajustes.porAudiencia.entidad.limiteMeshMb).toBeNull();
    expect(result.current.ajustes.porAudiencia.publico.mesh).toBe(false);
    expect(result.current.ajustes.porAudiencia.publico.limiteMeshMb).toBeNull();
  });

  it("sin nada guardado, compartir con otros y el modo banco siguen apagados", () => {
    const { result } = montar();
    expect(result.current.ajustes.compartirConOtros).toBe(false);
    expect(result.current.ajustes.banco.activo).toBe(false);
    expect(result.current.ajustes.compartirMedidas).toBe(false);
    expect(result.current.ajustes.declaraLimitada).toBeNull();
  });

  it("con algo guardado manda lo guardado", () => {
    const { result } = montar(crearAlmacen({ [CLAVE_AJUSTES]: JSON.stringify(ajustesGuardados()) }));
    expect(result.current.ajustes.porAudiencia["mi-cuenta"].mesh).toBe(false);
    expect(result.current.ajustes.porAudiencia["mi-cuenta"].limiteMeshMb).toBe(120);
    expect(result.current.ajustes.porAudiencia.entidad.mesh).toBe(true);
    expect(result.current.ajustes.compartirConOtros).toBe(true);
    expect(result.current.ajustes.banco.activo).toBe(true);
    expect(result.current.ajustes.banco.diarioMb).toBe(500);
  });

  it("el primer render es el mismo en el servidor y en el cliente (los defectos no leen del aparato)", () => {
    const vistos: AjustesInternet[] = [];
    const almacen = crearAlmacen({ [CLAVE_AJUSTES]: JSON.stringify(ajustesGuardados()) });

    renderHook(() => {
      const resultado = useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase, almacen });
      vistos.push(resultado.ajustes);
      return resultado;
    });

    expect(vistos.length).toBeGreaterThan(1);
    expect(vistos[0]).toEqual(ajustesPorDefecto());
    expect(vistos[vistos.length - 1]).toEqual(ajustesGuardados());
  });
});

describe("leerAjustes con los valores por defecto", () => {
  it("sin nada guardado devuelve los valores por defecto", () => {
    const resultado = leerAjustes(crearAlmacen(), ajustesPorDefecto());

    expect(resultado.porAudiencia["mi-cuenta"].mesh).toBe(true);
    expect(resultado.porAudiencia.entidad.mesh).toBe(false);
    expect(resultado.porAudiencia.publico.mesh).toBe(false);
    expect(resultado.compartirConOtros).toBe(false);
  });

  it("con algo guardado devuelve lo guardado", () => {
    const almacen = crearAlmacen({ [CLAVE_AJUSTES]: JSON.stringify(ajustesGuardados()) });
    const resultado = leerAjustes(almacen, ajustesPorDefecto());

    expect(resultado.porAudiencia["mi-cuenta"].mesh).toBe(false);
    expect(resultado.porAudiencia["mi-cuenta"].limiteMeshMb).toBe(120);
    expect(resultado.porAudiencia.entidad.mesh).toBe(true);
    expect(resultado.compartirConOtros).toBe(true);
  });
});
