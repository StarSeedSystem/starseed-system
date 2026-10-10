import { describe, it, expect } from "vitest";
import {
  almacenNavegador,
  borrarMolecula,
  cargarMolecula,
  esMoleculaValida,
  guardarMolecula,
  listarMoleculas,
  CLAVE_INDICE,
  PREFIJO_MOLECULA,
  type AlmacenLocal,
} from "../almacen-moleculas";
import type { Molecula } from "../tipos";

function almacenMemoria(): AlmacenLocal {
  const datos = new Map<string, string>();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
}

function almacenRoto(): AlmacenLocal {
  return {
    getItem: () => {
      throw new Error("acceso denegado");
    },
    setItem: () => {
      throw new Error("acceso denegado");
    },
    removeItem: () => {
      throw new Error("acceso denegado");
    },
  };
}

function molecula(par: Partial<Molecula> = {}): Molecula {
  return {
    id: "m1",
    titulo: "Molécula de prueba",
    ambito: "personal",
    capas: [{ id: "c1", nombre: "Base" }],
    atomos: [{ id: "a1", capaId: "c1", tipo: "imagen" }],
    valores: { "a1.opacidad": 0.5 },
    version: 1,
    creadaEn: 1000,
    actualizadaEn: 2000,
    ...par,
  };
}

describe("almacen-moleculas", () => {
  it("guarda y carga una molécula (ida y vuelta)", () => {
    const a = almacenMemoria();
    const m = molecula();
    expect(guardarMolecula(a, m)).toBe(true);
    expect(cargarMolecula(a, "m1")).toEqual(m);
  });

  it("carga null si el id no existe", () => {
    expect(cargarMolecula(almacenMemoria(), "inexistente")).toBeNull();
  });

  it("devuelve null ante JSON corrupto y no borra nada", () => {
    const a = almacenMemoria();
    a.setItem(PREFIJO_MOLECULA + "m1", "{no es json");
    expect(cargarMolecula(a, "m1")).toBeNull();
    expect(a.getItem(PREFIJO_MOLECULA + "m1")).toBe("{no es json");
  });

  it("devuelve null ante molécula con estructura inválida", () => {
    const a = almacenMemoria();
    a.setItem(PREFIJO_MOLECULA + "m1", JSON.stringify({ id: "m1", titulo: 42 }));
    expect(cargarMolecula(a, "m1")).toBeNull();
  });

  it("esMoleculaValida rechaza ámbito inválido y valores raros", () => {
    expect(esMoleculaValida(molecula({ ambito: "otro" as never }))).toBe(false);
    expect(esMoleculaValida(molecula({ valores: { x: {} } as never }))).toBe(false);
    expect(esMoleculaValida(null)).toBe(false);
    expect(esMoleculaValida(molecula())).toBe(true);
  });

  it("esMoleculaValida rechaza JSON serializado mayor de 256 KB", () => {
    const grande = molecula({ titulo: "x".repeat(300 * 1024) });
    expect(esMoleculaValida(grande)).toBe(false);
  });

  it("listarMoleculas ordena de más reciente a más antigua", () => {
    const a = almacenMemoria();
    guardarMolecula(a, molecula({ id: "vieja", actualizadaEn: 10 }));
    guardarMolecula(a, molecula({ id: "nueva", actualizadaEn: 99 }));
    guardarMolecula(a, molecula({ id: "media", actualizadaEn: 50 }));
    expect(listarMoleculas(a).map((r) => r.id)).toEqual(["nueva", "media", "vieja"]);
    expect(listarMoleculas(a)[0].ambito).toBe("personal");
  });

  it("listarMoleculas omite entradas corruptas", () => {
    const a = almacenMemoria();
    guardarMolecula(a, molecula({ id: "buena", actualizadaEn: 5 }));
    a.setItem(PREFIJO_MOLECULA + "mala", "§§§");
    a.setItem(CLAVE_INDICE, JSON.stringify({ ids: ["buena", "mala"] }));
    expect(listarMoleculas(a).map((r) => r.id)).toEqual(["buena"]);
  });

  it("listarMoleculas con índice corrupto devuelve lista vacía", () => {
    const a = almacenMemoria();
    a.setItem(CLAVE_INDICE, "no-json");
    expect(listarMoleculas(a)).toEqual([]);
  });

  it("borrarMolecula quita datos e índice", () => {
    const a = almacenMemoria();
    guardarMolecula(a, molecula({ id: "m1" }));
    expect(borrarMolecula(a, "m1")).toBe(true);
    expect(cargarMolecula(a, "m1")).toBeNull();
    expect(listarMoleculas(a)).toEqual([]);
    expect(borrarMolecula(a, "m1")).toBe(false);
  });

  it("guardar rechaza una molécula inválida", () => {
    expect(guardarMolecula(almacenMemoria(), molecula({ id: "" }))).toBe(false);
  });

  it("con almacén que lanza, nada explota y todo devuelve valores seguros", () => {
    const a = almacenRoto();
    expect(guardarMolecula(a, molecula())).toBe(false);
    expect(cargarMolecula(a, "m1")).toBeNull();
    expect(listarMoleculas(a)).toEqual([]);
    expect(borrarMolecula(a, "m1")).toBe(false);
  });

  it("almacenNavegador devuelve null cuando localStorage no existe", () => {
    expect(almacenNavegador()).toBeNull();
  });
});
