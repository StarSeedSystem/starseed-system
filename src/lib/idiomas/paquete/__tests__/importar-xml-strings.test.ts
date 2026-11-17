import { describe, it, expect } from "vitest";
import { LIMITES, desdeXliff, desdeStringsApple, desdeStringsAndroid } from "../importar-xml-strings";

describe("desdeXliff", () => {
    it("importa XLIFF 1.2 con <trans-unit>, <source> y <target>", () => {
        const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="es" target-language="en">
    <body>
      <trans-unit id="saludo">
        <source>Hola</source>
        <target>Hello</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;
        const r = desdeXliff(xliff);
        expect(r.entradas).toEqual({ saludo: "Hello" });
        expect(r.descartadas).toEqual([]);
        expect(r.avisos).toEqual([]);
    });

    it("importa XLIFF 2.0 con <unit>, <segment>, <source> y <target>", () => {
        const xliff = `<xliff version="2.0"><file id="f"><unit id="despedida">
  <segment><source>Adiós</source><target>Goodbye</target></segment>
</unit></file></xliff>`;
        expect(desdeXliff(xliff).entradas).toEqual({ despedida: "Goodbye" });
    });

    it("decodifica las entidades XML básicas", () => {
        const xliff = `<trans-unit id="cita"><source>cita</source><target>&quot;A&quot; &amp; B &apos;C&apos; &lt;3 &gt;2</target></trans-unit>`;
        expect(desdeXliff(xliff).entradas.cita).toBe(`"A" & B 'C' <3 >2`);
    });

    it("descarta un valor que conserva etiquetas", () => {
        const xliff = `<trans-unit id="rico"><source>rico</source><target><b>Hola</b></target></trans-unit>`;
        const r = desdeXliff(xliff);
        expect(r.entradas).toEqual({});
        expect(r.descartadas[0].clave).toBe("rico");
        expect(r.descartadas[0].motivo).toContain("etiquetas");
    });

    it("XML roto devuelve vacío con motivo", () => {
        const r = desdeXliff(`<xliff><trans-unit id="x"><source>Hola</source>`);
        expect(r.entradas).toEqual({});
        expect(r.avisos[0]).toContain("roto");
    });
});

describe("desdeStringsApple", () => {
    it("importa parejas con comentarios de bloque y de línea", () => {
        const texto = `/* Saludos */
"hola" = "Hello";
// despedida
"adios" = "Good \\"bye\\"\\n";
"url" = "https://starseed.os/";`;
        const r = desdeStringsApple(texto);
        expect(r.entradas.hola).toBe("Hello");
        expect(r.entradas.adios).toBe('Good "bye"\n');
        expect(r.entradas.url).toBe("https://starseed.os/");
        expect(r.descartadas).toEqual([]);
    });

    it("devuelve vacío con motivo si no hay parejas", () => {
        const r = desdeStringsApple("/* solo un comentario */");
        expect(r.entradas).toEqual({});
        expect(r.avisos[0]).toContain(".strings sin parejas");
    });
});

describe("desdeStringsAndroid", () => {
    it("importa <string name>, convierte escapes y marcadores de posición", () => {
        const xml = `<resources>
  <string name="saludo">Hola, %1$s</string>
  <string name="nuevo">Línea\\nuno</string>
  <string name="cita">No \\'pasa\\' nada</string>
  <string name="simple">%s</string>
</resources>`;
        const r = desdeStringsAndroid(xml);
        expect(r.entradas.saludo).toBe("Hola, {0}");
        expect(r.entradas.nuevo).toBe("Línea\nuno");
        expect(r.entradas.cita).toBe("No 'pasa' nada");
        expect(r.entradas.simple).toBe("{0}");
    });

    it("descarta translatable=\"false\" y valores con etiquetas", () => {
        const xml = `<resources>
  <string name="interno" translatable="false">No tocar</string>
  <string name="rico"><b>Hola</b></string>
</resources>`;
        const r = desdeStringsAndroid(xml);
        expect(r.entradas).toEqual({});
        expect(r.descartadas.map((d) => d.clave)).toEqual(["interno", "rico"]);
        expect(r.descartadas[1].motivo).toContain("etiquetas");
    });

    it("XML roto devuelve vacío con motivo", () => {
        const r = desdeStringsAndroid(`<resources><string name="x">Hola`);
        expect(r.entradas).toEqual({});
        expect(r.avisos[0]).toContain("roto");
    });

    it("respeta el límite de tamaño", () => {
        const r = desdeStringsAndroid("x".repeat(LIMITES.bytes + 1));
        expect(r.entradas).toEqual({});
        expect(r.avisos[0]).toContain("límite");
    });
});
