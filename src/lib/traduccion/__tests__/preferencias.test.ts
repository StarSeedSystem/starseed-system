import { describe, expect, it } from "vitest";
import {
    CLAVE_TRADUCCION,
    CONTEXTOS_TRADUCCION,
    debeTraducir,
    guardar,
    leer,
    normalizarPreferencias,
    preferenciasPorDefecto,
    type AlmacenLike,
    type PreferenciasTraduccion,
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
            auto: { paginas: "siempre", mensajes: "a veces", agentes: "nunca" },
        }, "ca");
        expect(normal.idioma).toBe("en-us");
        expect(normal.entiende).toEqual(["en-us", "fr", "es-es"]);
        expect(normal.auto.paginas).toBe("siempre");
        expect(normal.auto.mensajes).toBe("preguntar");
        expect(normal.auto.agentes).toBe("nunca");
        expect(normal.auto.astraura).toBe("preguntar");

        const roto = normalizarPreferencias("no soy un objeto", "pt");
        expect(roto).toEqual(preferenciasPorDefecto("pt"));
        expect(normalizarPreferencias({ idioma: 7, auto: [] }, "pt").idioma).toBe("pt");
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
    });

    it("con datos rotos o sin almacén vuelve al valor por defecto y no lanza", () => {
        const almacen = new AlmacenMemoria();
        almacen.setItem(CLAVE_TRADUCCION, "{esto no es json");
        expect(leer("ana", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));

        almacen.setItem(CLAVE_TRADUCCION, JSON.stringify(["no", "es", "un", "mapa"]));
        expect(leer("ana", "fr", almacen)).toEqual(preferenciasPorDefecto("fr"));

        expect(guardar("ana", conAuto("it", { paginas: "siempre" }), almacen)).toBe(true);
        expect(leer("ana", "fr", almacen)).toEqual(conAuto("it", { paginas: "siempre" }));

        expect(guardar("", preferenciasPorDefecto(), almacen)).toBe(false);
        expect(guardar("ana", preferenciasPorDefecto(), null)).toBe(false);
        expect(leer("ana", "fr", null)).toEqual(preferenciasPorDefecto("fr"));
    });

    it("decide por contexto y nunca traduce lo que ya entiende", () => {
        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "fr")).toBe(true);
        expect(debeTraducir(conAuto("es", { paginas: "preguntar" }), "paginas", "fr")).toBe(false);
        expect(debeTraducir(conAuto("es", { paginas: "nunca" }), "paginas", "fr")).toBe(false);
        expect(debeTraducir(conAuto("es", { publicaciones: "siempre" }), "agentes", "de")).toBe(false);

        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "es-ES")).toBe(false);
        const entiende = { ...conAuto("es", { mensajes: "siempre" }), entiende: ["es", "fr"] };
        expect(debeTraducir(entiende, "mensajes", "fr-CA")).toBe(false);
        expect(debeTraducir(entiende, "mensajes", "de")).toBe(true);

        expect(debeTraducir(undefined, "paginas", "fr")).toBe(false);
        expect(debeTraducir(conAuto("es", { paginas: "siempre" }), "paginas", "")).toBe(false);
    });
});
