import { describe, expect, test } from "vitest";
import { formatearPresencia } from "@/lib/mensajeria/presencia";

describe("formatearPresencia", () => {
    const ahora = new Date(2026, 8, 28, 15, 0); // lunes 28 de sept. de 2026, 15:00 local

    test("null cuando no hay dato", () => {
        expect(formatearPresencia(undefined, ahora)).toBeNull();
        expect(formatearPresencia({ enLinea: false, visto: null }, ahora)).toBeNull();
    });

    test('"en línea" si está en línea, sin mirar `visto`', () => {
        expect(formatearPresencia({ enLinea: true, visto: null }, ahora)).toBe("en línea");
    });

    test("hoy", () => {
        const visto = new Date(2026, 8, 28, 14, 32).toISOString();
        expect(formatearPresencia({ enLinea: false, visto }, ahora)).toBe("últ. vez hoy a las 14:32");
    });

    test("ayer", () => {
        const visto = new Date(2026, 8, 27, 9, 5).toISOString();
        expect(formatearPresencia({ enLinea: false, visto }, ahora)).toBe("últ. vez ayer a las 09:05");
    });

    test("día de la semana dentro de los últimos 6 días", () => {
        const visto = new Date(2026, 8, 23, 10, 0).toISOString(); // miércoles, 5 días antes
        expect(formatearPresencia({ enLinea: false, visto }, ahora)).toBe("últ. vez el miércoles a las 10:00");
    });

    test("más de 6 días: fecha corta", () => {
        const visto = new Date(2026, 8, 12, 8, 0).toISOString();
        expect(formatearPresencia({ enLinea: false, visto }, ahora)).toBe("últ. vez el 12 de sep.");
    });

    test("fecha inválida devuelve null", () => {
        expect(formatearPresencia({ enLinea: false, visto: "no-es-una-fecha" }, ahora)).toBeNull();
    });
});
