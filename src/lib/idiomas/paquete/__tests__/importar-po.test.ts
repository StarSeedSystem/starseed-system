import { describe, it, expect } from "vitest";
import { desdePo, desdeProperties } from "../importar-po";

const poContent = `msgid "Hello world"
msgstr "Hola mundo"

msgctxt "greeting"
msgid "Good morning"
msgstr "Buenos días"

msgid_plural "One"
msgstr[0] "Un"
msgstr[1] "Dos"

msgid "Empty"
msgstr ""

msgid "Fuzzy block"
msgstr "Traducción"
fuzzy`.trim();

const poFuzzyOnly = `#: src/file.ts
msgid "Fuzzy"
msgstr "Traducción"
fuzzy`.trim();

const poEmptyMsgstr = `msgid "Empty"
msgstr ""
`.trim();

const poWithContext = `msgctxt "messages"
msgid "Hello"
msgstr "Hola"`.trim();

const propsContent = `key1=value1
key2: value2
key=continued\
line
key3=value with \\u00e9spañol
! This is a comment`.trim();

describe("desdePo", () => {
    it("parsa msgid/msgstr basico", () => {
        const { entradas } = desdePo(poContent);
        expect(entradas).toHaveProperty("Hello world");
        expect(entradas["Hello world"]).toBe("Hola mundo");
    });

    it("ignora bloques con fuzzy", () => {
        const { entradas, avisos } = desdePo(poFuzzyOnly);
        expect(entradas).toEqual({});
        expect(avisos).toContain("fuzzy");
    });

    it("descarta msgstr vacio", () => {
        const { entradas, descartadas } = desdePo(poEmptyMsgstr);
        expect(entradas).toEqual({});
        expect(descartadas).toContain("Empty");
    });

    it("soporte msgctxt: clave es contexto|texto", () => {
        const { entradas } = desdePo(poWithContext);
        expect(entradas).toHaveProperty("messages|Hello");
        expect(entradas["messages|Hello"]).toBe("Hola");
    });

    it("soporte plurales usa forma [0] y avisa", () => {
        const { entradas, avisos } = desdePo(poContent);
        expect(entradas).toHaveProperty("One");
        expect(avisos).toContain("plural simplificado");
        expect(entradas["One"]).toBe("Un");
    });
});

describe("desdeProperties", () => {
    it("soporte clave=valor y clave:valor", () => {
        const { entradas } = desdeProperties(propsContent);
        expect(entradas).toHaveProperty("key1");
        expect(entradas).toHaveProperty("key2");
        expect(entradas["key1"]).toBe("value1");
        expect(entradas["key2"]).toBe("value2");
    });

    it("soporte continuacion de linea con \\", () => {
        const { entradas } = desdeProperties(propsContent);
        expect(entradas["key"]).toBe("continuedline");
    });

    it("soporte unicode \\uXXXX", () => {
        const { entradas } = desdeProperties(propsContent);
        const valor = entradas["key3"];
        // \u00e9 debe convertirse en é (U+00E9)
        expect(valor).toBe("value with éspañol");
    });

    it("ignora comentarios # y !", () => {
        const { entradas } = desdeProperties(propsContent);
        expect(entradas).not.toHaveProperty("This is a comment");
    });
});