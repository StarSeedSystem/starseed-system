import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Esta prueba no mira cómo QUEDA el Mando: mira que no se haya vuelto caro.
 *
 * Parece rara hasta que alguien mete una transición de `height` en la cabecera y
 * el panel empieza a dar tirones con el enjambre escribiendo al lado. El
 * presupuesto de rendimiento está escrito en el propio CSS; esto lo hace exigible.
 */
const css = readFileSync(path.resolve(__dirname, "../mando-cristal.css"), "utf8");

/** El CSS sin comentarios: las reglas se cuentan, las explicaciones no. */
const reglas = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("presupuesto de rendimiento del Mando", () => {
    it("no anima ninguna propiedad que recalcule el layout", () => {
        const transiciones = reglas.match(/transition:[^;]+;/g) ?? [];
        const prohibidas = /\b(width|height|top|left|right|bottom|margin|padding)\b/;
        for (const t of transiciones) {
            expect(t, `transición que provoca layout: ${t}`).not.toMatch(prohibidas);
        }
    });

    it("dentro de los @keyframes solo se mueven transform y opacity", () => {
        const bloques = reglas.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? [];
        expect(bloques.length).toBeGreaterThan(0);
        for (const b of bloques) {
            const props = (b.match(/^\s*([a-z-]+):/gm) ?? []).map((p) => p.trim().replace(":", ""));
            for (const p of props) {
                expect(["transform", "opacity", "animation"], `propiedad animada cara: ${p}`).toContain(p);
            }
        }
    });

    it("hay como mucho UNA animación infinita", () => {
        const infinitas = reglas.match(/animation:[^;]*\binfinite\b/g) ?? [];
        expect(infinitas.length).toBeLessThanOrEqual(1);
    });

    it("backdrop-filter aparece como mucho dos veces: es lo más caro del archivo", () => {
        const usos = reglas.match(/backdrop-filter\s*:/g) ?? [];
        expect(usos.length).toBeLessThanOrEqual(2);
    });

    it("existe el bloque de prefers-reduced-motion y apaga las animaciones", () => {
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        const bloque = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(bloque).toContain("animation: none");
        expect(bloque).toContain("transition: none");
    });

    it("no se cuelan librerías ni 3D de verdad: la profundidad es luz, no geometría", () => {
        expect(reglas).not.toMatch(/\bperspective\s*:/);
        expect(reglas).not.toMatch(/@import/);
    });

    it("define los tokens con prefijo propio para no chocar con el resto del OS", () => {
        expect(css).toContain("--mc-neon-cian");
        expect(css).toContain("--mc-cristal-fondo");
    });
});
