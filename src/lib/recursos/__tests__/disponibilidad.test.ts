import { describe, it, expect } from "vitest";
import {
  CADUCIDAD_MS,
  TOPE_MENSAJE_BYTES,
  indicesABits,
  codificar,
  decodificar,
  anuncio,
  fusionar,
  quienTiene,
} from "../disponibilidad";

const bytesDe = (texto: string): number => new TextEncoder().encode(texto).length;

describe("mapa de bits compacto", () => {
  it("codifica y decodifica sin perder bytes", () => {
    const mapa = indicesABits(20, [0, 3, 19, 20, -1]);
    expect(mapa.total).toBe(20);
    expect(mapa.bytes.length).toBe(3);
    const texto = codificar(mapa.bytes);
    expect(texto).not.toMatch(/[+/=]/);
    expect(Array.from(decodificar(texto) ?? [])).toEqual(Array.from(mapa.bytes));
  });

  it("acepta base64 estándar y rechaza texto roto", () => {
    expect(Array.from(decodificar("AP8Q") ?? [])).toEqual([0, 255, 16]);
    expect(decodificar("***")).toBeNull();
    expect(codificar(new Uint8Array(0))).toBe("");
  });
});

describe("anuncio", () => {
  it("trocea cada mensaje por debajo de 1 KB y se recompone", () => {
    const total = 20000;
    const indices = Array.from({ length: 10000 }, (_, i) => i * 2);
    const mensajes = anuncio("flujo:demo", { nodoId: "nodo-a", total, indices, t: 1000 });
    expect(mensajes.length).toBeGreaterThan(1);
    for (const mensaje of mensajes) expect(bytesDe(mensaje)).toBeLessThanOrEqual(TOPE_MENSAJE_BYTES);
    const disponible = fusionar(mensajes);
    for (const indice of [0, 2, 3000, 19998]) {
      expect(disponible.quienTiene("flujo:demo", indice, 1000)).toEqual(["nodo-a"]);
    }
    expect(disponible.quienTiene("flujo:demo", 1, 1000)).toEqual([]);
  });

  it("no anuncia nada sin elemento, nodo o tamaño", () => {
    expect(anuncio("", { nodoId: "n", total: 4, indices: [0] })).toEqual([]);
    expect(anuncio("e", { nodoId: "", total: 4, indices: [0] })).toEqual([]);
    expect(anuncio("e", { nodoId: "n", total: 0, indices: [0] })).toEqual([]);
  });
});

describe("fusionar y quienTiene", () => {
  it("fusiona nodos y se queda con el anuncio más reciente", () => {
    const viejo = anuncio("vol:1", { nodoId: "n1", total: 16, indices: [1, 2], t: 1000 });
    const nuevo = anuncio("vol:1", { nodoId: "n1", total: 16, indices: [3], t: 2000 });
    const otro = anuncio("vol:1", { nodoId: "n2", total: 16, indices: [2, 3], t: 2000 });
    const disponible = fusionar([...viejo, ...nuevo, ...otro]);
    expect(disponible.quienTiene("vol:1", 1, 2000)).toEqual([]);
    expect(disponible.quienTiene("vol:1", 2, 2000)).toEqual(["n2"]);
    expect(disponible.quienTiene("vol:1", 3, 2000)).toEqual(["n1", "n2"]);
    expect(disponible.quienTiene("vol:1", 9, 2000)).toEqual([]);
  });

  it("caduca a los 30 s por defecto y respeta otro tope", () => {
    const mensajes = anuncio("banda:9", { nodoId: "n", total: 8, indices: [4], t: 5000 });
    const disponible = fusionar(mensajes);
    expect(disponible.quienTiene("banda:9", 4, 5000 + CADUCIDAD_MS)).toEqual(["n"]);
    expect(disponible.quienTiene("banda:9", 4, 5001 + CADUCIDAD_MS)).toEqual([]);
    const corto = fusionar(mensajes, 100);
    expect(corto.quienTiene("banda:9", 4, 5100)).toEqual(["n"]);
    expect(corto.quienTiene("banda:9", 4, 5101)).toEqual([]);
  });

  it("ignora mensajes rotos y un anuncio vacío limpia lo anterior", () => {
    const lleno = anuncio("x", { nodoId: "n", total: 8, indices: [1], t: 10 });
    const vacio = anuncio("x", { nodoId: "n", total: 8, indices: [], t: 20 });
    expect(fusionar(["{no}", ...lleno]).quienTiene("x", 1, 10)).toEqual(["n"]);
    expect(fusionar([...lleno, ...vacio]).quienTiene("x", 1, 20)).toEqual([]);
    expect(fusionar(["{}", "null", "[]"]).quienTiene("x", 1, 0)).toEqual([]);
  });

  it("quienTiene acepta la disponibilidad ya fusionada", () => {
    const disponible = fusionar(anuncio("e", { nodoId: "n2", total: 4, indices: [0], t: 30 }));
    expect(quienTiene(disponible, "e", 0, 30)).toEqual(["n2"]);
    expect(quienTiene(disponible, "e", 1, 30)).toEqual([]);
    expect(quienTiene(disponible, "", 0, 30)).toEqual([]);
  });
});
