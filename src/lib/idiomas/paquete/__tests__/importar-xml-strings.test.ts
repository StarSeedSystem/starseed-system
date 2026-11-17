import { describe, it, expect } from "vitest";
import { desdeXliff, desdeStringsApple, desdeStringsAndroid } from "../importar-xml-strings";

describe("desdeXliff", () => {
  it("importa un XLIFF 1.2 con source y target", () => {
    const xliff = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xliff version="1.2"><file><body>',
      '<trans-unit id="1"><source>Hola, mundo</source><target>Hello, world</target></trans-unit>',
      "</body></file></xliff>",
    ].join("\n");
    const r = desdeXliff(xliff);
    expect(r.entradas["Hola, mundo"]).toBe("Hello, world");
    expect(r.descartadas).toHaveLength(0);
    expect(r.avisos).toHaveLength(0);
  });
  it("importa un XLIFF 2.0 con unit y segment", () => {
    const r = desdeXliff(
      '<xliff version="2.0"><file><unit id="u1"><segment>' +
        '<source>Bienvenido</source><target>Welcome</target></segment></unit></file></xliff>',
    );
    expect(r.entradas["Bienvenido"]).toBe("Welcome");
    expect(r.avisos).toHaveLength(0);
  });

  it("descodifica las entidades XML básicas", () => {
    const r = desdeXliff(
      "<trans-unit><source>a &amp; b</source><target>a &amp; b &lt;3&gt;</target></trans-unit>",
    );
    expect(r.entradas["a & b"]).toBe("a & b <3>");
  });

  it("descarta el valor que conserva etiquetas", () => {
    const r = desdeXliff(
      '<trans-unit id="1"><source>Guardar</source><target><b>Save</b></target></trans-unit>',
    );
    expect(r.entradas["Guardar"]).toBeUndefined();
    expect(r.descartadas[0]?.clave).toBe("Guardar");
    expect(r.descartadas[0]?.motivo).toContain("etiquetas");
  });

  it("con XML roto devuelve vacío y el motivo", () => {
    const r = desdeXliff('<xliff><trans-unit id="1"><source>Hola</source>');
    expect(Object.keys(r.entradas)).toHaveLength(0);
    expect(r.avisos[0]).toContain("roto");
  });
});

describe("desdeStringsApple", () => {
  it("importa un .strings con escapes y comentarios", () => {
    const texto = [
      "/* Comentario del encabezado */",
      '"saludo" = "Hola";',
      "// nota al margen",
      '"cita" = "Ella dijo \\"hola\\"";',
      '"dos líneas" = "primera\\nsegunda";',
    ].join("\n");
    const r = desdeStringsApple(texto);
    expect(r.entradas["saludo"]).toBe("Hola");
    expect(r.entradas["cita"]).toBe('Ella dijo "hola"');
    expect(r.entradas["dos líneas"]).toBe("primera\nsegunda");
    expect(r.avisos).toHaveLength(0);
  });

  it("descarta el valor que conserva etiquetas", () => {
    const r = desdeStringsApple('"botón" = "<b>Guardar</b>";');
    expect(r.entradas["botón"]).toBeUndefined();
    expect(r.descartadas[0]?.motivo).toContain("etiquetas");
  });
});

describe("desdeStringsAndroid", () => {
  it("importa strings.xml con escapes, entidades y placeholders", () => {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<resources>",
      '  <string name="saludar">Hola, %1$s</string>',
      '  <string name="contar">%s elementos</string>',
      "  <string name=\"cita\">\\'hola\\'</string>",
      "  <string name=\"multi\">línea\\nsegunda</string>",
      '  <string name="y">A &amp; B</string>',
      '  <string name="oculto" translatable="false">interno</string>',
      "</resources>",
    ].join("\n");
    const r = desdeStringsAndroid(xml);
    expect(r.entradas["saludar"]).toBe("Hola, {0}");
    expect(r.entradas["contar"]).toBe("{0} elementos");
    expect(r.entradas["cita"]).toBe("'hola'");
    expect(r.entradas["multi"]).toBe("línea\nsegunda");
    expect(r.entradas["y"]).toBe("A & B");
    expect(r.entradas["oculto"]).toBeUndefined();
  });

  it("descarta el valor que conserva etiquetas", () => {
    const r = desdeStringsAndroid('<string name="x">hola <b>tu</b></string>');
    expect(r.entradas["x"]).toBeUndefined();
    expect(r.descartadas[0]?.motivo).toContain("etiquetas");
  });
});
