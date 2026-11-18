import { describe, it, expect } from "vitest";
import { desdePo, desdeProperties } from "../importar-po";

describe("desdePo", () => {
    it("importa msgid/msgstr básico", () => {
        const po = `# Comentario
msgid "hola"
msgstr "Hola"

msgid "mundo"
msgstr "Mundo"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("ignora cabecera msgid vacía", () => {
        const po = `msgid ""
msgstr ""
"Project-Id-Version: test\\n"
"PO-Revision-Date: 2024-01-01\\n"

msgid "hola"
msgstr "Hola"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(Object.keys(resultado.entradas)).toHaveLength(1);
    });

    it("maneja msgctxt (clave compuesta contexto|texto)", () => {
        const po = `msgctxt "menu"
msgid "archivo"
msgstr "Archivo"

msgctxt "boton"
msgid "archivo"
msgstr "Archivo (botón)"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas["menu|archivo"]).toBe("Archivo");
        expect(resultado.entradas["boton|archivo"]).toBe("Archivo (botón)");
    });

    it("ignora entradas fuzzy con aviso", () => {
        const po = `#, fuzzy
msgid "hola"
msgstr "Hola"

msgid "mundo"
msgstr "Mundo"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.entradas.hola).toBeUndefined();
        expect(resultado.avisos.some(a => a.includes("fuzzy"))).toBe(true);
    });

    it("descarta msgstr vacío", () => {
        const po = `msgid "hola"
msgstr ""

msgid "mundo"
msgstr "Mundo"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.entradas.hola).toBeUndefined();
        expect(resultado.descartadas.some(d => d.motivo.includes("msgstr vacío"))).toBe(true);
    });

    it("maneja multilínea con comillas y escapes", () => {
        const po = `msgid "línea 1\\nlínea 2"
msgstr "traducción 1\\ntraducción 2"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas["línea 1\nlínea 2"]).toBe("traducción 1\ntraducción 2");
    });

    it("maneja plurales msgid_plural/msgstr[n] (usa forma 0 con aviso)", () => {
        const po = `msgid "manzana"
msgid_plural "manzanas"
msgstr[0] "una manzana"
msgstr[1] "%d manzanas"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas.manzana).toBe("una manzana");
        expect(resultado.avisos.some(a => a.includes("plural simplificado"))).toBe(true);
    });

    it("maneja plurales con contexto", () => {
        const po = `msgctxt "fruta"
msgid "manzana"
msgid_plural "manzanas"
msgstr[0] "una manzana"
msgstr[1] "%d manzanas"
`;

        const resultado = desdePo(po);
        expect(resultado.entradas["fruta|manzana"]).toBe("una manzana");
        expect(resultado.avisos.some(a => a.includes("plural simplificado"))).toBe(true);
    });

    it("maneja BOM al inicio", () => {
        const poConBom = "\uFEFFmsgid \"hola\"\nmsgstr \"Hola\"";
        const resultado = desdePo(poConBom);
        expect(resultado.entradas.hola).toBe("Hola");
    });

    it("po vacío devuelve vacío", () => {
        const resultado = desdePo("");
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toHaveLength(0);
        expect(resultado.avisos).toHaveLength(0);
    });
});

describe("desdeProperties", () => {
    it("importa clave=valor básico", () => {
        const props = `hola=Hola
mundo=Mundo
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("importa clave:valor con dos puntos", () => {
        const props = `hola:Hola
mundo:Mundo
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });

    it("ignora comentarios con # y !", () => {
        const props = `# Esto es un comentario
! Otro comentario
hola=Hola
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("maneja continuaciones con barra invertida", () => {
        const props = `mensaje=Esta es una línea larga \\
que continúa en la siguiente \\
y termina aquí
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.mensaje).toBe("Esta es una línea larga que continúa en la siguiente y termina aquí");
    });

    it("decodifica escapes Unicode \\uXXXX", () => {
        const props = `saludo=Hola \\u00E1migo
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.saludo).toBe("Hola ámigo");
    });

    it("decodifica escapes comunes \\n \\t \\r \\\" \\\\", () => {
        const props = `multilinea=línea 1\\nlínea 2
tab=col1\\tcol2
comillas=dijo \\"hola\\"
barra=ruta\\\\archivo
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.multilinea).toBe("línea 1\nlínea 2");
        expect(resultado.entradas.tab).toBe("col1\tcol2");
        expect(resultado.entradas.comillas).toBe('dijo "hola"');
        expect(resultado.entradas.barra).toBe("ruta\\archivo");
    });

    it("descarta líneas sin separador", () => {
        const props = `hola=Hola
línea_invalida
mundo=Mundo
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.descartadas.some(d => d.motivo.includes("Sin separador"))).toBe(true);
    });

    it("descarta clave vacía", () => {
        const props = `=valor
hola=Hola
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.descartadas.some(d => d.motivo.includes("Clave vacía"))).toBe(true);
    });

    it("maneja BOM al inicio", () => {
        const propsConBom = "\uFEFFhola=Hola";
        const resultado = desdeProperties(propsConBom);
        expect(resultado.entradas.hola).toBe("Hola");
    });

    it("properties vacío devuelve vacío", () => {
        const resultado = desdeProperties("");
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toHaveLength(0);
        expect(resultado.avisos).toHaveLength(0);
    });

    it("aviso por continuación sin terminar", () => {
        const props = `hola=Hola \\
mundo=Mundo
`;

        const resultado = desdeProperties(props);
        expect(resultado.entradas.hola).toBe("Hola ");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.avisos).toHaveLength(0);
        expect(resultado.descartadas.some(d => d.motivo.includes("continuación sin terminar"))).toBe(true);
    });
});