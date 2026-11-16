import { describe, expect, it } from "vitest";
import { AlmacénIdiomas, Deteccion, starseedTraductorPersonasV1 } from "../idioma-por-persona";

describe("idioma por persona", () => {
    const crearAlmacen = () => new AlmacénIdiomas(500);
    const det = (idioma: string, confianza: number): Deteccion => ({ idioma, confianza });

    describe("observar — tres detecciones consecutivas fijan el idioma", () => {
        it("tres detecciones seguidas del mismo idioma con confianza ≥0.8 lo fijan", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.85));
            almacen.observar("p1", det("es", 0.8));
            expect(almacen.idiomaDe("p1")).toBe("es");
        });

        it("una detección suelta no cambia el idioma", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            expect(almacen.idiomaDe("p1")).toBeUndefined();
            almacen.observar("p1", det("en", 0.9));
            expect(almacen.idiomaDe("p1")).toBeUndefined();
        });

        it("dos detecciones del mismo idioma no son suficientes", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            expect(almacen.idiomaDe("p1")).toBeUndefined();
        });

        it("tres detecciones pero una con confianza <0.8 no fija", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.7));
            almacen.observar("p1", det("es", 0.9));
            expect(almacen.idiomaDe("p1")).toBeUndefined();
        });

        it("tres detecciones de idiomas distintos no fijan", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("en", 0.9));
            almacen.observar("p1", det("fr", 0.9));
            expect(almacen.idiomaDe("p1")).toBeUndefined();
        });
    });

    describe("fijar — pedido gana siempre sobre lo detectado", () => {
        it("fijar establece el idioma aunque no haya detecciones previas", () => {
            const almacen = crearAlmacen();
            almacen.fijar("p1", "fr");
            expect(almacen.idiomaDe("p1")).toBe("fr");
        });

        it("pedido sobreescribe un idioma detectado previo", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            expect(almacen.idiomaDe("p1")).toBe("es");
            almacen.fijar("p1", "de");
            expect(almacen.idiomaDe("p1")).toBe("de");
        });

        it("solo otro pedido puede cambiar un idioma pedido", () => {
            const almacen = crearAlmacen();
            almacen.fijar("p1", "it");
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            expect(almacen.idiomaDe("p1")).toBe("it");
            almacen.fijar("p1", "pt");
            expect(almacen.idiomaDe("p1")).toBe("pt");
        });
    });

    describe("idiomaDe — devuelve el idioma o el por defecto", () => {
        it("devuelve undefined si no hay registro y no hay por defecto", () => {
            const almacen = crearAlmacen();
            expect(almacen.idiomaDe("p1")).toBeUndefined();
        });

        it("devuelve el por defecto si no hay registro", () => {
            const almacen = crearAlmacen();
            expect(almacen.idiomaDe("p1", "en")).toBe("en");
        });

        it("devuelve el idioma fijado ignorando el por defecto", () => {
            const almacen = crearAlmacen();
            almacen.fijar("p1", "es");
            expect(almacen.idiomaDe("p1", "en")).toBe("es");
        });
    });

    describe("olvidar — elimina el registro y el historial", () => {
        it("elimina el idioma fijado", () => {
            const almacen = crearAlmacen();
            almacen.fijar("p1", "es");
            almacen.olvidar("p1");
            expect(almacen.idiomaDe("p1")).toBeUndefined();
        });

        it("elimina las detecciones acumuladas", () => {
            const almacen = crearAlmacen();
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            almacen.olvidar("p1");
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            almacen.observar("p1", det("es", 0.9));
            expect(almacen.idiomaDe("p1")).toBe("es");
        });
    });

    describe("tope de 500 personas", () => {
        it("elimina la entrada más antigua al superar el tope", () => {
            const almacen = new AlmacénIdiomas(2);
            almacen.fijar("p1", "es");
            almacen.fijar("p2", "en");
            almacen.fijar("p3", "fr");
            expect(almacen.idiomaDe("p1")).toBeUndefined();
            expect(almacen.idiomaDe("p2")).toBe("en");
            expect(almacen.idiomaDe("p3")).toBe("fr");
        });
    });

    describe("instancia compartida starseedTraductorPersonasV1", () => {
        it("existe y tiene métodos esperados", () => {
            expect(starseedTraductorPersonasV1).toBeInstanceOf(AlmacénIdiomas);
            expect(typeof starseedTraductorPersonasV1.observar).toBe("function");
            expect(typeof starseedTraductorPersonasV1.fijar).toBe("function");
            expect(typeof starseedTraductorPersonasV1.idiomaDe).toBe("function");
            expect(typeof starseedTraductorPersonasV1.olvidar).toBe("function");
        });
    });
});