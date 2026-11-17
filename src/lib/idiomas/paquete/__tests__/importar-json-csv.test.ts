import { describe, it, expect } from "vitest";
import { desdeCsv, desdeJsonAnidado, desdeJsonPlano } from "../importar-json-csv";

describe("desdeJsonPlano", () => {
  it("importa pares clave-valor y descarta el valor numérico", () => {
    const r = desdeJsonPlano('{"hola":"Hola","dias":3}');
    expect(r.entradas).toEqual({ hola: "Hola" });
    expect(r.descartadas).toHaveLength(1);
    expect(r.descartadas[0].motivo).toContain("dias");
    expect(r.descartadas[0].motivo).toContain("número");
  });

  it("devuelve vacío y un motivo ante JSON roto", () => {
    const r = desdeJsonPlano('{"hola": "Hola"');
    expect(Object.keys(r.entradas)).toHaveLength(0);
    expect(r.descartadas).toHaveLength(1);
    expect(r.descartadas[0].motivo).toContain("JSON");
  });
});

describe("desdeJsonAnidado", () => {
  it("aplana tres niveles con puntos", () => {
    const r = desdeJsonAnidado(
      '{"menu":{"archivo":{"abrir":"Abrir","cerrar":"Cerrar"},"ayuda":"Ayuda"}}',
    );
    expect(r.entradas["menu.archivo.abrir"]).toBe("Abrir");
    expect(r.entradas["menu.archivo.cerrar"]).toBe("Cerrar");
    expect(r.entradas["menu.ayuda"]).toBe("Ayuda");
    expect(r.descartadas).toHaveLength(0);
  });
});

describe("desdeCsv", () => {
  it("importa CSV con comas y comillas dobles", () => {
    const r = desdeCsv('key,traduccion\nsaludo,"Hola, mundo"\ndespedida,"Dijo ""adiós"""');
    expect(r.entradas["saludo"]).toBe("Hola, mundo");
    expect(r.entradas["despedida"]).toBe('Dijo "adiós"');
  });

  it("importa TSV con cabecera detectada", () => {
    const r = desdeCsv("clave\ttexto\nhola\tHola\nadios\tAdiós", "\t");
    expect(r.entradas["hola"]).toBe("Hola");
    expect(r.entradas["adios"]).toBe("Adiós");
    expect(r.descartadas).toHaveLength(0);
  });

  it("ignora el BOM inicial", () => {
    const r = desdeCsv("﻿key,valor\nhola,Hola");
    expect(r.entradas["hola"]).toBe("Hola");
  });
});
