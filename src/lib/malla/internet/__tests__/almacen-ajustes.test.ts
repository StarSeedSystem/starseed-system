import { describe, it, expect } from "vitest";
import { leerAjustes, guardarAjustes, AJUSTES_APAGADOS } from "../almacen-ajustes";

describe("almacen-ajustes", () => {
  it("debe retornar los ajustes por defecto si el almacén está vacío", () => {
    const almacen = {
      getItem: () => null,
      setItem: () => {},
    };
    const ajustes = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(ajustes).toEqual(AJUSTES_APAGADOS);
  });

  it("debe retornar los ajustes por defecto si el JSON está roto", () => {
    const almacen = {
      getItem: () => "invalid-json",
      setItem: () => {},
    };
    const ajustes = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(ajustes).toEqual(AJUSTES_APAGADOS);
  });

  it("debe retornar los ajustes por defecto si la versión es distinta", () => {
    const almacen = {
      getItem: () => JSON.stringify({ version: "v0" }),
      setItem: () => {},
    };
    const ajustes = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(ajustes).toEqual(AJUSTES_APAGADOS);
  });

  it("debe realizar la operación de ida y vuelta correctamente", () => {
    let store: string | null = null;
    const almacen = {
      getItem: () => store,
      setItem: (_: string, value: string) => { store = value; },
    };
    
    const nuevosAjustes = { ...AJUSTES_APAGADOS, compartirConOtros: true };
    const guardado = guardarAjustes(almacen, nuevosAjustes);
    expect(guardado).toBe(true);
    
    const leidos = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(leidos).toEqual(nuevosAjustes);
  });

  it("debe reemplazar campos inválidos con defectos", () => {
    const almacen = {
      getItem: () => JSON.stringify({ 
        version: "v1", 
        compartirConOtros: "not-a-boolean",
        bancoInactivo: { modo: "invalido", limiteMb: -5 }
      }),
      setItem: () => {},
    };
    const ajustes = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(ajustes.compartirConOtros).toBe(AJUSTES_APAGADOS.compartirConOtros);
    expect(ajustes.bancoInactivo.limiteMb).toBe(AJUSTES_APAGADOS.bancoInactivo.limiteMb);
    expect(ajustes.bancoInactivo.modo).toBe(AJUSTES_APAGADOS.bancoInactivo.modo);
  });
});
