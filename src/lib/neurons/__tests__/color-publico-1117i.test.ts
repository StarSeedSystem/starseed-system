import { describe, expect, it } from "vitest";
import { PALETA_COLOR_PUBLICO, colorValido, normalizarColor } from "../color-publico";

describe("CTL1117I · paleta y escritura del color público", () => {
    it("doce colores, todos válidos y distintos", () => {
        expect(PALETA_COLOR_PUBLICO).toHaveLength(12);
        expect(new Set(PALETA_COLOR_PUBLICO.map((c) => c.color)).size).toBe(12);
        for (const c of PALETA_COLOR_PUBLICO) expect(colorValido(c.color)).toBe(true);
    });
    it("normaliza lo que escribe la persona", () => {
        expect(normalizarColor("#E5484D")).toBe("#e5484d");
        expect(normalizarColor(" e5484d ")).toBe("#e5484d");
        expect(normalizarColor("#e54")).toBe("#ee5544");
        for (const m of ["", "rojo", "#12345", "#gggggg", null, 3, "#1234567"]) expect(normalizarColor(m)).toBeNull();
    });
    it("se distinguen del fondo oscuro (>= 4) y del claro (>= 2,2; además llevan borde)", () => {
        const lum = (h: string) => {
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16)));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        for (const { color } of PALETA_COLOR_PUBLICO) {
            const l = lum(color);
            expect((l + 0.05) / 0.05, `${color} sobre negro`).toBeGreaterThanOrEqual(4);
            expect(1.05 / (l + 0.05), `${color} sobre blanco`).toBeGreaterThanOrEqual(2.2);
        }
    });
});
