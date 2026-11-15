import { describe, expect, it } from "vitest";
import { aIdiomaElegible, IDIOMAS, ESTADO_CATALOGO, CON_CATALOGO } from "../idiomas";
import { elegirIdioma, idiomaEfectivo, leerEleccionNeurona, sugerirIdioma, type AlmacenIdioma } from "../estado";
import { leerJson, rutaCatalogo } from "../../../../scripts/idiomas/comun.mjs";

const memoria = (): AlmacenIdioma & { m: Record<string, string> } => {
    const m: Record<string, string> = {};
    return { m, getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } };
};

describe("detección del idioma del aparato", () => {
    it("lo nativo va antes que el navegador y los códigos se reducen a un idioma elegible", () => {
        expect(sugerirIdioma({ languages: ["pt-BR", "en-US"] })).toBe("pt");
        expect(sugerirIdioma({ nativos: ["fr_CA"], languages: ["en-US"] })).toBe("fr");
        expect(sugerirIdioma({ languages: ["zh-TW"] })).toBe("zh-hant");
        expect(sugerirIdioma({ languages: ["no"] })).toBe("nb");
        expect(sugerirIdioma({ languages: ["xx-YY", "tlh"], language: "" })).toBe("es");
    });
    it("hay al menos 24 idiomas, cada uno con su rótulo «Elegir idioma» y los de derecha a izquierda marcados", () => {
        expect(IDIOMAS.length).toBeGreaterThanOrEqual(24);
        expect(new Set(IDIOMAS.map((i) => i.rotulo)).size).toBe(IDIOMAS.length);
        expect(IDIOMAS.filter((i) => i.dir === "rtl").map((i) => i.codigo).sort()).toEqual(["ar", "fa", "he", "ur"]);
        expect(aIdiomaElegible("EN_us")).toBe("en");
        expect(aIdiomaElegible("no es un idioma")).toBeNull();
    });
});

describe("la elección", () => {
    it("lo sugerido nunca se aplica solo: sin elegir, rige el español", () => {
        const a = memoria();
        expect(idiomaEfectivo(a).codigo).toBe("es");
        expect(leerEleccionNeurona(a)).toBeNull();
    });
    it("se guarda en la neurona y como valor de la cuenta para los aparatos siguientes", () => {
        const a = memoria();
        expect(elegirIdioma("fr", a)).toBe(true);
        expect(leerEleccionNeurona(a)?.codigo).toBe("fr");
        // un aparato nuevo con la cuenta ya bajada (solo el mapa de la cuenta): ese es su valor por defecto
        const b = memoria(); b.setItem("starseed.traduccion.v1", a.m["starseed.traduccion.v1"]);
        expect(idiomaEfectivo(b)).toMatchObject({ codigo: "fr", origen: "cuenta" });
        // y una elección propia de esa neurona manda sobre la cuenta
        elegirIdioma("pt", b);
        expect(idiomaEfectivo(b)).toMatchObject({ codigo: "pt", origen: "persona" });
    });
    it("rechaza lo que no es un idioma y no rompe sin almacén", () => {
        expect(elegirIdioma("zz-nada", memoria())).toBe(false);
        expect(elegirIdioma("en", null)).toBe(false);
    });
});

describe("estado de los catálogos", () => {
    it("lo que dice la interfaz (revisado / automático) coincide con el archivo de cada catálogo", () => {
        for (const c of CON_CATALOGO) expect(ESTADO_CATALOGO[c] === "revisado").toBe(leerJson(rutaCatalogo(c)).revisado);
    });
});
