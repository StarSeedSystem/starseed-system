/**
 * Exocortex en el móvil (2026-09-26): «el fondo del menú superior aún parpadea desde el
 * navegador de un móvil». Medido con un Pixel 7 emulado: dentro de la cortina seguían
 * desenfocando lo de detrás `.axc-root` (28 px) y el botón de cerrar (14 px), y el orbe de
 * la cabecera animaba `filter`. Estas pruebas fijan que en táctil NADA dentro de la cortina
 * desenfoca lo de detrás y que lo que anima filtros o mezcla con el fondo se queda quieto.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
    path.join(process.cwd(), "src/components/layout/trinity/panel-cortina.module.css"),
    "utf8",
);
const tactil = css.slice(css.indexOf("@media (hover: none) and (pointer: coarse)"));

describe("cortinas Trinity en pantallas táctiles", () => {
    it("ningún elemento de la cortina (ni sus pseudoelementos) desenfoca lo de detrás", () => {
        expect(tactil).toMatch(/\.panel \*,\s*\.panel \*::before,\s*\.panel \*::after\s*\{[^}]*backdrop-filter:\s*none !important/);
    });

    it("el orbe, el icono flotante, el aro del cristal y el neón del panel no animan", () => {
        for (const sel of [".panel:global(.ss-neon)::after", ".panel :global(.ss-crystal)::before", ".panel :global(.ss-float)", ".panel :global(.axc-orb)"]) {
            expect(tactil).toContain(sel);
        }
        expect(tactil).toMatch(/animation:\s*none !important/);
    });

    it("las capas que mezclan con el fondo se ocultan", () => {
        expect(tactil).toMatch(/\.panel :global\(\[class\*="mix-blend"\]\)\s*\{\s*display:\s*none;/);
    });
});
