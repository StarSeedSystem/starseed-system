import { describe, expect, it } from "vitest";
import {
  CLAVE_SERVIDOR_NEURONA,
  MAX_ASOCIACIONES,
  asociarServidor,
  guardarAsociaciones,
  interpretarMapa,
  leerAsociaciones,
  neuronaDeServidor,
  serializarMapa,
  servidoresDeNeurona,
  textoUnion,
  unirServidoresConVinculos,
} from "../registro-servidor-neurona";

const memoria = (ini?: string) => {
  const d = new Map<string, string>(ini ? [[CLAVE_SERVIDOR_NEURONA, ini]] : []);
  return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), d };
};

describe("interpretarMapa", () => {
  it.each([null, undefined, "", "no json", "[]", '{"v":2,"mapa":{"a":"b"}}', '{"v":1,"mapa":[1]}', '{"v":1}'])("%s → vacío", (t) => {
    expect(interpretarMapa(t as string)).toEqual({});
  });
  it("ida y vuelta", () => {
    const m = { s1: "n1", s2: "n2" };
    expect(interpretarMapa(serializarMapa(m))).toEqual(m);
  });
  it("descarta entradas que no son texto", () => {
    expect(interpretarMapa('{"v":1,"mapa":{"a":"n","b":3,"c":"","d":null}}')).toEqual({ a: "n" });
  });
  it("no se contamina con __proto__", () => {
    const m = interpretarMapa('{"v":1,"mapa":{"__proto__":"x","a":"n"}}');
    expect(neuronaDeServidor(m, "toString")).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("respeta el tope", () => {
    const mapa = Object.fromEntries(Array.from({ length: MAX_ASOCIACIONES + 20 }, (_, i) => [`s${i}`, `n${i}`]));
    expect(Object.keys(interpretarMapa(serializarMapa(mapa)))).toHaveLength(MAX_ASOCIACIONES);
  });
});

describe("asociarServidor", () => {
  it("asocia sin mutar", () => {
    const base = Object.freeze({ a: "n1" });
    const r = asociarServidor(base, "b", " n2 ");
    expect(r).toEqual({ a: "n1", b: "n2" });
    expect(base).toEqual({ a: "n1" });
  });
  it("reasocia y quita", () => {
    expect(asociarServidor({ a: "n1" }, "a", "n9")).toEqual({ a: "n9" });
    expect(asociarServidor({ a: "n1", b: "n2" }, "a", null)).toEqual({ b: "n2" });
    expect(asociarServidor({ a: "n1" }, "a", "  ")).toEqual({});
  });
  it("ignora un servidor sin id", () => expect(asociarServidor({ a: "n" }, "", "n2")).toEqual({ a: "n" }));
  it("no pasa del tope con servidores nuevos", () => {
    const lleno = Object.fromEntries(Array.from({ length: MAX_ASOCIACIONES }, (_, i) => [`s${i}`, "n"]));
    expect(asociarServidor(lleno, "nuevo", "n")).toBe(lleno);
    expect(asociarServidor(lleno, "s0", "otra").s0).toBe("otra");
  });
});

describe("consultas", () => {
  it("neuronaDeServidor / servidoresDeNeurona", () => {
    const m = { a: "n1", b: "n1", c: "n2" };
    expect(neuronaDeServidor(m, "c")).toBe("n2");
    expect(neuronaDeServidor(m, "z")).toBeNull();
    expect(servidoresDeNeurona(m, "n1")).toEqual(["a", "b"]);
    expect(servidoresDeNeurona(m, "n9")).toEqual([]);
  });
});

describe("unirServidoresConVinculos", () => {
  const vinculos = [{ neurona: "n1", nombre: "Mac de Alex" }, { neurona: "n3", nombre: "Otra" }];
  const servidores = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  const filas = unirServidoresConVinculos(servidores, vinculos, { a: "n1", b: "n2" });
  it("conserva el orden y dice el estado de cada uno", () => {
    expect(filas.map((f) => [f.servidor, f.estado])).toEqual([["a", "vinculada"], ["b", "asociada-sin-vinculo"], ["c", "sin-asociar"]]);
  });
  it("trae el vínculo y la neurona", () => {
    expect(filas[0]).toMatchObject({ neurona: "n1", vinculo: { nombre: "Mac de Alex" } });
    expect(filas[1]).toMatchObject({ neurona: "n2", vinculo: null });
    expect(filas[2]).toMatchObject({ neurona: null, vinculo: null });
  });
  it("sin servidores, nada", () => expect(unirServidoresConVinculos([], vinculos, { a: "n1" })).toEqual([]));
  it("textos", () => {
    expect(textoUnion(filas[0])).toBe("neurona vinculada: Mac de Alex");
    expect(textoUnion(filas[1])).toMatch(/sin vincular/);
    expect(textoUnion(filas[2])).toBe("sin neurona asociada");
  });
});

describe("almacén", () => {
  it("guarda y lee con la clave versionada", () => {
    const s = memoria();
    expect(guardarAsociaciones({ a: "n1" }, s)).toBe(true);
    expect(CLAVE_SERVIDOR_NEURONA).toMatch(/\.v1$/);
    expect(s.d.has(CLAVE_SERVIDOR_NEURONA)).toBe(true);
    expect(leerAsociaciones(s)).toEqual({ a: "n1" });
  });
  it("valor roto → vacío", () => expect(leerAsociaciones(memoria("{roto"))).toEqual({}));
  it("un almacén que lanza no rompe nada", () => {
    const malo = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(leerAsociaciones(malo)).toEqual({});
    expect(guardarAsociaciones({ a: "n" }, malo)).toBe(false);
  });
});
