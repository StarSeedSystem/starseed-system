import { describe, it, expect } from "vitest";
import { desdePo, desdeProperties } from "../importar-po";

describe("desdePo", () => {
    it("ignora la cabecera y lee una entrada simple", () => {
        const po = [
            'msgid ""',
            'msgstr ""',
            '"Project-Id-Version: prueba\\n"',
            '',
            'msgid "hola"',
            'msgstr "Hola"',
        ].join("\n");
        const resultado = desdePo(po);
        expect(resultado.entradas).toEqual({ hola: "Hola" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("une líneas multilínea y resuelve escapes \\n y comillas", () => {
        const po = [
            'msgid "mensaje"',
            'msgstr ""',
            '"Línea 1\\n"',
            '"Línea 2 \\"citada\\""',
        ].join("\n");
        const resultado = desdePo(po);
        expect(resultado.entradas.mensaje).toBe('Línea 1\nLínea 2 "citada"');
    });

    it("usa contexto como prefijo de la clave", () => {
        const po = ['msgctxt "boton"', 'msgid "Guardar"', 'msgstr "Save"'].join("\n");
        const resultado = desdePo(po);
        expect(resultado.entradas["boton|Guardar"]).toBe("Save");
    });

    it("ignora fuzzy y lo avisa", () => {
        const po = ["#, fuzzy", 'msgid "viejo"', 'msgstr "old"'].join("\n");
        const resultado = desdePo(po);
        expect(resultado.entradas.viejo).toBeUndefined();
        expect(resultado.avisos.some((a) => a.includes("fuzzy"))).toBe(true);
        expect(resultado.descartadas).toEqual([]);
    });

    it("usa msgstr[0] en plurales y anota el aviso", () => {
        const po = [
            'msgid "archivo"',
            'msgid_plural "archivos"',
            'msgstr[0] "file"',
            'msgstr[1] "files"',
        ].join("\n");
        const resultado = desdePo(po);
        expect(resultado.entradas.archivo).toBe("file");
        expect(resultado.entradas.archivos).toBeUndefined();
        expect(resultado.avisos.some((a) => a.includes("plural simplificado"))).toBe(true);
    });

    it("descarta msgstr vacío", () => {
        const po = ['msgid "vacio"', 'msgstr ""'].join("\n");
        const resultado = desdePo(po);
        expect(resultado.entradas.vacio).toBeUndefined();
        expect(resultado.descartadas[0]?.motivo).toBe("msgstr vacío");
    });
});

describe("desdeProperties", () => {
    it("lee pares con = y con :", () => {
        const texto = ["saludo=Hola", "despedida: Adiós"].join("\n");
        const resultado = desdeProperties(texto);
        expect(resultado.entradas).toEqual({ saludo: "Hola", despedida: "Adiós" });
    });

    it("ignora comentarios # y !", () => {
        const texto = ["# comentario", "! otro", "clave=valor"].join("\n");
        const resultado = desdeProperties(texto);
        expect(resultado.entradas).toEqual({ clave: "valor" });
    });

    it("une continuaciones con barra invertida", () => {
        const texto = ["mensaje=Línea uno \\", "    línea dos"].join("\n");
        const resultado = desdeProperties(texto);
        expect(resultado.entradas.mensaje).toBe("Línea uno línea dos");
    });

    it("resuelve escapes unicode y claves escapadas", () => {
        const texto = ["nombre=Jos\\u00e9", "tecla\\=rara=valor"].join("\n");
        const resultado = desdeProperties(texto);
        expect(resultado.entradas.nombre).toBe("José");
        expect(resultado.entradas["tecla=rara"]).toBe("valor");
    });

    it("descarta líneas sin separador y valores vacíos", () => {
        const texto = ["sinsigno", "vacio="].join("\n");
        const resultado = desdeProperties(texto);
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas.map((d) => d.motivo)).toEqual([
            "línea sin separador «=» ni «:»",
            "valor vacío",
        ]);
    });
});
