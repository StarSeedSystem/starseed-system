import { beforeEach, describe, expect, it } from "vitest";
import { CONVERSORES_TEXTO, comoTexto, csvAJson, jsonACsv, srtAVtt, vttASrt } from "../conv-texto";
import { ejecutarRuta, limpiarConversores, registrarConversor, rutaDeConversion } from "../convertidores";

const leer = (json: string): Record<string, string>[] => JSON.parse(json) as Record<string, string>[];
const SRT = [
  "1", "00:00:01,000 --> 00:00:02,500", "Hola, mundo",
  "", "2", "00:00:03,250 --> 00:00:05,000", "Segunda línea", "con dos renglones", "",
].join("\n");

describe("CSV → JSON (RFC 4180)", () => {
  it("lee campos entre comillas con comas, comillas dobles y saltos de línea", () => {
    const csv = 'nombre,nota\n"Pérez, Ana","dijo ""hola""\nadiós"\n';
    expect(leer(csvAJson(csv))).toEqual([{ nombre: "Pérez, Ana", nota: 'dijo "hola"\nadiós' }]);
  });

  it("acepta CRLF, LF y CR mezclados y la fila final sin salto", () => {
    const csv = "a,b\r\n1,2\n3,4\r5,6";
    expect(leer(csvAJson(csv))).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }, { a: "5", b: "6" }]);
  });

  it("no adivina tipos: números y booleanos quedan como texto", () => {
    expect(leer(csvAJson("n,ok,vacio\n007,true,\n"))).toEqual([{ n: "007", ok: "true", vacio: "" }]);
  });

  it("columnas desiguales lanzan un error con el número de línea real", () => {
    expect(() => csvAJson('a,b\n1,2\n"x\ny",3,4\n')).toThrow(/línea 3 tiene 3 columnas y la cabecera 2/);
    expect(() => csvAJson("a,b\n1,2\nsola")).toThrow(/línea 3 tiene 1 columna y/);
  });

  it("comillas sin cerrar y cabeceras repetidas se dicen en español", () => {
    expect(() => csvAJson('a\n"abierta\n')).toThrow(/comillas sin cerrar.*línea 2/);
    expect(() => csvAJson("a,a\n1,2")).toThrow(/repite la columna «a»/);
  });

  it("tolera el BOM, en cadena o en bytes", () => {
    const bytes = new TextEncoder().encode("\uFEFFclave,valor\nx,1\n");
    expect(leer(csvAJson(bytes))).toEqual([{ clave: "x", valor: "1" }]);
    expect(comoTexto("\uFEFFhola")).toBe("hola");
  });

  it("entrada vacía o solo cabecera da un array vacío", () => {
    expect([csvAJson(""), csvAJson("a,b\n"), csvAJson("\n\r\n")]).toEqual(["[]", "[]", "[]"]);
  });
});

describe("JSON → CSV", () => {
  it("une las claves en orden de primera aparición y entrecomilla lo difícil", () => {
    const json = JSON.stringify([{ a: "1", b: 'di "sí"' }, { c: "x,y", a: "l1\nl2" }, { b: null, d: 3.5 }]);
    expect(jsonACsv(json)).toBe('a,b,c,d\r\n1,"di ""sí""",,\r\n"l1\nl2",,"x,y",\r\n,,,3.5\r\n');
  });

  it("ida y vuelta CSV → JSON → CSV → JSON conserva cada campo difícil", () => {
    const json = csvAJson('id,texto\n1,"coma, ""comillas"" y\r\nsalto"\n2,llano\n');
    expect(leer(json)[0].texto).toBe('coma, "comillas" y\r\nsalto');
    expect(csvAJson(jsonACsv(json))).toBe(json);
    const una = JSON.stringify([{ a: "" }, { a: "x" }, { a: "" }], null, 2); // una columna con vacíos
    expect(jsonACsv(una)).toBe('a\r\n""\r\nx\r\n""\r\n');
    expect(csvAJson(jsonACsv(una))).toBe(una);
  });

  it("objetos o arrays anidados lanzan «JSON demasiado anidado para CSV»", () => {
    for (const j of ['[{"a":{"b":1}}]', '[{"a":[1,2]}]']) expect(() => jsonACsv(j)).toThrow("JSON demasiado anidado para CSV");
  });
  it("rechaza lo que no es un array de objetos y el JSON roto", () => {
    expect(() => jsonACsv('{"a":1}')).toThrow(/array de objetos/);
    expect(() => jsonACsv("[1,2]")).toThrow(/debe ser un objeto/);
    expect(() => jsonACsv("[{")).toThrow(/no es un JSON válido/);
  });
  it("entrada vacía o array vacío da un CSV vacío", () => {
    expect([jsonACsv(""), jsonACsv("[]"), jsonACsv("[{}]")]).toEqual(["", "", ""]);
  });
});

