// @vitest-environment jsdom
/**
 * selector-fuente-form.test.tsx — formulario del SourcePicker (rescate de la
 * rama nube/39711481854, tarea DGM1018Cc): las etiquetas con texto visible
 * quedan ligadas a su input por id y el campo de archivo (sin label visible)
 * lleva aria-label. Los accesos a biblioteca/cerebros/neuronas van mockeados;
 * la prueba solo mira la asociación etiqueta ↔ campo.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import type { SourceRefKind } from "@/components/creation/source-picker";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/library/entity-library", () => ({
  myLibraryDestinations: vi.fn(async () => []),
  listLibrary: vi.fn(async () => ({ folders: [], items: [] })),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: vi.fn(async () => []) }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: vi.fn(async () => []) }));

import { SourcePicker, type SourceRefKind } from "@/components/creation/source-picker";

// Con `open` controlado el DialogContent se monta sin interacción previa; el
// AppearanceProvider lo piden el propio shadcn del repo (ver
// malla-neuronas-panel-vinculos.test.tsx).
function renderPicker(kinds: SourceRefKind[]) {
  render(
    <AppearanceProvider>
      <SourcePicker open onPick={vi.fn()} kinds={kinds} />
    </AppearanceProvider>,
  );
}

afterEach(() => cleanup());

describe("SourcePicker · formulario de fuente", () => {
  test("las etiquetas URL y Etiqueta quedan ligadas a su input por id", () => {
    renderPicker(["url"]);

    const urlInput = screen.getByLabelText("URL");
    const etiquetaInput = screen.getByLabelText("Etiqueta (opcional)");

    expect(urlInput).toBeInstanceOf(HTMLInputElement);
    expect(etiquetaInput).toBeInstanceOf(HTMLInputElement);
    expect(urlInput).toHaveAttribute("id");
    expect(etiquetaInput).toHaveAttribute("id");
    // El id de cada campo es único y distinto entre sí.
    expect(urlInput).not.toEqual(etiquetaInput);
    expect(urlInput.getAttribute("id")).not.toBe(etiquetaInput.getAttribute("id"));
  });

  test("el input de archivo del dispositivo lleva aria-label (sin label visible)", () => {
    renderPicker(["device"]);

    const archivo = screen.getByLabelText("Archivo del dispositivo");
    expect(archivo).toBeInstanceOf(HTMLInputElement);
    expect((archivo as HTMLInputElement).type).toBe("file");
  });
});

