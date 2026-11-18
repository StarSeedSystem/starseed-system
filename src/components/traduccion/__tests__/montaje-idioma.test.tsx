// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { idiomaDestino, motoresPagina, traducirYReemplazar } from "../montaje-idioma";
import { capturarSeleccionEditable, deshacerUltimo } from "../reemplazar-seleccion";

function area(valor: string): HTMLTextAreaElement {
    const el = document.createElement("textarea");
    el.value = valor;
    document.body.append(el);
    el.focus();
    return el;
}

let originalTranslator: unknown;
let originalProtocol: string;
let originalHostname: string;

beforeEach(() => {
    originalTranslator = (window as any).Translator;
    originalProtocol = location.protocol;
    originalHostname = location.hostname;
    (window as any).Translator = undefined;
    localStorage.clear();
});

afterEach(() => {
    deshacerUltimo();
    document.body.textContent = "";
    (window as any).Translator = originalTranslator;
    Object.defineProperty(location, "protocol", { value: originalProtocol, configurable: true });
    Object.defineProperty(location, "hostname", { value: originalHostname, configurable: true });
    localStorage.clear();
});

describe("montaje-idioma · funciones puras", () => {
    it("idiomaDestino lee el idioma del perfil desde localStorage", () => {
        localStorage.setItem("starseed.traduccion.v1", JSON.stringify({ "user-1": { idioma: "en", entiende: ["es"], auto: { paginas: "preguntar", mensajes: "preguntar", publicaciones: "preguntar", agentes: "preguntar", astraura: "preguntar" } } }));
        expect(idiomaDestino("user-1", "es")).toBe("en");
    });

    it("idiomaDestino usa el idioma del navegador si no hay perfil", () => {
        expect(idiomaDestino("usuario-inexistente", "fr")).toBe("fr");
    });

    it("motoresPagina incluye navegador si hay Translator API", () => {
        (window as any).Translator = {
            availability: async () => "available",
            create: async () => ({ translate: async (t: string) => t }),
        };
        const ids = motoresPagina().map((m) => m.id);
        expect(ids).toContain("navegador");
    });

    it("motoresPagina incluye libretranslate en localhost https", () => {
        Object.defineProperty(location, "protocol", { value: "https:", configurable: true });
        Object.defineProperty(location, "hostname", { value: "localhost", configurable: true });
        const ids = motoresPagina().map((m) => m.id);
        expect(ids).toContain("libretranslate");
    });

    it("motoresPagina no incluye libretranslate en https pública", () => {
        Object.defineProperty(location, "protocol", { value: "https:", configurable: true });
        Object.defineProperty(location, "hostname", { value: "starseed-os.vercel.app", configurable: true });
        const ids = motoresPagina().map((m) => m.id);
        expect(ids).not.toContain("libretranslate");
    });

    it("traducirYReemplazar con Translator simulada reemplaza el texto del textarea", async () => {
        (window as any).Translator = {
            availability: async () => "available",
            create: async () => ({ translate: async (t: string) => "Hello world" }),
        };
        Object.defineProperty(location, "protocol", { value: "https:", configurable: true });
        Object.defineProperty(location, "hostname", { value: "starseed-os.vercel.app", configurable: true });

        const el = area("Hola mundo");
        el.setSelectionRange(0, 4);
        const objetivo = capturarSeleccionEditable(document)!;
        const msg = await traducirYReemplazar(objetivo, "user-1");
        expect(el.value).toBe("Hello world mundo");
        expect(msg).toBe("Reemplazado con navegador.");
    });

    it("traducirYReemplazar si el motor falla no cambia el texto y lanza", async () => {
        (window as any).Translator = {
            availability: async () => "available",
            create: async () => ({ translate: async () => { throw new Error("Motor caído"); } }),
        };
        Object.defineProperty(location, "protocol", { value: "https:", configurable: true });
        Object.defineProperty(location, "hostname", { value: "starseed-os.vercel.app", configurable: true });

        const el = area("Hola mundo");
        el.setSelectionRange(0, 4);
        const objetivo = capturarSeleccionEditable(document)!;
        await expect(traducirYReemplazar(objetivo, "user-1")).rejects.toThrow("Motor caído");
        expect(el.value).toBe("Hola mundo");
    });

    it("deshacerUltimo devuelve el texto original después de traducirYReemplazar", async () => {
        (window as any).Translator = {
            availability: async () => "available",
            create: async () => ({ translate: async (t: string) => "Hello world" }),
        };
        Object.defineProperty(location, "protocol", { value: "https:", configurable: true });
        Object.defineProperty(location, "hostname", { value: "starseed-os.vercel.app", configurable: true });

        const el = area("Hola mundo");
        el.setSelectionRange(0, 4);
        const objetivo = capturarSeleccionEditable(document)!;
        await traducirYReemplazar(objetivo, "user-1");
        expect(el.value).toBe("Hello world mundo");
        expect(deshacerUltimo()).toBe(true);
        expect(el.value).toBe("Hola mundo");
    });
});