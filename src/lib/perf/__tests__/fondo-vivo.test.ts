// @vitest-environment jsdom
/**
 * Fondo vivo (2026-09-25): con una cortina Trinity o un diálogo modal delante, la calidad
 * del fondo se congela (en Android la difuminación del Exocortex parpadeaba porque el
 * gobernador bajaba la resolución del lienzo mientras el panel estaba abierto).
 */
import { describe, expect, it } from "vitest";

import { hayPanelDelante } from "../fondo-vivo";

describe("fondo vivo · congelado con un panel delante", () => {
    it("detecta una cortina Trinity o un diálogo modal", () => {
        const doc = document.implementation.createHTMLDocument("prueba");
        expect(hayPanelDelante(doc)).toBe(false);
        const cortina = doc.createElement("div");
        cortina.setAttribute("data-trinity-curtain", "zenith");
        doc.body.appendChild(cortina);
        expect(hayPanelDelante(doc)).toBe(true);
        cortina.remove();
        const modal = doc.createElement("div");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        doc.body.appendChild(modal);
        expect(hayPanelDelante(doc)).toBe(true);
    });

    it("sin documento (servidor) no hay panel", () => {
        expect(hayPanelDelante(null)).toBe(false);
    });

    it("un diálogo no modal no congela", () => {
        const doc = document.implementation.createHTMLDocument("prueba");
        const d = doc.createElement("div");
        d.setAttribute("role", "dialog");
        doc.body.appendChild(d);
        expect(hayPanelDelante(doc)).toBe(false);
    });
});
