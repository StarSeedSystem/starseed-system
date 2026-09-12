import { describe, it, expect } from "vitest";

import { coincide, haceCuanto, normalizar, tamanoTexto } from "@/lib/mando/contextos-panel";

describe("haceCuanto", () => {
    const AHORA = Date.parse("2026-09-12T20:00:00-06:00");

    it("da «ahora mismo» para algo de hace menos de un minuto", () => {
        expect(haceCuanto("2026-09-12T19:59:40-06:00", AHORA)).toBe("ahora mismo");
    });

    it("da minutos redondeados bajo una hora", () => {
        expect(haceCuanto("2026-09-12T19:55:00-06:00", AHORA)).toBe("hace 5 min");
    });

    it("da horas bajo un día y días por encima", () => {
        expect(haceCuanto("2026-09-12T18:00:00-06:00", AHORA)).toBe("hace 2 h");
        expect(haceCuanto("2026-09-09T20:00:00-06:00", AHORA)).toBe("hace 3 d");
    });

    it("devuelve «—» para una fecha ilegible", () => {
        expect(haceCuanto("no-es-fecha", AHORA)).toBe("—");
    });
});

describe("tamanoTexto", () => {
    it("formatea miles a la española", () => {
        expect(tamanoTexto(12000)).toBe("12.000 car.");
    });

    it("devuelve «—» para cero, negativos o no finitos", () => {
        expect(tamanoTexto(0)).toBe("—");
        expect(tamanoTexto(-5)).toBe("—");
        expect(tamanoTexto(Number.NaN)).toBe("—");
    });
});

describe("normalizar", () => {
    it("quita tildes y mayúsculas", () => {
        expect(normalizar("Áréas y Habilidades")).toBe("areas y habilidades");
    });
});

describe("coincide", () => {
    const contexto = {
        tarea: "MD3",
        titulo: "Pestaña de contextos del Mando",
        area: "mando",
        habilidades: ["Icon", "design-md", "grafo-codigo"],
    };

    it("una búsqueda vacía coincide con todo", () => {
        expect(coincide(contexto, "   ")).toBe(true);
    });

    it("encuentra por id, título, área y habilidad, sin tildes", () => {
        expect(coincide(contexto, "md3")).toBe(true);
        expect(coincide(contexto, "pestana")).toBe(true);
        expect(coincide(contexto, "MANDO")).toBe(true);
        expect(coincide(contexto, "grafo")).toBe(true);
    });

    it("no coincide con un término que no está en la bolsa", () => {
        expect(coincide(contexto, "supabase")).toBe(false);
    });
});
