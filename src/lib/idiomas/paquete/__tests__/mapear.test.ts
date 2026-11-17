import { describe, it, expect } from "vitest";
import { mapearClaves, MAX_SIN_CASAR } from "../mapear";

describe("mapearClaves", () => {
  it("casa una clave exacta con la clave española", () => {
    const r = mapearClaves({ "Guardar cambios": "Save changes" }, ["Guardar cambios"]);
    expect(r.casadas).toBe(1);
    expect(r.entradas["Guardar cambios"]).toBe("Save changes");
    expect(r.sinCasar).toEqual([]);
    expect(r.porcentaje).toBe(100);
  });

  it("casa aunque los espacios sean distintos", () => {
    const r = mapearClaves({ "Guardar   cambios": "Save changes" }, ["Guardar  cambios"]);
    expect(r.casadas).toBe(1);
    expect(r.entradas["Guardar cambios"]).toBe("Save changes");
  });

  it("casa el valor fuente ignorando mayúsculas y punto final si la clave parece un identificador", () => {
    const r = mapearClaves({ "menu.save": "guardar." }, ["Guardar"]);
    expect(r.casadas).toBe(1);
    expect(r.entradas["Guardar"]).toBe("guardar.");
  });

  it("casa el valor fuente exacto si la clave parece un identificador", () => {
    const r = mapearClaves({ "menu.save": "Guardar" }, ["Guardar"]);
    expect(r.casadas).toBe(1);
    expect(r.entradas["Guardar"]).toBe("Guardar");
  });

  it("no casa por subcadena: «Guardar» no casa con «Guardar todo»", () => {
    const r = mapearClaves({ "Guardar": "Save", "Guardar todo": "Save all" }, ["Guardar todo"]);
    expect(r.casadas).toBe(1);
    expect(r.entradas["Guardar todo"]).toBe("Save all");
    expect(r.sinCasar).toEqual(["Guardar"]);
  });

  it("da el porcentaje correcto sobre el total importado", () => {
    const r = mapearClaves(
      { "Guardar": "S", "Cancelar": "C", "Abrir": "A", "Otro": "O" },
      ["Guardar", "Cancelar", "Abrir", "Cerrar"],
    );
    expect(r.casadas).toBe(3);
    expect(r.porcentaje).toBe(75);
    expect(r.sinCasar).toEqual(["Otro"]);
  });

  it("devuelve un resultado vacío sin entradas importadas", () => {
    const r = mapearClaves({}, ["Guardar"]);
    expect(r).toEqual({ entradas: {}, casadas: 0, sinCasar: [], porcentaje: 0 });
  });

  it("acepta la fuente como objeto con las claves españolas", () => {
    const r = mapearClaves({ "Cancelar": "Cancel" }, { "Cancelar": [1, 2], "Guardar": [] });
    expect(r.casadas).toBe(1);
    expect(r.entradas["Cancelar"]).toBe("Cancel");
  });

  it("limita sinCasar al máximo para que la persona lo vea", () => {
    const importadas: Record<string, string> = {};
    for (let i = 0; i < MAX_SIN_CASAR + 5; i += 1) importadas[`ajena ${i}`] = `texto ${i}`;
    const r = mapearClaves(importadas, ["Guardar"]);
    expect(r.casadas).toBe(0);
    expect(r.sinCasar).toHaveLength(MAX_SIN_CASAR);
    expect(r.porcentaje).toBe(0);
  });
});
