/**
 * Pruebas de la marca «EN VIVO» con contador de presencia (SES1116 · P1-C).
 * Cuatro estados: en directo, apagado sin personas, apagado con personas y sin datos.
 * «sin datos» jamás enseña «EN VIVO», aunque vengan personas.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MarcaDirecto } from "../marca-directo";

afterEach(cleanup);

describe("MarcaDirecto", () => {
    it("en directo: punto, «EN VIVO» y el contador de personas", () => {
        render(<MarcaDirecto directo={true} personas={3} />);
        const m = screen.getByLabelText("En directo, 3 personas");
        expect(m.textContent).toContain("EN VIVO");
        expect(m.textContent).toContain("3");
        expect(m.textContent).toContain("·");
    });

    it("en directo sin dato de personas: «EN VIVO» a secas, sin «·»", () => {
        render(<MarcaDirecto directo={true} personas={null} />);
        expect(screen.getByLabelText("En directo").textContent).toBe("EN VIVO");
    });

    it("sin directo y sin personas: no pinta nada", () => {
        const { container: a } = render(<MarcaDirecto directo={false} personas={null} />);
        expect(a.textContent).toBe("");
        const { container: b } = render(<MarcaDirecto directo={false} personas={0} />);
        expect(b.textContent).toBe("");
    });

    it("sin directo pero con presencia: contador de personas, sin «EN VIVO»", () => {
        render(<MarcaDirecto directo={false} personas={5} />);
        const m = screen.getByLabelText("5 personas");
        expect(m.textContent).toContain("5 personas");
        expect(m.textContent).not.toContain("EN VIVO");
    });

    it("sin datos: punto gris y «sin datos», jamás «EN VIVO» ni «directo»", () => {
        render(<MarcaDirecto directo={null} personas={3} />);
        const m = screen.getByLabelText("Presencia sin datos");
        expect(m.textContent).toContain("sin datos");
        // aunque haya personas, no se sabe si es directo: solo «sin datos»
        expect(m.textContent).not.toContain("3");
        expect(m.textContent.toUpperCase()).not.toContain("EN VIVO");
        expect(m.textContent.toLowerCase()).not.toContain("directo");
    });

    it("sin datos y sin personas: «sin datos» igualmente", () => {
        render(<MarcaDirecto directo={null} personas={null} />);
        expect(screen.getByLabelText("Presencia sin datos").textContent).toContain("sin datos");
    });

    it("compacto: mismos contenidos con la etiqueta compacta", () => {
        render(<MarcaDirecto directo={true} personas={28} compacto />);
        expect(screen.getByLabelText("En directo, 28 personas").textContent).toContain("EN VIVO · 28");
    });

    it("con title en palabras, igual que el aria-label", () => {
        render(<MarcaDirecto directo={true} personas={3} />);
        expect(screen.getByTitle("En directo, 3 personas")).toBeTruthy();
    });
});
