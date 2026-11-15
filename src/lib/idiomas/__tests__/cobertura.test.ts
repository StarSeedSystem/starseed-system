import { describe, expect, it } from "vitest";
import { cargarCatalogo, cargarFuente, cargarUnidades, coberturaDe, leerJson, DIR, rechazo } from "../../../../scripts/idiomas/comun.mjs";
import path from "node:path";

const fuente = cargarFuente(), unidades = cargarUnidades();
const completas = leerJson(path.join(DIR, "completas.json")) as Record<string, string[] | string>;

describe("cobertura: una unidad declarada completa no tiene entradas ausentes, inválidas ni caducas", () => {
    for (const [idioma, lista] of Object.entries(completas)) {
        if (!Array.isArray(lista)) continue;
        for (const unidad of lista) {
            it(`${idioma} · ${unidad}`, () => {
                const c = coberturaDe(fuente, unidades, cargarCatalogo(idioma), unidad);
                expect({ ausentes: c.ausentes.slice(0, 5), invalidas: c.invalidas.slice(0, 5), caducas: c.caducas.slice(0, 5) }).toEqual({ ausentes: [], invalidas: [], caducas: [] });
            });
        }
    }
});

describe("rechazo de traducciones que pierden algo", () => {
    it("un valor, una etiqueta, una rama de plural o una marca perdidos se rechazan", () => {
        expect(rechazo("Hola, {0}", "Hello")).toMatch(/valor/);
        expect(rechazo("Pulsa <b>aquí</b>", "Press here")).toMatch(/etiqueta/);
        expect(rechazo("{0} libros", "{0, plural, one {# book}}")).toBeNull(); // sin ramas en la fuente: no se exige
        expect(rechazo("{0, plural, one {# libro} other {# libros}}", "{0, plural, one {# book}}")).toMatch(/plural/);
        expect(rechazo("Abrir Astraura", "Open")).toMatch(/marca/);
        expect(rechazo("Hola, {0}", "Hello, {0}")).toBeNull();
    });
});

describe("el catálogo fuente es el que mide el código", () => {
    it("tiene textos y las tres unidades de la primera entrega no están vacías", () => {
        expect(Object.keys(fuente.claves).length).toBeGreaterThan(1000);
        for (const u of Object.keys(unidades)) expect(coberturaDe(fuente, unidades, { entradas: {} }, u).total).toBeGreaterThan(0);
    });
});
