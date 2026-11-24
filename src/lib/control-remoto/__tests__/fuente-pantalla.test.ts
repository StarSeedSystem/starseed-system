/**
 * RST1116A · regla pura de la fuente de pantalla pedida vs real, y lo que se le dice a la persona.
 * Cobertura en tabla: 2 pedidas × 3 reales (incluye null) + validación.
 */
import { describe, expect, it } from "vitest";
import {
    FUENTE_DEFECTO,
    FuentePedida,
    FuenteReal,
    fuentePedidaValida,
    rotuloFuente,
    veredictoFuente,
    esModoMalla,
    GRACIA_MALLA_MS,
    VIGENCIA_MALLA_MS,
} from "../fuente-pantalla";

describe("RST1116A · fuente de pantalla pedida vs real", () => {
    describe("fuentePedidaValida", () => {
        it("valida «auto» y «proyeccion»", () => {
            expect(fuentePedidaValida("auto")).toBe("auto");
            expect(fuentePedidaValida("proyeccion")).toBe("proyeccion");
        });
        it("lo desconocido (incluye null, undefined, número, objeto) cae en «auto»", () => {
            expect(fuentePedidaValida(null)).toBe("auto");
            expect(fuentePedidaValida(undefined)).toBe("auto");
            expect(fuentePedidaValida("accesibilidad")).toBe("auto");
            expect(fuentePedidaValida("fluida")).toBe("auto");
            expect(fuentePedidaValida(123)).toBe("auto");
            expect(fuentePedidaValida({})).toBe("auto");
            expect(fuentePedidaValida("")).toBe("auto");
        });
    });

    describe("veredictoFuente", () => {
        const casos: Array<{
            pedida: FuentePedida;
            real: FuenteReal | null;
            cumplida: boolean;
            aviso: string | null;
            descripcion: string;
        }> = [
            { pedida: "auto", real: "proyeccion", cumplida: true, aviso: null, descripcion: "auto con proyección real → cumplida sin aviso" },
            { pedida: "auto", real: "accesibilidad", cumplida: true, aviso: null, descripcion: "auto con accesibilidad real → cumplida sin aviso" },
            { pedida: "auto", real: null, cumplida: true, aviso: null, descripcion: "auto con real null → cumplida sin aviso" },
            { pedida: "proyeccion", real: "proyeccion", cumplida: true, aviso: null, descripcion: "proyección pedida y real → cumplida sin aviso" },
            {
                pedida: "proyeccion",
                real: "accesibilidad",
                cumplida: false,
                aviso: "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
                descripcion: "proyección pedida pero accesibilidad real → NO cumplida, con aviso",
            },
            { pedida: "proyeccion", real: null, cumplida: false, aviso: null, descripcion: "proyección pedida, real null → NO cumplida, sin aviso" },
        ];

        for (const c of casos) {
            it(c.descripcion, () => {
                const r = veredictoFuente(c.pedida, c.real);
                expect(r.cumplida).toBe(c.cumplida);
                expect(r.aviso).toBe(c.aviso);
            });
        }
    });

    describe("rotuloFuente", () => {
        it("proyección → «Pantalla fluida (proyección)»", () => {
            expect(rotuloFuente("proyeccion")).toBe("Pantalla fluida (proyección)");
        });
        it("accesibilidad → «Pantalla por accesibilidad»", () => {
            expect(rotuloFuente("accesibilidad")).toBe("Pantalla por accesibilidad");
        });
        it("null → «Pantalla: aún sin fuente»", () => {
            expect(rotuloFuente(null)).toBe("Pantalla: aún sin fuente");
        });
    });

    describe("constante FUENTE_DEFECTO", () => {
        it("es «auto»", () => {
            expect(FUENTE_DEFECTO).toBe("auto");
        });
    });

    describe("tipos exportados", () => {
        it("FuentePedida admite solo «auto» | «proyeccion»", () => {
            const a: FuentePedida = "auto";
            const b: FuentePedida = "proyeccion";
            expect([a, b]).toEqual(["auto", "proyeccion"]);
        });
        it("FuenteReal admite solo «accesibilidad» | «proyeccion»", () => {
            const a: FuenteReal = "accesibilidad";
            const b: FuenteReal = "proyeccion";
            expect([a, b]).toEqual(["accesibilidad", "proyeccion"]);
        });
    });
});

describe("CTL1124C · modo malla para Linux sin WebRTC", () => {
    describe("esModoMalla", () => {
        it("Linux sin WebRTC → true", () => {
            expect(esModoMalla("linux", false)).toBe(true);
        });
        it("Linux con WebRTC → false", () => {
            expect(esModoMalla("linux", true)).toBe(false);
        });
        it("macOS sin WebRTC → false", () => {
            expect(esModoMalla("macos", false)).toBe(false);
        });
        it("macOS con WebRTC → false", () => {
            expect(esModoMalla("macos", true)).toBe(false);
        });
        it("Windows sin WebRTC → false", () => {
            expect(esModoMalla("windows", false)).toBe(false);
        });
        it("desconocido sin WebRTC → false", () => {
            expect(esModoMalla("desconocido", false)).toBe(false);
        });
    });

    describe("constantes de tiempo", () => {
        it("GRACIA_MALLA_MS = 30_000", () => {
            expect(GRACIA_MALLA_MS).toBe(30_000);
        });
        it("VIGENCIA_MALLA_MS = 8_000", () => {
            expect(VIGENCIA_MALLA_MS).toBe(8_000);
        });
    });
});