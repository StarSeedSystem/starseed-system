// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TextoBurbuja } from "../texto-burbuja";

// El Button del OS necesita el proveedor de apariencia; aquí no pinta nada que se pruebe.
vi.mock("@/components/ui/button", () => ({ Button: (p: Record<string, unknown>) => <button {...(p as object)} /> }));

describe("TextoBurbuja (LLA1108C)", () => {
    it("renderiza **negrita** y _cursiva_ como marcas, no como texto crudo", () => {
        const { container } = render(<TextoBurbuja texto={"Hola **mundo** y _tú_"} />);
        expect(container.textContent).not.toContain("**");
        expect(container.querySelector("strong")?.textContent).toBe("mundo");
        expect(container.querySelector("em")?.textContent).toBe("tú");
    });
    it("el texto plano pasa intacto", () => {
        const { container } = render(<TextoBurbuja texto="sin marcas" />);
        expect(container.textContent).toContain("sin marcas");
    });
});
