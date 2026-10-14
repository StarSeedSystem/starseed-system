import { describe, it, expect } from "vitest";
import { CONVERSORES_TEXTO } from "../conv-texto";
import { registrarConversor, limpiarConversores, rutaDeConversion } from "../convertidores";

function encontrar(nombre: string) {
  return CONVERSORES_TEXTO.find((c) => c.nombre === nombre)!;
}

describe("conv-texto", () => {
  it("csv con campos difíciles → json", () => {
    const c = encontrar("csv-a-json");
    const csv = 'nombre,"apellido, con coma"\nAna,"Pérez, López"';
    const res = c.convertir!(csv);
    const arr = JSON.parse(String(res));
    expect(arr).toHaveLength(1);
    expect(arr[0]).toEqual({ nombre: "Ana", "apellido, con coma": "Pérez, López" });
  });

  it("csv vacío → []", () => {
    const c = encontrar("csv-a-json");
    expect(JSON.parse(String(c.convertir!("")))).toEqual([]);
  });

  it("filas con columnas desiguales lanza error en español con número de línea", () => {
    const c = encontrar("csv-a-json");
    const csv = "a,b\n1,2\n3";
    expect(() => c.convertir!(csv)).toThrow("Fila 3:");
  });

  it("json → csv con comas y comillas", () => {
    const c = encontrar("json-a-csv");
    const res = c.convertir!('[{"a":"x, y","b":"z"}]');
    expect(String(res)).toContain('"x, y"');
  });

  it("json anidado lanza mensaje en español", () => {
    const c = encontrar("json-a-csv");
    expect(() => c.convertir!('[{"a":{"b":1}}]')).toThrow("JSON demasiado anidado para CSV");
  });

  it("json vacío → vacío", () => {
    const c = encontrar("json-a-csv");
    expect(String(c.convertir!('[]'))).toBe("");
  });

  it("srt → vtt convierte comas por puntos", () => {
    const c = encontrar("srt-a-vtt");
    const srt = "1\n00:00:01,000 --> 00:00:04,000\nHola mundo\n";
    const vtt = String(c.convertir!(srt));
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("00:00:01.000 --> 00:00:04.000");
    expect(vtt).toContain("Hola mundo");
  });

  it("vtt → srt quita cabecera y nota, numera y usa coma", () => {
    const c = encontrar("vtt-a-srt");
    const vtt = "WEBVTT\nNOTE comentario\n1\n00:00:01.000 --> 00:00:04.000\nTexto\n";
    const srt = String(c.convertir!(vtt));
    expect(srt).not.toContain("WEBVTT");
    expect(srt).not.toContain("NOTE");
    expect(srt).toContain("1");
    expect(srt).toContain("00:00:01,000 --> 00:00:04,000");
  });

  it("toleran BOM y CRLF", () => {
    const c = encontrar("csv-a-json");
    const csv = "\ufeffa,b\r\n1,2\r\n";
    const res = c.convertir!(csv);
    const arr = JSON.parse(String(res));
    expect(arr[0].a).toBe("1");
  });

  it("rutaDeConversion encuentra srt→vtt tras registrar CONVERSORES_TEXTO", () => {
    limpiarConversores();
    for (const def of CONVERSORES_TEXTO) registrarConversor(def);
    expect(rutaDeConversion("srt", "vtt")).not.toBeNull();
  });
});
