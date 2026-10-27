import { describe, expect, it } from "vitest";
import {
    CLAVE_TRADUCCION, CONTEXTOS_TRADUCCION, debeTraducir, guardar, leer, normalizarIdioma,
    normalizarPreferencias, preferenciasPorDefecto, type AlmacenLike, type PreferenciasTraduccion,
} from "../preferencias";

class AlmacenMemoria implements AlmacenLike {
    private readonly datos = new Map<string, string>();
    getItem(clave: string): string | null { return this.datos.get(clave) ?? null; }
    setItem(clave: string, valor: string): void { this.datos.set(clave, valor); }
}

function conAuto(idioma: string, modos: Partial<PreferenciasTraduccion["auto"]>): PreferenciasTraduccion {
    const base = preferenciasPorDefecto(idioma);
    return { ...base, auto: { ...base.auto, ...modos } };
}

describe("preferencias de traducción", () => {
    it("usa la clave de la cuenta que viaja con los ajustes", () => {
        expect(CLAVE_TRADUCCION).toBe("starseed.traduccion.v1");
    });

    it("normaliza idiomas y rechaza lo que no lo es", () => {
        expect(normalizarIdioma(" ES_mx ")).toBe("es-mx");
        expect(normalizarIdioma("pt-BR")).toBe("pt-br");
        expect(normalizarIdioma("zh-Hant-TW")).toBe("zh-hant-tw");
        expect(normalizarIdioma("no es un idioma!")).toBeNull();
        expect(normalizarIdioma("")).toBeNull();
        expect(normalizarIdioma(42)).toBeNull();
    });

    it("por defecto toma el idioma de quien llama y todo queda en preguntar", () => {
        const prefs = preferenciasPorDefecto("ES_mx");
        expect(prefs.idioma).toBe("es-mx");
        expect(prefs.entiende).toEqual(["es-mx"]);
        for (const contexto of CONTEXTOS_TRADUCCION) expect(prefs.auto[contexto]).toBe("preguntar");
        expect(preferenciasPorDefecto().idioma).toBe("es");
        expect(preferenciasPorDefecto("no es un idioma!").idioma).toBe("es");
    });

    it("normaliza lo válido y devuelve al valor por defecto lo inválido", () => {
        const normal = normalizarPreferencias({
            idioma: "EN_us",
            entiende: ["fr", 42, "es-ES", ""],
            auto: { paginas: "siempre", mensajes: "a veces", agentes: "nunca", astraura: 7 },
        }, "ca");
        expect(normal.idioma).toBe("en-us");
        expect(normal.entiende).toEqual(["en-us", "fr", "es-es"]);
        expect(normal.auto).toEqual({
            paginas: "siempre", mensajes: "preguntar", publicaciones: "preguntar",
            agentes: "nunca", astraura: "preguntar",
        });

        expect(normalizarPreferencias("no soy un objeto", "pt")).toEqual(preferenciasPorDefecto("pt"));
        expect(normalizarPreferencias(["tampoco"], "pt")).toEqual(preferenciasPorDefecto("pt"));
        expect(normalizarPreferencias({ idioma: 7, auto: [] }, "pt").idioma).toBe("pt");
        expect(normalizarPreferencias(null, "pt")).toEqual(preferenciasPorDefecto("pt"));
    });

    it("guarda cada perfil sin borrar a los demás y lee con su idioma", () => {
        const almacen = new AlmacenMemoria();
        expect(leer("ana", "es", almacen)).toEqual(preferenciasPorDefecto("es"));
        expect(guardar("ana", conAuto("en", { paginas: "siempre" }), almacen)).toBe(true);
        expect(guardar("luis", conAuto("pt", { mensajes: "nunca" }), almacen)).toBe(true);

        expect(leer("ana", "es", almacen).idioma).toBe("en");
        expect(leer("ana", "es", almacen).auto.paginas).toBe("siempre");
        expect(leer("luis", "es", almacen).idioma).toBe("pt");
        expect(leer("luis", "es", almacen).auto.mensajes).toBe("nunca");
        expect(leer("nadie", "de", almacen)).toEqual(preferenciasPorDefecto("de"));

        expect(guardar("ana", conAuto("fr", { agentes: "nunca" }), almacen)).toBe(true);
        expect(leer("ana", "es", almacen).idioma).toBe("fr");
        expect(leer("ana", "es", almacen).auto.paginas).toBe("preguntar");
        expect(leer("luis", "es", almacen).idioma).toBe("pt");
    });

    it("con datos rotos o sin almacén vuelve al valor por defecto y no lanza", () => {
        const almacen = new AlmacenMemoria();
        almacen.setItem(CLAVE_TRADUCCION, "{esto no es json");
        expect(leer("ana", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));

        almacen.setItem(CLAVE_TRADUCCION, JSON.stringify(["no", "es", "un", "mapa"]));
        expect(leer("ana", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));

        almacen.setItem(CLAVE_TRADUCCION, JSON.stringify({ ana: { idioma: 123 }, luis: "roto" }));
        expect(leer("ana", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));
        expect(leer("luis", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));

        expect(guardar("", preferenciasPorDefecto(), almacen)).toBe(false);
        expect(guardar("ana", preferenciasPorDefecto(), null)).toBe(false);
        expect(leer("ana", "fr", null)).toEqual(preferenciasPorDefecto("fr"));
        expect(leer("", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));
    });

    it("decide por contexto y nunca traduce lo que ya entiende", () => {
        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "fr")).toBe(true);
        expect(debeTraducir(conAuto("es", { paginas: "preguntar" }), "paginas", "fr")).toBe(false);
        expect(debeTraducir(conAuto("es", { paginas: "nunca" }), "paginas", "fr")).toBe(false);
        expect(debeTraducir(conAuto("es", { publicaciones: "siempre" }), "agentes", "de")).toBe(false);

        for (const contexto of CONTEXTOS_TRADUCCION) {
            expect(debeTraducir(conAuto("es", { [contexto]: "siempre" }), contexto, "de")).toBe(true);
        }

        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "es-ES")).toBe(false);
        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", " ES_mx ")).toBe(false);
        const entiende = { ...conAuto("es", { mensajes: "siempre" }), entiende: ["es", "fr"] };
        expect(debeTraducir(entiende, "mensajes", "fr-CA")).toBe(false);
        expect(debeTraducir(entiende, "mensajes", "FR")).toBe(false);
        expect(debeTraducir(entiende, "mensajes", "de")).toBe(true);

        expect(debeTraducir(undefined, "paginas", "fr")).toBe(false);
        expect(debeTraducir(null, "paginas", "fr")).toBe(false);
        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "")).toBe(false);
        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "no es un idioma!")).toBe(false);
    });
});
