// keys.test.ts — keys estables para listas dinámicas (SA092931 · SP092937b).
// Solo funciones puras: nada de render, red ni disco.
import { describe, it, expect } from "vitest";
import { keyPorContenido, keysUnicas } from "../index";

describe("keyPorContenido", () => {
  it("prefiere id y slug antes que el contenido", () => {
    expect(keyPorContenido({ id: "ef-7", name: "Aurora" })).toBe("ef-7");
    expect(keyPorContenido({ slug: "pleno-octubre" })).toBe("pleno-octubre");
  });

  it("devuelve el string tal cual y recorta espacios", () => {
    expect(keyPorContenido("pleno")).toBe("pleno");
    expect(keyPorContenido("  pleno  ")).toBe("pleno");
  });

  it("cae en nombre, título, hora y rol cuando no hay id ni slug", () => {
    expect(keyPorContenido({ name: "Sol", role: "facilita" })).toBe("Sol·facilita");
    expect(keyPorContenido({ time: "10:00", title: "Apertura" })).toBe("Apertura·10:00");
  });

  it("no rompe con primitivas, nulos ni vacíos", () => {
    expect(keyPorContenido(42)).toBe("42");
    expect(keyPorContenido(null)).toBe("item");
    expect(keyPorContenido({})).toBe("item");
  });
});

describe("keysUnicas", () => {
  it("da keys distintas ante delegados con el mismo nombre", () => {
    const delegadas = [{ name: "Sol" }, { name: "Luna" }, { name: "Sol" }];
    expect(keysUnicas(delegadas)).toEqual(["Sol", "Luna", "Sol#1"]);
  });

  it("es determinista ante reordenaciones de contenido distinto", () => {
    const a = [{ name: "Sol", role: "a" }, { name: "Luna", role: "b" }];
    const b = [{ name: "Luna", role: "b" }, { name: "Sol", role: "a" }];
    expect(new Set(keysUnicas(a))).toEqual(new Set(keysUnicas(b)));
  });

  it("resuelve identificadores únicos de entrada a entrada", () => {
    const entradas = [{ id: "x" }, { id: "y" }, { name: "z" }];
    expect(keysUnicas(entradas)).toEqual(["x", "y", "z"]);
  });
});
