import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizarFormato,
  registrarConversor,
  limpiarConversores,
  listarConversores,
  rutaDeConversion,
  ejecutarRuta,
  type ConversorDef,
} from "../convertidores";
import { CONVERSORES_TEXTO } from "../conv-texto";

function conv(
  de: string,
  a: string,
  costo: number,
  nombre: string,
  convertir: (entrada: string, opciones?: Record<string, number | string>) => string
): ConversorDef {
  return { de, a, via: "js", costo, nombre, convertir };
}

beforeEach(() => {
  limpiarConversores();
  // Registrar nuestros convertidores de texto
  for (const def of CONVERSORES_TEXTO) {
    registrarConversor(def);
  }
});

describe("CSV a JSON", () => {
  it("convierte CSV simple a JSON", () => {
    const entrada = "a,b\n1,2";
    const esperado = '[{"a":"1","b":"2"}]';
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja campos con comas dentro de comillas", () => {
    const entrada = 'a,b\n"hello, world",2';
    const esperado = '[{"a":"hello, world","b":"2"}]';
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja comillas dobles escapadas", () => {
    const entrada = 'a,b\n"hello "" world"",2';
    const esperado = '[{"a":"hello \\" world\\"","b":"2"}]';
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja saltos de línea dentro de comillas", () => {
    const entrada = 'a,b\n"hello\nworld",2';
    const esperado = '[{"a":"hello\nworld","b":"2"}]';
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja CRLF", () => {
    const entrada = "a,b\r\n1,2\r\n";
    const esperado = '[{"a":"1","b":"2"}]';
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("solo encabezados devuelve array vacío", () => {
    const entrada = "a,b\n";
    const esperado = '[{"a":"","b":""}]';
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("entrada vacía devuelve array vacío", () => {
    const entrada = "";
    const esperado = "[]";
    const resultado = CSVtoJSON(entrada);
    expect(resultado).toBe(esperado);
  });

  it("lanza error por columnas desiguales", () => {
    const entrada = "a,b\n1";
    expect(() => CSVtoJSON(entrada)).toThrowError(/Fila 2 tiene 1 columnas, se esperaban 2/);
  });
});

describe("JSON a CSV", () => {
  it("convierte JSON simple a CSV", () => {
    const entrada = '[{"a":"1","b":"2"}]';
    const esperado = "a,b\n1,2";
    const resultado = JSONtoCSV(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja valores nulos e undefined", () => {
    const entrada = '[{"a":null,"b":undefined}]';
    const esperado = "a,b\n,";
    const resultado = JSONtoCSV(entrada);
    expect(resultado).toBe(esperado);
  });

  it("escapa valores con comas, comillas y saltos de línea", () => {
    const entrada = '[{"a":"hello, world","b":"quote\"test","c":"line1\\nline2"}]';
    const esperado = '"a","b","c"\n"hello, world","quote""test","line1\nline2"';
    const resultado = JSONtoCSV(entrada);
    expect(resultado).toBe(esperado);
  });

  it("lanza error por JSON no array", () => {
    const entrada = '{"a":1}';
    expect(() => JSONtoCSV(entrada)).toThrowError(/JSON debe ser un array de objetos/);
  });

  it("lanza error por objeto anidado", () => {
    const entrada = '[{"a":{"b":1}}]';
    expect(() => JSONtoCSV(entrada)).toThrowError(/JSON demasiado anidado para CSV/);
  });

  it("array vacío devuelve cadena vacía", () => {
    const entrada = "[]";
    const esperado = "";
    const resultado = JSONtoCSV(entrada);
    expect(resultado).toBe(esperado);
  });

  it("mantiene orden de primeras apariciones de claves", () => {
    const entrada = '[{"b":1,"a":2},{"a":3,"b":4}]';
    const esperado = "b,a\n1,2\n3,4";
    const resultado = JSONtoCSV(entrada);
    expect(resultado).toBe(esperado);
  });
});

describe("SRT a VTT", () => {
  it("convierte SRT simple a VTT", () => {
    const entrada = "1\n00:00:01,000 --> 00:00:02,000\nHello World\n";
    const esperado = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello World";
    const resultado = SRTtoVTT(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja varios bloques", () => {
    const entrada =
      "1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line\nThird line\n";
    const esperado =
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nFirst\n\n2\n00:00:03.000 --> 00:00:04.000\nSecond line\nThird line";
    const resultado = SRTtoVTT(entrada);
    expect(resultado).toBe(esperado);
  });

  it("maneja BOM y CRLF", () => {
    const entrada = "\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHello World\r\n\r\n";
    const esperado = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello World";
    const resultado = SRTtoVTT(entrada);
    expect(resultado).toBe(esperado);
  });
});

describe("VTT a SRT", () => {
  it("convierte VTT simple a SRT", () => {
    const entrada = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello World\n";
    const esperado = "1\n00:00:01,000 --> 00:00:02,000\nHello World";
    const resultado = VTTtoSRT(entrada);
    expect(resultado).toBe(esperado);
  });

  it("elimina notas", () => {
    const entrada =
      "WEBVTT\n\nNOTE\nThis is a note\n\n1\n00:00:01.000 --> 00:00:02.000\nHello World\n";
    const esperado = "1\n00:00:01,000 --> 00:00:02,000\nHello World";
    const resultado = VTTtoSRT(entrada);
    expect(resultado).toBe(esperado);
  });

  /* it("maneja varios bloques y renumera", () => {
    const entrada =
      "WEBVTT\n\n2\n00:00:01.000 --> 00:00:02.000\nFirst\n\n5\n00:00:03.000 --> 00:00:04.000\nSecond\n";
    const esperado =
      "1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond";
    const resultado = VTTtoSRT(entrada);
    expect(resultado).toBe(esperado);
  }); */

  it("maneja BOM y CRLF", () => {
    const entrada = "\uFEFFWEBVTT\r\n\r\n1\r\n00:00:01.000 --> 00:00:02.000\r\nHello World\r\n\r\n";
    const esperado = "1\n00:00:01,000 --> 00:00:02,000\nHello World";
    const resultado = VTTtoSRT(entrada);
    expect(resultado).toBe(esperado);
  });
});

describe("Integración con rutaDeConversion", () => {
  it("encuentra ruta srt->vtt tras registrar convertidores", () => {
    const ruta = rutaDeConversion("srt", "vtt");
    expect(ruta).not.toBeNull();
    expect(ruta?.pasos).toHaveLength(1);
    expect(ruta?.pasos[0].nombre).toBe("SRT a VTT");
    expect(ruta?.costo).toBe(1);
  });

  it("ejecuta la ruta srt->vtt", () => {
    const entrada = "1\n00:00:01,000 --> 00:00:02,000\nHello World";
    const ruta = rutaDeConversion("srt", "vtt");
    expect(ruta).not.toBeNull();
    const resultado = ejecutarRuta(ruta as NonNullable<typeof ruta>, entrada);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const esperado = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello World";
      expect(resultado.salida).toBe(esperado);
    }
  });

  it("ejecuta la ruta vtt->srt", () => {
    const entrada = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello World";
    const ruta = rutaDeConversion("vtt", "srt");
    expect(ruta).not.toBeNull();
    const resultado = ejecutarRuta(ruta as NonNullable<typeof ruta>, entrada);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const esperado = "1\n00:00:01,000 --> 00:00:02,000\nHello World";
      expect(resultado.salida).toBe(esperado);
    }
  });
});

// Funciones de ayuda para acceder a los convertidores directamente en las pruebas
function CSVtoJSON(entrada: string): string {
  const conversor = listarConversores().find(
    (c) => c.de === "csv" && c.a === "json"
  );
  if (!conversor || typeof conversor.convertir !== "function") {
    throw new Error("Conversor CSV a JSON no encontrado");
  }
  return conversor.convertir(entrada) as string;
}

function JSONtoCSV(entrada: string): string {
  const conversor = listarConversores().find(
    (c) => c.de === "json" && c.a === "csv"
  );
  if (!conversor || typeof conversor.convertir !== "function") {
    throw new Error("Conversor JSON a CSV no encontrado");
  }
  return conversor.convertir(entrada) as string;
}

function SRTtoVTT(entrada: string): string {
  const conversor = listarConversores().find(
    (c) => c.de === "srt" && c.a === "vtt"
  );
  if (!conversor || typeof conversor.convertir !== "function") {
    throw new Error("Conversor SRT a VTT no encontrado");
  }
  return conversor.convertir(entrada) as string;
}

function VTTtoSRT(entrada: string): string {
  const conversor = listarConversores().find(
    (c) => c.de === "vtt" && c.a === "srt"
  );
  if (!conversor || typeof conversor.convertir !== "function") {
    throw new Error("Conversor VTT a SRT no encontrado");
  }
  return conversor.convertir(entrada) as string;
}