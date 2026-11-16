import { describe, expect, it } from "vitest";

import { rastroPrimerArranque, textoDelError } from "../rastro-primer-arranque";

describe("textoDelError", () => {
    it("extrae el mensaje de un Error", () => {
        expect(textoDelError(new Error("sin red"))).toBe("sin red");
    });

    it("un Error sin mensaje cae en su nombre", () => {
        const e = new Error("");
        e.name = "TypeError";
        expect(textoDelError(e)).toBe("TypeError");
    });

    it("acepta una cadena tal cual", () => {
        expect(textoDelError("fallo feo")).toBe("fallo feo");
    });

    it("lee el message de un objeto suelto (estilo Supabase)", () => {
        expect(textoDelError({ message: "RLS bloquea", status: 403 })).toBe("RLS bloquea");
    });

    it("null y undefined no lanzan: texto honesto", () => {
        expect(textoDelError(null)).toBe("error desconocido");
        expect(textoDelError(undefined)).toBe("error desconocido");
    });

    it("cualquier otra cosa se describe sin lanzar", () => {
        expect(textoDelError(42)).toBe("42");
    });
});

describe("rastroPrimerArranque", () => {
    it("dónde y qué: el rastro se puede leer a la primera", () => {
        expect(rastroPrimerArranque("evaluar el arranque", new Error("suscrito a nada"))).toBe(
            "[primer-arranque] no se pudo evaluar el arranque: suscrito a nada",
        );
    });

    it("con un error raro también deja un rastro útil", () => {
        const rastro = rastroPrimerArranque("leer el perfil de la cuenta", null);
        expect(rastro).toBe("[primer-arranque] no se pudo leer el perfil de la cuenta: error desconocido");
    });
});
