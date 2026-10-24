// Pruebas de formulario del selector de fuente universal (SourcePicker),
// adaptadas de la rama nube/39711481854 a la API de hoy: la pestaña URL
// ofrece sus dos campos y la del dispositivo un input de archivo.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/library/entity-library", () => ({
    myLibraryDestinations: async () => [],
    listLibrary: async () => ({ folders: [], items: [] }),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: async () => [] }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: async () => [] }));

import { SourcePicker } from "../source-picker";
import type { SourceRefKind } from "../source-picker";

afterEach(() => cleanup());

function renderPicker(kinds: SourceRefKind[]) {
    return render(
        <SourcePicker
            open
            onOpenChange={() => {}}
            onPick={() => {}}
            kinds={kinds}
        />,
    );
}

describe("SourcePicker · formularios", () => {
    it("la pestaña URL muestra sus dos campos (URL y etiqueta) separados", () => {
        renderPicker(["url"]);

        const urlInput = screen.getByPlaceholderText("https://…");
        const etiquetaInput = screen.getByPlaceholderText("Nombre visible");

        expect(urlInput).toBeInstanceOf(HTMLInputElement);
        expect(etiquetaInput).toBeInstanceOf(HTMLInputElement);
        // Son dos controles distintos aunque la maqueta aún no les dé `id`.
        expect(urlInput).not.toBe(etiquetaInput);
        expect(urlInput.closest("div")?.textContent).toContain("URL");
        expect(etiquetaInput.closest("div")?.textContent).toContain("Etiqueta (opcional)");
    });

    it("la pestaña del dispositivo ofrece un input de archivo oculto", () => {
        // El diálogo se pinta en un portal colgado de document.body.
        const { baseElement } = renderPicker(["device"]);

        const archivo = baseElement.querySelector('input[type="file"]');
        expect(archivo).toBeInstanceOf(HTMLInputElement);
        expect((archivo as HTMLInputElement).type).toBe("file");
        expect(archivo?.className).toContain("hidden");
    });
});
