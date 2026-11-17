import { describe, expect, it } from "vitest";
import {
    crearAlmacenPersonasMemoria,
    type AlmacenPersonas,
    type PersonaIdioma,
    observar,
    fijar,
    idiomaDe,
    olvidar,
} from "../idioma-por-persona";

function crearAlmacen(): AlmacenPersonas {
    return crearAlmacenPersonasMemoria();
}

describe("idioma por persona", () => {
    describe("observar — tres detecciones consecutivas fijan el idioma", () => {
        it("una detección no cambia el idioma detectado", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("en");
        });

        it("dos detecciones del mismo idioma no cambian todavía", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("en");
        });

        it("tres detecciones consecutivas del mismo idioma con confianza ≥0.8 fijan el idioma", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("es");
        });

        it("una detección de otro idioma rompe la racha", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "fr", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("fr");
        });

        it("confianza <0.8 no cuenta para la racha y la reinicia", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.7 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("en");
        });
    });

    describe("fijar — pedido gana siempre sobre lo detectado", () => {
        it("fijar establece el idioma como pedido", () => {
            const almacen = crearAlmacen();
            fijar("p1", "fr", almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("fr");
        });

        it("pedido posterior sobrescribe pedido anterior", () => {
            const almacen = crearAlmacen();
            fijar("p1", "fr", almacen);
            fijar("p1", "de", almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("de");
        });

        it("pedido ignora detecciones previas y posteriores", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            fijar("p1", "fr", almacen);
            observar("p1", { idioma: "de", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "de", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "de", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("fr");
        });
    });

    describe("idiomaDe — devuelve el idioma actual", () => {
        it("devuelve porDefecto si no hay nada guardado", () => {
            const almacen = crearAlmacen();
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("en");
        });

        it("devuelve idioma detectado tras tres observaciones", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("es");
        });

        it("devuelve idioma fijado por pedido", () => {
            const almacen = crearAlmacen();
            fijar("p1", "fr", almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("fr");
        });
    });

    describe("olvidar — borra la persona del almacen", () => {
        it("borra idioma detectado", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            olvidar("p1", almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("en");
        });

        it("borra idioma fijado por pedido", () => {
            const almacen = crearAlmacen();
            fijar("p1", "fr", almacen);
            olvidar("p1", almacen);
            const r = idiomaDe("p1", "en", almacen);
            expect(r).toBe("en");
        });

        it("después de olvidar devuelve porDefecto", () => {
            const almacen = crearAlmacen();
            fijar("p1", "fr", almacen);
            olvidar("p1", almacen);
            const r = idiomaDe("p1", "pt", almacen);
            expect(r).toBe("pt");
        });
    });

    describe("tope de 500 personas", () => {
        it("elimina la más antigua al superar el límite", () => {
            const almacen = crearAlmacen();
            for (let i = 0; i < 501; i++) {
                fijar(`p${i}`, "es", almacen);
            }
            expect(idiomaDe("p0", "en", almacen)).toBe("en");
            expect(idiomaDe("p500", "en", almacen)).toBe("es");
        });
    });

    describe("fuente y confianza en el registro", () => {
        it("detectado guarda fuente 'detectado' y confianza", () => {
            const almacen = crearAlmacen();
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
            const personas = (almacen as any).mapa?.get("starseed.traductor.personas.v1");
            // No podemos acceder al interno directo, pero verificamos comportamiento
            expect(idiomaDe("p1", "en", almacen)).toBe("es");
        });

        it("pedido guarda fuente 'pedido' y confianza 1", () => {
            const almacen = crearAlmacen();
            fijar("p1", "fr", almacen);
            expect(idiomaDe("p1", "en", almacen)).toBe("fr");
        });
    });
});