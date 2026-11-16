import { describe, expect, it } from "vitest";
import { claveDePar, paresInversos, esCodigoValido } from "../tipos";

describe("tipos del traductor", () => {
    it("clave de par normalizada", () => {
        expect(claveDePar("es", "en")).toBe("es->en");
        expect(claveDePar("fr", "de")).toBe("fr->de");
        expect(claveDePar("auto", "es")).toBe("auto->es");
    });

    it("pares inversos", () => {
        const par = { es: "en", en: "fr", fr: "es" };
        const inverso = paresInversos(par);
        expect(inverso).toEqual({ en: ["es"], fr: ["en"], es: ["fr"] });
    });

    it("códigos válidos", () => {
        expect(esCodigoValido("es")).toBe(true);
        expect(esCodigoValido("en-US")).toBe(true);
        expect(esCodigoValido("zh-Hans")).toBe(true);
        expect(esCodigoValido("pt-BR")).toBe(true);
        expect(esCodigoValido("no")).toBe(true);
        expect(esCodigoValido("iw")).toBe(true);
        expect(esCodigoValido("in")).toBe(true);
    });

    it("códigos inválidos", () => {
        expect(esCodigoValido(""));
        expect(esCodigoValido("xyz"));
        expect(esCodigoValido("en-US-extra"));
        expect(esCodigoValido("123"));
        expect(esCodigoValido("es-es-es-es-es-es-es-es-es-es-es-es-es-es-es-es-es-es-es-es"));
        expect(esCodigoValido(null));
        expect(esCodigoValido(undefined));
        expect(esCodigoValido({}));
    });
});