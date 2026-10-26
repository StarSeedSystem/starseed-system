import { describe, expect, it } from "vitest";
import { CLAVE_HISTORIAL, borrarHistorial, conEntrada, leerHistorial, recordarPeticion } from "../historial";
import { MAX_HISTORIAL, type EntradaHistorial } from "../tipos";

function almacen(inicial?: string) {
  const m = new Map<string, string>(inicial ? [[CLAVE_HISTORIAL, inicial]] : []);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const e = (texto: string, en = 1, modo: "directo" | "rama" = "directo"): EntradaHistorial => ({ texto, modo, ruta: "/x", en });

describe("historial de peticiones", () => {
  it("guarda lo último primero, sin duplicados y acotado", () => {
    const a = almacen();
    for (let i = 0; i < 20; i++) recordarPeticion(e(`petición ${i}`, i), a);
    const lista = leerHistorial(a);
    expect(lista.length).toBe(MAX_HISTORIAL);
    expect(lista[0].texto).toBe("petición 19");
    recordarPeticion(e("PETICIÓN 15", 99), a);
    const otra = leerHistorial(a);
    expect(otra.filter((x) => x.texto.toLowerCase() === "petición 15").length).toBe(1);
    expect(otra[0].en).toBe(99);
  });

  it("el mismo texto en otro modo es otra entrada", () => {
    expect(conEntrada([e("hola", 1, "directo")], e("hola", 2, "rama")).length).toBe(2);
  });

  it("JSON roto, entradas inválidas o un almacén que lanza: lista vacía o filtrada, nunca un error", () => {
    expect(leerHistorial(almacen("{no es json"))).toEqual([]);
    expect(leerHistorial(almacen(JSON.stringify([e("bien"), { texto: 3 }, null, "x"])))).toHaveLength(1);
    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => { throw new Error("bloqueado"); } };
    expect(leerHistorial(roto)).toEqual([]);
    expect(() => recordarPeticion(e("x"), roto)).not.toThrow();
    expect(() => borrarHistorial(roto)).not.toThrow();
    expect(leerHistorial(null)).toEqual([]);
  });

  it("borrar lo vacía", () => {
    const a = almacen();
    recordarPeticion(e("algo"), a);
    borrarHistorial(a);
    expect(leerHistorial(a)).toEqual([]);
  });
});
