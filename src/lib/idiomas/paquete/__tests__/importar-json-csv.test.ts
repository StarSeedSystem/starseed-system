import { describe, it, expect } from "vitest";
import { desdeJsonPlano, desdeJsonAnidado, desdeCsv } from "../importar-json-csv";

describe("desdeJsonPlano", () => {
    it("importa JSON plano con valores de texto", () => {
        const json = `{
            "hola": "Hola",
            "mundo": "Mundo",
            "despedida": "Adiós"
        }`;

        const resultado = desdeJsonPlano(json);
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.entradas.despedida).toBe("Adiós");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("descarta valores no-texto (números, booleanos, null, arrays, objetos)", () => {
        const json = `{
            "texto": "válido",
            "numero": 42,
            "booleano": true,
            "nulo": null,
            "array": [1, 2, 3],
            "objeto": { "a": 1 }
        }`;

        const resultado = desdeJsonPlano(json);
        expect(resultado.entradas.texto).toBe("válido");
        expect(resultado.descartadas).toHaveLength(5);
        expect(resultado.descartadas.some(d => d.motivo.includes("no es texto"))).toBe(true);
    });

    it("JSON roto devuelve vacío con motivo", () => {
        const jsonRoto = `{ "hola": "Hola", "mundo": }`;
        const resultado = desdeJsonPlano(jsonRoto);
        expect(Object.keys(resultado.entradas)).toHaveLength(0);
        expect(resultado.descartadas.length).toBeGreaterThan(0);
        expect(resultado.descartadas[0].motivo).toContain("JSON");
    });

    it("JSON vacío devuelve vacío sin descartadas", () => {
        const resultado = desdeJsonPlano("{}");
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("maneja BOM al inicio", () => {
        const jsonConBom = "\uFEFF{ \"hola\": \"Hola\" }";
        const resultado = desdeJsonPlano(jsonConBom);
        expect(resultado.entradas.hola).toBe("Hola");
    });
});

describe("desdeJsonAnidado", () => {
    it("aplana JSON anidado de 3 niveles con punto", () => {
        const json = `{
            "nivel1": {
                "nivel2": {
                    "nivel3": "valor profundo"
                },
                "otro": "valor nivel2"
            },
            "raiz": "valor raiz"
        }`;

        const resultado = desdeJsonAnidado(json);
        expect(resultado.entradas["nivel1.nivel2.nivel3"]).toBe("valor profundo");
        expect(resultado.entradas["nivel1.otro"]).toBe("valor nivel2");
        expect(resultado.entradas.raiz).toBe("valor raiz");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("descarta valores no-texto en estructuras anidadas", () => {
        const json = `{
            "valido": "texto",
            "anidado": {
                "numero": 123,
                "texto": "ok"
            }
        }`;

        const resultado = desdeJsonAnidado(json);
        expect(resultado.entradas.valido).toBe("texto");
        expect(resultado.entradas["anidado.texto"]).toBe("ok");
        expect(resultado.descartadas.some(d => d.motivo.includes("no es texto"))).toBe(true);
    });

    it("JSON roto devuelve vacío con motivo", () => {
        const jsonRoto = `{ "a": { "b": } }`;
        const resultado = desdeJsonAnidado(jsonRoto);
        expect(Object.keys(resultado.entradas)).toHaveLength(0);
        expect(resultado.descartadas.length).toBeGreaterThan(0);
        expect(resultado.descartadas[0].motivo).toContain("JSON");
    });

    it("maneja BOM al inicio", () => {
        const jsonConBom = "\uFEFF{ \"a\": { \"b\": \"c\" } }";
        const resultado = desdeJsonAnidado(jsonConBom);
        expect(resultado.entradas["a.b"]).toBe("c");
    });

    it("objeto vacío devuelve vacío", () => {
        const resultado = desdeJsonAnidado("{}");
        expect(resultado.entradas).toEqual({});
        expect(resultado.descartadas).toHaveLength(0);
    });
});

describe("desdeCsv", () => {
    it("importa CSV básico con coma como separador", () => {
        const csv = `clave,traducción
hola,Hola
mundo,Mundo
despedida,Adiós`;

        const resultado = desdeCsv(csv, ",");
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.entradas.despedida).toBe("Adiós");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("importa TSV con tabulador como separador", () => {
        const tsv = `clave\ttraducción
hola\tHola
mundo\tMundo`;

        const resultado = desdeCsv(tsv, "\t");
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });

    it("importa CSV con punto y coma como separador", () => {
        const csv = `clave;traducción
hola;Hola
mundo;Mundo`;

        const resultado = desdeCsv(csv, ";");
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });

    it("detecta cabecera opcional con key/clave/source", () => {
        const csvKey = `key,value
hola,Hola`;
        const csvClave = `clave,traducción
hola,Hola`;
        const csvSource = `source,target
hola,Hola`;

        expect(desdeCsv(csvKey, ",").entradas.hola).toBe("Hola");
        expect(desdeCsv(csvClave, ",").entradas.hola).toBe("Hola");
        expect(desdeCsv(csvSource, ",").entradas.hola).toBe("Hola");
    });

    it("maneja comillas dobles y saltos de línea dentro de comillas", () => {
        const csv = `clave,traducción
"clave con, coma","valor con, coma"
"multilínea","línea 1
línea 2"
"comillas \"escapadas\"","valor normal"`;

        const resultado = desdeCsv(csv, ",");
        expect(resultado.entradas["clave con, coma"]).toBe("valor con, coma");
        expect(resultado.entradas.multilínea).toBe("línea 1\nlínea 2");
        expect(resultado.entradas["comillas \"escapadas\""]).toBe("valor normal");
    });

    it("maneja BOM al inicio", () => {
        const csvConBom = "\uFEFFclave,traducción\nhola,Hola";
        const resultado = desdeCsv(csvConBom, ",");
        expect(resultado.entradas.hola).toBe("Hola");
    });

    it("CSV roto (líneas con columnas incorrectas) descarta líneas problemáticas", () => {
        const csv = `clave,traducción
hola,Hola
línea_incompleta
mundo,Mundo,extra
adiós,Adiós`;

        const resultado = desdeCsv(csv, ",");
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.entradas.adiós).toBe("Adiós");
        expect(resultado.descartadas.length).toBeGreaterThan(0);
        expect(resultado.descartadas.some(d => d.motivo.includes("columnas"))).toBe(true);
    });

    it("líneas vacías se ignoran", () => {
        const csv = `clave,traducción

hola,Hola

mundo,Mundo`;

        const resultado = desdeCsv(csv, ",");
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
        expect(resultado.descartadas).toHaveLength(0);
    });

    it("sin cabecera trata primera fila como datos", () => {
        const csv = `hola,Hola
mundo,Mundo`;

        const resultado = desdeCsv(csv, ",");
        expect(resultado.entradas.hola).toBe("Hola");
        expect(resultado.entradas.mundo).toBe("Mundo");
    });
});