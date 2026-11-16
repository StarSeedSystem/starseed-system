/**
 * RST04 · fuente de pantalla pedida: regla pura (automática o fluida) y lo que se le dice a la persona.
 * Pruebas en tabla con los 2×3 casos y la validación.
 */
import { describe, expect, it } from "vitest";
import {
    FUENTE_DEFECTO,
    FuentePedida,
    FuenteReal,
    fuentePedidaValida,
    rotuloFuente,
    veredictoFuente,
} from "../fuente-pantalla";

describe("fuentePedidaValida", () => {
    it("acepta \"auto\" y \"proyeccion\"", () => {
        expect(fuentePedidaValida("auto")).toBe("auto");
        expect(fuentePedidaValida("proyeccion")).toBe("proyeccion");
    });

    it("lo desconocido (incluido null/undefined) cae a \"auto\"", () => {
        expect(fuentePedidaValida("accesibilidad")).toBe("auto");
        expect(fuentePedidaValida(null)).toBe("auto");
        expect(fuentePedidaValida(undefined)).toBe("auto");
        expect(fuentePedidaValida(123)).toBe("auto");
        expect(fuentePedidaValida({})).toBe("auto");
    });

    it("FUENTE_DEFECTO es \"auto\"", () => {
        expect(FUENTE_DEFECTO).toBe("auto");
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
        // pedida = "auto"
        { pedida: "auto", real: "accesibilidad", cumplida: true, aviso: null, descripcion: "auto + accesibilidad → cumplida, sin aviso" },
        { pedida: "auto", real: "proyeccion", cumplida: true, aviso: null, descripcion: "auto + proyeccion → cumplida, sin aviso" },
        { pedida: "auto", real: null, cumplida: true, aviso: null, descripcion: "auto + null → cumplida, sin aviso" },
        // pedida = "proyeccion"
        {
            pedida: "proyeccion",
            real: "proyeccion",
            cumplida: true,
            aviso: null,
            descripcion: "proyeccion pedida + proyeccion real → cumplida",
        },
        {
            pedida: "proyeccion",
            real: "accesibilidad",
            cumplida: false,
            aviso: "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
            descripcion: "proyeccion pedida + accesibilidad real → NO cumplida, con aviso",
        },
        {
            pedida: "proyeccion",
            real: null,
            cumplida: false,
            aviso: null,
            descripcion: "proyeccion pedida + null (aún sin pantalla) → NO cumplida, sin aviso",
        },
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
    it("devuelve el rótulo correcto para cada FuenteReal", () => {
        expect(rotuloFuente("proyeccion")).toBe("Pantalla fluida (proyección)");
        expect(rotuloFuente("accesibilidad")).toBe("Pantalla por accesibilidad");
        expect(rotuloFuente(null)).toBe("Pantalla: aún sin fuente");
    });
});

describe("tipos exportados", () => {
    it("FuentePedida y FuenteReal son los esperados", () => {
        const p: FuentePedida = "auto";
        const r: FuenteReal = "accesibilidad";
        expect(p).toBe("auto");
        expect(r).toBe("accesibilidad");
    });
});