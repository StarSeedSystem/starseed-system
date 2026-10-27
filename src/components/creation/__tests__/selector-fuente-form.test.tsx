// @vitest-environment jsdom
/**
 * selector-fuente-form.test.tsx — accesibilidad de etiquetas en SourcePicker
 * (SP092941b, sugiere SA092938). Los lectores de pantalla deben anunciar el
 * propósito de cada campo: las etiquetas URL y Etiqueta quedan ligadas a sus
 * inputs (htmlFor + id) y el input de archivo oculto del dispositivo lleva
 * aria-label porque no tiene label visible.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/library/entity-library", () => ({
    myLibraryDestinations: vi.fn(async () => []),
    listLibrary: vi.fn(async () => ({ folders: [], items: [] })),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: vi.fn(async () => []) }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: vi.fn(async () => []) }));

import { SourcePicker, type SourceRefKind } from "@/components/creation/source-picker";

function renderPicker(kinds: SourceRefKind[]) {
    return render(
        <AppearanceProvider>
            <SourcePicker open onPick={() => {}} onOpenChange={() => {}} kinds={kinds} />
        </AppearanceProvider>,
    );
}

afterEach(() => cleanup());

describe("SourcePicker · asociación de etiquetas a campos", () => {
    test("las etiquetas URL y Etiqueta quedan ligadas a su input por id", () => {
        renderPicker(["url"]);

        const urlInput = screen.getByLabelText("URL");
        const etiquetaInput = screen.getByLabelText("Etiqueta (opcional)");

        expect(urlInput).toBeInstanceOf(HTMLInputElement);
        expect(etiquetaInput).toBeInstanceOf(HTMLInputElement);
        expect(urlInput.id).toBeTruthy();
        expect(etiquetaInput.id).toBeTruthy();
        // ids únicos aunque el picker se renderice varias veces en la página.
        expect(urlInput.id).not.toBe(etiquetaInput.id);
    });

    test("el input de archivo del dispositivo lleva aria-label (sin label visible)", () => {
        renderPicker(["device"]);

        const archivo = screen.getByLabelText("Archivo del dispositivo");
        expect(archivo).toBeInstanceOf(HTMLInputElement);
        expect((archivo as HTMLInputElement).type).toBe("file");
    });
});
