import { describe, expect, it, beforeEach } from "vitest";
import {
    fijar,
    idiomaDe,
    observar,
    olvidar,
    reiniciar,
    obtenerMapa,
    type AlmacenIdioma,
    TOPE_PERSONAS,
} from "../idioma-por-persona";

describe("idioma-por-persona", () => {
    const almacenMockeado: AlmacenIdioma = {
        obtener: () => ({}),
        guardar: () => {},
    };

    beforeEach(() => {
        reiniciar();
    });

    describe("observar", () => {
        it("devuelve false y no cambia idioma con confianza < 0.8", () => {
            const r = observar("p1", { codigo: "es", confianza: 0.7 }, almacenMockeado);
            expect(r).toBe(false);
            expect(idiomaDe("p1", "default")).toBe("default");
        });

        it("guarda detección con confianza >= 0.8 pero no fija hasta 3 veces", () => {
            expect(idiomaDe("p1", "default")).toBe("default");

            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            expect(idiomaDe("p1", "default")).toBe("es");
        });

        it("tres detecciones consecutivas del mismo idioma la fijan automáticamente y devuelve true", () => {
            const r1 = observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            const r2 = observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            const r3 = observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);

            expect(r1).toBe(false);
            expect(r2).toBe(false);
            expect(r3).toBe(true);
            expect(idiomaDe("p1", "default")).toBe("es");
        });

        it("una detección distinta del idioma actual reinicia el contador", () => {
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            observar("p1", { codigo: "fr", confianza: 0.85 }, almacenMockeado);

            const r = observar("p1", { codigo: "fr", confianza: 0.85 }, almacenMockeado);
            expect(r).toBe(false);
            expect(idiomaDe("p1", "default")).toBe("fr");

            const r2 = observar("p1", { codigo: "fr", confianza: 0.85 }, almacenMockeado);
            expect(r2).toBe(false);

            const r3 = observar("p1", { codigo: "fr", confianza: 0.85 }, almacenMockeado);
            expect(r3).toBe(true);
            expect(idiomaDe("p1", "default")).toBe("fr");
        });

        it("una detección suelta no cambia idioma ya fijado", () => {
            fijar("p1", "es", almacenMockeado);
            expect(idiomaDe("p1")).toBe("es");

            observar("p1", { codigo: "fr", confianza: 0.9 }, almacenMockeado);
            expect(idiomaDe("p1")).toBe("es");
        });
    });

    describe("fijar", () => {
        it("fija el idioma con fuente 'pedido' y confianza 1", () => {
            fijar("p1", "es", almacenMockeado);
            const reg = idiomaDe("p1");
            expect(reg).toBe("es");
        });

        it("un segundo pedido con el mismo idioma no cambia nada", () => {
            fijar("p1", "es", almacenMockeado);
            fijar("p1", "es", almacenMockeado);
            expect(idiomaDe("p1")).toBe("es");
        });

        it("un pedido cambia el idioma incluso si estaba fijado antes", () => {
            fijar("p1", "es", almacenMockeado);
            fijar("p1", "fr", almacenMockeado);
            expect(idiomaDe("p1")).toBe("fr");
        });

        it("el pedido gana sobre el detectado", () => {
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            expect(idiomaDe("p1")).toBe("es");

            fijar("p1", "fr", almacenMockeado);
            expect(idiomaDe("p1")).toBe("fr");
        });
    });

    describe("fuente", () => {
        it("el idioma fijado tiene fuente 'pedido'", () => {
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);

            const mapa = obtenerMapa();
            expect(mapa["p1"].fuente).toBe("pedido");
        });

        it("el idioma detectado tiene fuente 'detectado'", () => {
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            expect(idiomaDe("p1")).toBe("es");

            const mapa = obtenerMapa();
            expect(mapa["p1"].fuente).toBe("detectado");
        });
    });

    describe("olvidar", () => {
        it("elimina el registro de una persona", () => {
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            expect(idiomaDe("p1", "default")).toBe("es");

            olvidar("p1", almacenMockeado);
            expect(idiomaDe("p1", "default")).toBe("default");
        });

        it("elimina el registro sin reiniciar el contador", () => {
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);

            olvidar("p1", almacenMockeado);

            const r1 = observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            const r2 = observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);
            const r3 = observar("p1", { codigo: "es", confianza: 0.85 }, almacenMockeado);

            expect(r3).toBe(true);
        });
    });

    describe("idiomaDe", () => {
        it("devuelve el idioma fijado para la persona", () => {
            fijar("p1", "fr", almacenMockeado);
            expect(idiomaDe("p1")).toBe("fr");
        });

        it("devuelve el idioma detectado hasta que se fije", () => {
            observar("p1", { codigo: "en", confianza: 0.85 }, almacenMockeado);
            expect(idiomaDe("p1")).toBe("en");
        });

        it("devuelve porDefecto si no hay registro", () => {
            expect(idiomaDe("desconocida", "default")).toBe("default");
        });

        it("devuelve porDefecto como undefined si no se pasa y no hay registro", () => {
            expect(idiomaDe("desconocida")).toBeUndefined();
        });
    });

    describe("obtenerMapa", () => {
        it("devuelve una copia del mapa con todos los registros", () => {
            fijar("p1", "es", almacenMockeado);
            fijar("p2", "fr", almacenMockeado);

            const mapa = obtenerMapa();
            expect(Object.keys(mapa)).toEqual(["p1", "p2"]);
            expect(mapa["p1"].idioma).toBe("es");
            expect(mapa["p2"].idioma).toBe("fr");
        });
    });

    describe("TOPE_PERSONAS", () => {
        it("está definido como 500", () => {
            expect(TOPE_PERSONAS).toBe(500);
        });
    });
});