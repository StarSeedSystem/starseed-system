import { describe, it, expect } from "vitest";
import { desdePo, desdeProperties } from "../importar-po";

describe("desdePo", () => {
    it("importa entradas simples e ignora la cabecera", () => {
        const r = desdePo('msgid ""\nmsgstr ""\n"Language: es\\n"\n\nmsgid "hola"\nmsgstr "Hola"\n');
        expect(r.entradas).toEqual({ hola: "Hola" });
        expect(r.descartadas).toBe(0);
    });

    it("concatena cadenas multilínea con escapes", () => {
        const po = [
            'msgid "multilínea"',
            'msgstr ""',
            '"Primera línea\\n"',
            '"segunda \\"entre comillas\\""',
        ].join("\n");
        const r = desdePo(po);
        expect(r.entradas["multilínea"]).toBe('Primera línea\nsegunda "entre comillas"');
    });

    it("soporta msgctxt con clave contexto|texto", () => {
        const r = desdePo('msgctxt "botón"\nmsgid "guardar"\nmsgstr "Guardar"\n');
        expect(r.entradas["botón|guardar"]).toBe("Guardar");
    });

    it("descarta fuzzy con aviso", () => {
        const r = desdePo('#, fuzzy\nmsgid "difusa"\nmsgstr "pendiente"\n');
        expect(r.entradas).toEqual({});
        expect(r.descartadas).toBe(1);
        expect(r.avisos[0]).toContain("fuzzy");
    });

    it("descarta msgstr vacío", () => {
        const r = desdePo('msgid "vacía"\nmsgstr ""\n');
        expect(r.descartadas).toBe(1);
    });

    it("simplifica plurales a la forma 0 con aviso", () => {
        const r = desdePo(
            'msgid "binario"\nmsgid_plural "binarios"\nmsgstr[0] "un binario"\nmsgstr[1] "varios binarios"\n',
        );
        expect(r.entradas["binario"]).toBe("un binario");
        expect(r.avisos.some((a) => a.includes("Plural"))).toBe(true);
    });
});

describe("desdeProperties", () => {
    it("importa clave=valor y clave:valor, ignorando comentarios # y !", () => {
        const props = ["# comentario", "! aviso", "saludo=Hola", "otro : valor dos"].join("\n");
        const r = desdeProperties(props);
        expect(r.entradas).toEqual({ saludo: "Hola", otro: "valor dos" });
        expect(r.descartadas).toBe(0);
    });

    it("une continuaciones con barra invertida", () => {
        const props = ["larga=primera parte \\", "  segunda parte"].join("\n");
        const r = desdeProperties(props);
        expect(r.entradas["larga"]).toBe("primera parte segunda parte");
    });

    it("descodifica escapes \\uXXXX", () => {
        const r = desdeProperties("palabra=espa\\u00f1ol");
        expect(r.entradas["palabra"]).toBe("español");
    });

    it("descarta valores vacíos", () => {
        const r = desdeProperties("vacía=\n");
        expect(r.descartadas).toBe(1);
    });
});