describe("SRT ↔ VTT", () => {
  it("SRT → VTT: cabecera, punto en los tiempos y texto conservado en varios bloques", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHola, mundo\n\n";
    expect(srtAVtt(SRT)).toBe(`${vtt}00:00:03.250 --> 00:00:05.000\nSegunda línea\ncon dos renglones\n`);
  });

  it("VTT → SRT: quita cabecera y notas, numera, coma en los tiempos y quita ajustes", () => {
    const vtt = "\uFEFFWEBVTT - prueba\r\nKind: captions\r\n\r\nNOTE esto no sale\r\n\r\nintro\r\n" +
      "00:01.000 --> 00:02.000 align:start\r\nPrimero\r\n\r\n\r\n01:00:00.500 --> 01:00:01.000\nÚltimo\n";
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nPrimero\n\n2\n01:00:00,500 --> 01:00:01,000\nÚltimo\n";
    expect(vttASrt(vtt)).toBe(srt);
  });

  it("ida y vuelta SRT → VTT → SRT devuelve el mismo SRT aunque llegue con CRLF y BOM", () => {
    expect(vttASrt(srtAVtt("\uFEFF" + SRT.replace(/\n/g, "\r\n")))).toBe(SRT);
  });

  it("entrada vacía: VTT solo con cabecera y SRT vacío", () => {
    expect(srtAVtt("")).toBe("WEBVTT\n");
    expect(vttASrt("WEBVTT\n\n")).toBe("");
  });

  it("un bloque sin línea de tiempos o con un tiempo roto lanza un error claro", () => {
    expect(() => srtAVtt("1\nsolo texto\n")).toThrow(/bloque 1 .*línea de tiempos/);
    expect(() => srtAVtt("1\n00:00:xx,000 --> 00:00:02,000\nA\n")).toThrow(/Marca de tiempo no válida/);
    expect(() => srtAVtt("1\n00:61:00,000 --> 00:00:02,000\nA\n")).toThrow(/Marca de tiempo no válida/);
  });
});

describe("CONVERSORES_TEXTO en el registro de convertidores", () => {
  beforeEach(() => limpiarConversores());
  it("son cuatro, vía js, costo 1 y con convertir real", () => {
    expect(CONVERSORES_TEXTO.map((c) => `${c.de}>${c.a}`)).toEqual(["csv>json", "json>csv", "srt>vtt", "vtt>srt"]);
    for (const c of CONVERSORES_TEXTO) expect(c).toMatchObject({ via: "js", costo: 1, convertir: expect.any(Function) });
  });

  it("tras registrarlos, rutaDeConversion encuentra srt → vtt y ejecutarRuta convierte de verdad", () => {
    expect(rutaDeConversion("srt", "vtt")).toBeNull();
    CONVERSORES_TEXTO.forEach(registrarConversor);
    const ruta = rutaDeConversion("srt", "text/vtt");
    expect(ruta?.pasos.map((p) => p.nombre)).toEqual(["srt-a-vtt"]);
    expect(ruta ? ejecutarRuta(ruta, SRT) : null).toEqual({ ok: true, salida: srtAVtt(SRT) });
    const mal = ejecutarRuta(rutaDeConversion("json", "csv") ?? { pasos: [], costo: 0 }, '[{"a":{}}]');
    expect(mal).toMatchObject({ ok: false, motivo: expect.stringMatching(/demasiado anidado/) });
  });
});
