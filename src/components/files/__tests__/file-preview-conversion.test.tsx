// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { FilePreview } from "../file-preview";

afterEach(cleanup);

describe("«Convertir a…» en la vista previa de archivos", () => {
    it("un PDF ofrece el enlace al conversor con su URL y su nombre", () => {
        render(<FilePreview file={{ url: "https://x/informe.pdf", name: "informe.pdf" }} />);

        expect(screen.getByRole("link", { name: /Convertir a…/ })).toHaveAttribute(
            "href",
            "/convertir?url=https%3A%2F%2Fx%2Finforme.pdf&nombre=informe.pdf",
        );
    });

    it("conserva las herramientas PDF de Stirling junto a la conversión", () => {
        render(<FilePreview file={{ url: "https://x/informe.pdf", name: "informe.pdf" }} />);

        expect(screen.getByRole("link", { name: /Herramientas PDF \(Stirling-PDF\)/ })).toHaveAttribute(
            "href",
            "https://github.com/Stirling-Tools/Stirling-PDF",
        );
    });

    it("un PDF sin URL no finge conversión", () => {
        render(<FilePreview file={{ name: "informe.pdf" }} />);

        expect(screen.queryByRole("link", { name: /Convertir a…/ })).toBeNull();
    });
});
