// Pruebas de la fusión RRF de recuerdos (LNN1028A). Solo funciones puras:
// `fundirRecuerdos`, `huellaTexto` y `pesoVectorPara`. Sin red, sin disco.

import { describe, it, expect } from "vitest";
import { fundirRecuerdos, huellaTexto, pesoVectorPara } from "../fusion-recuerdos";
import type { Recuerdo } from "../fusion-recuerdos";

const r = (uri: string, texto: string, fuente: Recuerdo["fuente"]): Recuerdo => ({
  uri,
  texto,
  fuente,
  alcance: "perfil",
});

describe("huellaTexto", () => {
  it("normaliza caja y espacios: la misma frase deja la misma huella", () => {
    expect(huellaTexto("El  café  de mañana")).toBe(huellaTexto("el café de mañana"));
    expect(huellaTexto("  El café de mañana\n")).toBe("el café de mañana");
  });
});

describe("fundirRecuerdos", () => {
  it("un recuerdo que aparece en las dos listas sube a lo más alto", () => {
    const memvid = [r("mv2://a", "uno", "memvid"), r("mv2://b", "dos", "memvid")];
    const leann = [r("lz://d", "cuatro", "leann"), r("mv2://a", "uno", "leann")];
    const [primero] = fundirRecuerdos([memvid, leann]);
    expect(primero.uri).toBe("mv2://a");
    // Voto doble: 1/61 + 1/62 vence a cualquier voto simple.
    expect(primero.puntuacion ?? 0).toBeCloseTo(1 / 61 + 1 / 62, 6);
    expect(fundirRecuerdos([memvid, leann]).length).toBe(4);
  });

  it("dedupe por uri: sale una vez y se queda con el texto más largo", () => {
    const memvid = [r("mv2://a", "corto", "memvid")];
    const leann = [r("mv2://a", "el texto más largo de los dos", "leann")];
    const fusion = fundirRecuerdos([memvid, leann]);
    expect(fusion.length).toBe(1);
    expect(fusion[0].texto).toBe("el texto más largo de los dos");
    expect(fusion[0].fuente).toBe("leann");
  });

  it("sin uri, la huella del texto une los dobles", () => {
    const memvid = [
      { ...r("", "El café de mañana", "memvid") },
      r("mv2://otra", "otra cosa", "memvid"),
    ];
    const leann = [{ ...r("", "el café   de mañana", "leann") }];
    const fusion = fundirRecuerdos([memvid, leann]);
    expect(fusion.length).toBe(2);
    expect(fusion[0].texto).toBe("El café de mañana");
    expect(fusion[0].puntuacion ?? 0).toBeCloseTo(1 / 61 + 1 / 61, 6);
  });

  it("no toca las listas de entrada (puro)", () => {
    const memvid = [r("mv2://a", "uno", "memvid")];
    fundirRecuerdos([memvid]);
    expect(memvid[0].puntuacion).toBeUndefined();
  });

  it("corte por max: nada por encima del tope, mejor rango primero", () => {
    const lista = ["a", "b", "c", "d", "e", "f", "g", "h"].map((u) => r(`mv2://${u}`, u, "memvid"));
    const fusion = fundirRecuerdos([lista], { max: 6 });
    expect(fusion.length).toBe(6);
    expect(fusion.map((rec) => rec.uri)).toEqual([
      "mv2://a", "mv2://b", "mv2://c", "mv2://d", "mv2://e", "mv2://f",
    ]);
    expect(fundirRecuerdos([lista]).length).toBe(6); // por defecto, también 6
  });

  it("corte por maxCaracteres: solo caben los recuerdos enteros", () => {
    const larga = r("mv2://larga", "x".repeat(1000), "memvid");
    const media = r("mv2://media", "y".repeat(600), "memvid");
    const cortita = r("mv2://cortita", "z".repeat(100), "memvid");
    const fusion = fundirRecuerdos([[larga, media, cortita]], { maxCaracteres: 1500 });
    // La media no entra por no caber entera, pero la siguiente sí: el corte es
    // por presupuesto acumulado, no se salta un recuerdo para colar otro.
    expect(fusion.map((rec) => rec.uri)).toEqual(["mv2://larga", "mv2://cortita"]);
  });
});

describe("pesoVectorPara", () => {
  it("0,7 por defecto: la pregunta normal habla de significado", () => {
    expect(pesoVectorPara("¿qué dije del café de la mañana?")).toBe(0.7);
  });

  it("0,4 con comillas: la consulta pide palabras exactas", () => {
    expect(pesoVectorPara("busca «planes del café» en la cápsula")).toBe(0.4);
    expect(pesoVectorPara('dijo que "no hay nada" al respecto')).toBe(0.4);
  });

  it("0,4 con un nombre propio fuera del arranque de la frase", () => {
    expect(pesoVectorPara("dime qué acordamos con Ana del café")).toBe(0.4);
  });

  it("la mayúscula que abre la frase no es nombre propio", () => {
    expect(pesoVectorPara("¿Qué dije de la cafetería?")).toBe(0.7);
  });
});
