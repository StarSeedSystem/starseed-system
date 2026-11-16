import { describe, it, expect } from "vitest";
import { idiomasConCatalogo, IDIOMAS, CON_CATALOGO } from "../idiomas";

describe("idiomasConCatalogo", () => {
    it("devuelve solo los integrados (en, pt, fr) si no hay paquetes", () => {
        const codigos = idiomasConCatalogo({ listarPaquetes: () => [] });
        expect(codigos).toEqual(["en", "fr", "pt"]);
    });

    it("añade paquetes instalados con código válido", () => {
        const codigos = idiomasConCatalogo({ listarPaquetes: () => [{ codigo: "de" }] });
        expect(codigos).toContain("de");
        expect(codigos).toContain("en");
        expect(codigos).toContain("pt");
        expect(codigos).toContain("fr");
    });

    it("añade paquetes con subcódigos (ej. es-ES → es)", () => {
        const codigos = idiomasConCatalogo({ listarPaquetes: () => [{ codigo: "es-ES" }] });
        expect(codigos).toContain("es");
    });

    it("no añade códigos que no son idiomas válidos", () => {
        const codigos = idiomasConCatalogo({ listarPaquetes: () => [{ codigo: "xx" }] });
        expect(codigos).toEqual(["en", "fr", "pt"]);
    });

    it("deduplica códigos: integrado y paquete del mismo código", () => {
        const codigos = idiomasConCatalogo({ listarPaquetes: () => [{ codigo: "en" }] });
        expect(codigos).toEqual(["en", "fr", "pt"]);
        expect(codigos.filter(c => c === "en")).toHaveLength(1);
    });

    it("incluye todos los idiomas de IDIOMAS si hay suficientes paquetes", () => {
        const paquetes = IDIOMAS.slice(0, 10).map(i => ({ codigo: i.codigo }));
        const codigos = idiomasConCatalogo({ listarPaquetes: () => paquetes });
        expect(codigos.length).toBeGreaterThanOrEqual(10);
    });
});