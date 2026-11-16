import { describe, expect, it } from "vitest";
import {
    MODELOS_LOCALES,
    estadoDePar,
    modeloPara,
    ruta2saltos,
    type EstadoPar,
    type PaqueteModelo,
    type RutaDosSaltos,
} from "../modelos-locales";

describe("modelos locales de traducción", () => {
    describe("MODELOS_LOCALES", () => {
        it("todas las filas tienen verificado:false y hash vacío", () => {
            for (const m of MODELOS_LOCALES) {
                expect(m.verificado).toBe(false);
                expect(m.hash).toBe("");
                expect(m.bytes).toBeGreaterThan(0);
            }
        });

        it("contiene solo pares con inglés como centro (es, fr, de, pt, it ↔ en)", () => {
            const idiomasEsperados = new Set(["es", "fr", "de", "pt", "it", "en"]);
            for (const m of MODELOS_LOCALES) {
                expect(idiomasEsperados.has(m.origen)).toBe(true);
                expect(idiomasEsperados.has(m.destino)).toBe(true);
                expect(m.origen === "en" || m.destino === "en").toBe(true);
            }
        });

        it("el repo sigue el patrón Xenova/opus-mt-<origen>-<destino>", () => {
            for (const m of MODELOS_LOCALES) {
                expect(m.repo).toBe(`Xenova/opus-mt-${m.origen}-${m.destino}`);
            }
        });
    });

    describe("modeloPara", () => {
        it("devuelve el modelo para par directo existente", () => {
            const m = modeloPara("es", "en");
            expect(m).toBeDefined();
            expect(m?.origen).toBe("es");
            expect(m?.destino).toBe("en");
            expect(m?.repo).toBe("Xenova/opus-mt-es-en");
        });

        it("devuelve undefined para par sin modelo", () => {
            expect(modeloPara("es", "fr")).toBeUndefined();
            expect(modeloPara("ja", "en")).toBeUndefined();
            expect(modeloPara("xx", "yy")).toBeUndefined();
        });
    });

    describe("estadoDePar", () => {
        const instalados = ["Xenova/opus-mt-es-en"] as const;

        it("devuelve 'sin-internet' si el modelo está instalado", () => {
            expect(estadoDePar("es", "en", instalados)).toBe("sin-internet");
        });

        it("devuelve 'descarga' si hay modelo pero no está instalado", () => {
            expect(estadoDePar("en", "es", instalados)).toBe("descarga");
        });

        it("devuelve 'solo-internet' si no hay modelo para el par", () => {
            expect(estadoDePar("es", "fr", instalados)).toBe("solo-internet");
            expect(estadoDePar("ja", "en", instalados)).toBe("solo-internet");
        });

        it("funciona con array vacío de instalados", () => {
            expect(estadoDePar("es", "en", [])).toBe("descarga");
            expect(estadoDePar("es", "fr", [])).toBe("solo-internet");
        });
    });

    describe("ruta2saltos", () => {
        it("devuelve undefined para par directo existente", () => {
            expect(ruta2saltos("es", "en")).toBeUndefined();
            expect(ruta2saltos("en", "fr")).toBeUndefined();
        });

        it("devuelve undefined para mismo idioma", () => {
            expect(ruta2saltos("es", "es")).toBeUndefined();
        });

        it("devuelve ruta de dos saltos via inglés cuando ambos tienen modelo con en", () => {
            const r = ruta2saltos("es", "fr");
            expect(r).toBeDefined();
            expect(r?.ruta).toEqual(["es", "en", "fr"]);
            expect(r?.aviso).toBe("dos pasos, peor calidad");
        });

        it("devuelve undefined si el origen no tiene modelo con inglés", () => {
            expect(ruta2saltos("ja", "fr")).toBeUndefined();
        });

        it("devuelve undefined si el destino no tiene modelo con inglés", () => {
            expect(ruta2saltos("es", "ja")).toBeUndefined();
        });
    });
});