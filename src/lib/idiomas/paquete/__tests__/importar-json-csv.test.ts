import { describe, it, expect } from "vitest";
import {
    desdeJsonPlano,
    desdeJsonAnidado,
    desdeCsv,
    type ResultadoImportacion,
} from "../importar-json-csv";

describe("desdeJsonPlano", () => {
    it("parsea JSON plano simple y devuelve entradas", () => {
        const texto = '{"hola": "mundo", "adios": "chao"}';
        const resultado: ResultadoImportacion = desdeJsonPlano(texto);
        expect(resultado.entradas).toEqual({ hola: "mundo", adios: "chao" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("devuelve vacío y motivo para JSON inválido", () => {
        const resultado: ResultadoImportacion = desdeJsonPlano("no es json");
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toEqual([{ motivo: "JSON inválido" }]);
    });

    it("devuelve vacío para JSON que no es un objeto", () => {
        const resultado: ResultadoImportacion = desdeJsonPlano('"cadena"');
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toEqual([{ motivo: "JSON no es un objeto" }]);
    });

    it("descartar valores que no son texto (números)", () => {
        const texto = '{"clave": 123, "otra": true}';
        const resultado: ResultadoImportacion = desdeJsonPlano(texto);
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas.length).toBe(2);
        expect(resultado.descartadas.every((d) => d.motivo === "valor no es texto")).toBe(true);
    });

    it("mezclar entradas válidas y valores no-texto", () => {
        const texto = '{"buena": "hola", "mala": 42, "otra": "mundo", "numero": 3.14}';
        const resultado: ResultadoImportacion = desdeJsonPlano(texto);
        expect(resultado.entradas).toEqual({ buena: "hola", otra: "mundo" });
        expect(resultado.descartadas.length).toBe(2);
    });
});

describe("desdeJsonAnidado", () => {
    it("aplana JSON anidado de 2 niveles con punto", () => {
        const texto = '{"clave": {"sub": "valor"}}';
        const resultado: ResultadoImportacion = desdeJsonAnidado(texto);
        expect(resultado.entradas).toEqual({ "clave.sub": "valor" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("aplana JSON anidado de 3 niveles con punto", () => {
        const texto = '{"a": {"b": {"c": "valor"}}}';
        const resultado: ResultadoImportacion = desdeJsonAnidado(texto);
        expect(resultado.entradas).toEqual({ "a.b.c": "valor" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("devuelve vacío y motivo para JSON inválido", () => {
        const resultado: ResultadoImportacion = desdeJsonAnidado("no es json");
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toEqual([{ motivo: "JSON inválido" }]);
    });

    it("descartar valores no texto en hojas anidadas", () => {
        const texto = '{"clave": 123, "buena": {"sub": "valor"}}';
        const resultado: ResultadoImportacion = desdeJsonAnidado(texto);
        expect(resultado.entradas).toEqual({ "buena.sub": "valor" });
        expect(resultado.descartadas.length).toBe(1);
        expect(resultado.descartadas[0].motivo).toBe("valor no es texto");
    });

    it("mezclar anidado y hojas texto al mismo nivel", () => {
        const texto = '{"a": "1", "b": {"c": "2"}, "d": 3}';
        const resultado: ResultadoImportacion = desdeJsonAnidado(texto);
        expect(resultado.entradas).toEqual({ a: "1", "b.c": "2" });
        expect(resultado.descartadas.length).toBe(1);
    });
});

describe("desdeCsv", () => {
    it("parsea CSV con comas y comillas dobles", () => {
        const texto = `key,translation
hola,"mundo, chao"
adios,"chao"`;
        const resultado: ResultadoImportacion = desdeCsv(texto, ",");
        expect(resultado.entradas).toEqual({ hola: "mundo, chao", adios: "chao" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("parsear TSV (separador tab)", () => {
        const texto = "key\ttranslation\nhola\tmundo\nadios\tchao";
        const resultado: ResultadoImportacion = desdeCsv(texto, "\t");
        expect(resultado.entradas).toEqual({ hola: "mundo", adios: "chao" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("detectar y saltar cabecera que dice key/clave/source", () => {
        const texto = `key,clave,source
hola,mundo
test,otra`;
        const resultado: ResultadoImportacion = desdeCsv(texto, ",");
        expect(resultado.entradas).toEqual({ hola: "mundo", test: "otra" });
        expect(resultado.descartadas).toEqual([]);
    });

    it("descartar filas con clave vacía", () => {
        const texto = `clave,translation
,hola
mundo,`;
        const resultado: ResultadoImportacion = desdeCsv(texto, ",");
        expect(resultado.entradas).toEqual({ mundo: "" });
        expect(resultado.descartadas.length).toBe(1);
        expect(resultado.descartadas[0].motivo).toContain("clave vacía");
    });

    it("manejar BOM inicial (UTF-8)", () => {
        const bom = "\uFEFF";
        const texto = `${bom}key,translation\nhola,mundo`;
        const resultado: ResultadoImportacion = desdeCsv(texto, ",");
        expect(resultado.entradas).toEqual({ hola: "mundo" });
        expect(resultado.descartadas).toEqual([]);
    });
});