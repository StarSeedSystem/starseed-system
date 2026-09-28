import { describe, expect, it } from "vitest";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { FORMAS } from "../formas";
import { personalidadDe } from "../asignacion";

describe("personalidadDe", () => {
    it("todos los tipos del manifest tienen personalidad válida", () => {
        const tipos = Object.keys(WIDGET_MANIFEST);
        expect(tipos.length).toBeGreaterThanOrEqual(100);
        for (const t of tipos) {
            const p = personalidadDe(t);
            expect(FORMAS).toContain(p.forma);
            expect(p.acento).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
    it("la tabla de básicos manda", () => {
        expect(personalidadDe("CLOCK_DATE")).toMatchObject({ forma: "orbe", movimiento: "orbitar" });
        expect(personalidadDe("NOTIFICATIONS").forma).toBe("gota");
    });
    it("un tipo desconocido es estable y nunca «ninguna»", () => {
        expect(personalidadDe("DESCONOCIDO")).toEqual(personalidadDe("DESCONOCIDO"));
        expect(personalidadDe("DESCONOCIDO").forma).not.toBe("ninguna");
    });
});
