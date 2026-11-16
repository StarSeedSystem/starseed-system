import { describe, it, expect, beforeEach } from "vitest";
import { GestionIdiomasPersonas } from "../idioma-por-persona";

describe("idioma por persona", () => {
    let gestor: GestionIdiomasPersonas;

    beforeEach(() => {
        gestor = new GestionIdiomasPersonas("es");
    });

    it("fijar idioma por pedido gana", () => {
        gestor.fijar("p1", "en");
        expect(gestor.idiomaDe("p1")).toBe("en");
        
        gestor.observar("p1", "fr", 0.9);
        expect(gestor.idiomaDe("p1")).toBe("en");
    });

    it("tres detecciones seguidas fijan el idioma", () => {
        gestor.observar("p1", "fr", 0.9);
        gestor.observar("p1", "fr", 0.9);
        expect(gestor.idiomaDe("p1")).toBe("es");
        
        gestor.observar("p1", "fr", 0.9);
        expect(gestor.idiomaDe("p1")).toBe("fr");
    });

    it("una deteccion suelta no cambia el idioma", () => {
        gestor.observar("p1", "fr", 0.9);
        expect(gestor.idiomaDe("p1")).toBe("es");
    });

    it("deteccion de distinto idioma resetea el contador", () => {
        gestor.observar("p1", "fr", 0.9);
        gestor.observar("p1", "en", 0.9);
        gestor.observar("p1", "en", 0.9);
        gestor.observar("p1", "en", 0.9);
        expect(gestor.idiomaDe("p1")).toBe("en");
    });

    it("olvidar elimina el registro", () => {
        gestor.fijar("p1", "en");
        gestor.olvidar("p1");
        expect(gestor.idiomaDe("p1")).toBe("es");
    });
});
