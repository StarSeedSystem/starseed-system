import { describe, it, expect, beforeEach } from "vitest";
import { CONVERSORES_TEXTO } from "../conv-texto";
import {
  registrarConversor,
  limpiarConversores,
  rutaDeConversion,
} from "../convertidores";

function conv(de: string, a: string) {
  const c = CONVERSORES_TEXTO.find((x) => x.de === de && x.a === a);
  if (!c || !c.convertir) throw new Error("conversor ausente");
  return c.convertir;
}

describe("csv → json", () => {
  const csvAJson = (s: string) => conv("csv", "json")(s) as string;

  it("convierte filas simples con la primera fila como claves", () => {
    expect(csvAJson("nombre,edad\nAna,30\nLuis,25")).toBe(
      JSON.stringify([{ nombre: "Ana", edad: "30" }, { nombre: "Luis", edad: "25" }]),
    );
  });

  it("respeta comillas, comas, comillas escapadas y saltos dentro de campos", () => {
    const csv = 'a,b\n"hola, ""mundo""","línea1\nlínea2"';
    expect(csvAJson(csv)).toBe(JSON.stringify([{ a: 'hola, "mundo"', b: "línea1\nlínea2" }]));
  });

  it("tolera CRLF y fila final sin salto", () => {
    expect(csvAJson("x,y\r\n1,2\r\n3,4")).toBe(
      JSON.stringify([{ x: "1", y: "2" }, { x: "3", y: "4" }]),
    );
  });

  it("tolera BOM al inicio", () => {
    expect(csvAJson("﻿a\n1")).toBe(JSON.stringify([{ a: "1" }]));
  });

  it("lanza error en español con el número de línea si faltan columnas", () => {
    expect(() => csvAJson("a,b,c\n1,2,3\n4,5")).toThrow(/línea 3/);
  });

  it("lanza error si sobran columnas", () => {
    expect(() => csvAJson("a\n1,2")).toThrow(/sobran|tiene 2 columnas|línea 2/);
  });

  it("entrada vacía devuelve array vacío", () => {
    expect(csvAJson("")).toBe("[]");
  });
});

describe("json → csv", () => {
  const jsonACsv = (s: string) => conv("json", "csv")(s) as string;

  it("usa la unión de claves en orden de primera aparición", () => {
    const json = JSON.stringify([{ a: "1", b: "2" }, { c: "3", a: "4" }]);
    expect(jsonACsv(json)).toBe("a,b,c\n1,2,\n4,,3");
  });

  it("entrecomilla valores con coma, comillas o salto de línea", () => {
    const json = JSON.stringify([{ t: 'a,"b"\nc' }]);
    expect(jsonACsv(json)).toBe('t\n"a,""b""\nc"');
  });

  it("ida y vuelta: JSON → CSV → JSON conserva el texto", () => {
    const datos = [{ nombre: "Ana", nota: 'dijo: "hola, ¿qué tal?"\ny se fue' }];
    const vuelta = conv("csv", "json")(conv("json", "csv")(JSON.stringify(datos)));
    expect(vuelta).toBe(JSON.stringify(datos));
  });

  it("objetos anidados lanzan «JSON demasiado anidado para CSV»", () => {
    expect(() => jsonACsv(JSON.stringify([{ a: { b: 1 } }]))).toThrow(
      "JSON demasiado anidado para CSV",
    );
  });

  it("un JSON que no es array de objetos lanza error en español", () => {
    expect(() => jsonACsv('{"a":1}')).toThrow(/array de objetos/);
  });
});

describe("srt → vtt", () => {
  const srtAVtt = (s: string) => conv("srt", "vtt")(s) as string;

  const SRT = "1\n00:00:01,000 --> 00:00:03,500\nHola mundo\n\n2\n00:00:04,000 --> 00:00:05,000\nSegunda línea\notra vez";

  it("añade cabecera WEBVTT, cambia comas por puntos y conserva el texto", () => {
    const vtt = srtAVtt(SRT);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.500");
    expect(vtt).toContain("Hola mundo");
    expect(vtt).toContain("Segunda línea\notra vez");
    expect(vtt).not.toContain("00:00:01,000");
  });

  it("ida y vuelta: SRT → VTT → SRT devuelve bloques equivalentes", () => {
    const vuelta = conv("vtt", "srt")(srtAVtt(SRT)) as string;
    expect(vuelta).toContain("00:00:01,000 --> 00:00:03,500");
    expect(vuelta).toContain("2\n00:00:04,000 --> 00:00:05,000\nSegunda línea\notra vez");
    expect(vuelta.startsWith("1\n")).toBe(true);
  });
});

describe("vtt → srt", () => {
  const vttASrt = (s: string) => conv("vtt", "srt")(s) as string;

  it("quita cabecera y notas, numera los bloques y cambia puntos por comas", () => {
    const vtt = "WEBVTT\n\nNOTE esto es un comentario\n\n00:00:01.000 --> 00:00:02.000\nHola\n\n00:00:03.000 --> 00:00:04.000\nAdiós";
    const srt = vttASrt(vtt);
    expect(srt).not.toContain("WEBVTT");
    expect(srt).not.toContain("NOTE");
    expect(srt).toContain("1\n00:00:01,000 --> 00:00:02,000\nHola");
    expect(srt).toContain("2\n00:00:03,000 --> 00:00:04,000\nAdiós");
  });

  it("tolera BOM y CRLF mezclados", () => {
    const vtt = "﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHola";
    expect(vttASrt(vtt)).toBe("1\n00:00:01,000 --> 00:00:02,000\nHola");
  });
});

describe("registro en el runtime", () => {
  beforeEach(() => limpiarConversores());

  it("tras registrar CONVERSORES_TEXTO, rutaDeConversion encuentra srt → vtt", () => {
    for (const c of CONVERSORES_TEXTO) registrarConversor(c);
    const ruta = rutaDeConversion("srt", "vtt");
    expect(ruta).not.toBeNull();
    expect(ruta?.costo).toBe(1);
    expect(ruta?.pasos[0].de).toBe("srt");
    expect(ruta?.pasos[0].a).toBe("vtt");
  });

  it("todos son vía js y costo 1", () => {
    for (const c of CONVERSORES_TEXTO) {
      expect(c.via).toBe("js");
      expect(c.costo).toBe(1);
    }
  });
});
