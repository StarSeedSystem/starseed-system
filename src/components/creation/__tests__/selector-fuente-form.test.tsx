/**
 * Rescate de la rama nube/40228390243 · SourcePicker: el panel de URL usa una
 * etiqueta por campo con su input de texto, el botón solo se habilita con una
 * URL válida y devuelve la referencia, y el input de archivos del dispositivo
 * vive oculto detrás de «Elegir archivo».
 */
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import { SourcePicker } from "../source-picker";
expect.extend(matchers);

vi.mock("@/hooks/use-toast", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/hooks/use-toast");
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/library/entity-library", () => ({
  myLibraryDestinations: vi.fn().mockResolvedValue([]),
  listLibrary: vi.fn().mockResolvedValue({ folders: [], items: [] }),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: vi.fn().mockResolvedValue([]) }));

afterEach(() => cleanup());

describe("SourcePicker · panel de URL (rama rescatada)", () => {
  it("el panel de URL acompaña a cada input con su etiqueta y su input de texto", () => {
    render(
      <AppearanceProvider>
        <SourcePicker open onPick={() => {}} kinds={["url"]} />
      </AppearanceProvider>,
    );

    const urlInput = screen.getByPlaceholderText("https://…");
    const etiquetaInput = screen.getByPlaceholderText("Nombre visible");
    expect(urlInput).toBeInstanceOf(HTMLInputElement);
    expect(etiquetaInput).toBeInstanceOf(HTMLInputElement);
    // Hoy la asociación etiqueta-input es visual (la etiqueta precede al
    // input dentro del mismo grupo de formulario).
    expect(urlInput.previousElementSibling?.textContent).toBe("URL");
    expect(etiquetaInput.previousElementSibling?.textContent).toBe(
      "Etiqueta (opcional)",
    );
  });

  it("el botón de URL solo se habilita con una URL válida y devuelve la referencia", () => {
    const onPick = vi.fn();
    render(
      <AppearanceProvider>
        <SourcePicker open onPick={onPick} kinds={["url"]} />
      </AppearanceProvider>,
    );

    const usar = screen.getByRole("button", { name: /Usar enlace/ });
    expect(usar).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("https://…"), {
      target: { value: "https://starseed-os.vercel.app" },
    });
    expect(usar).toBeEnabled();

    fireEvent.click(usar);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({
      kind: "url",
      url: "https://starseed-os.vercel.app",
      name: undefined,
      label: undefined,
    });
  });
});

describe("SourcePicker · panel de dispositivo (rama rescatada)", () => {
  it("el input de archivo del dispositivo es type file y permanece oculto", () => {
    render(
      <AppearanceProvider>
        <SourcePicker open onPick={() => {}} kinds={["device"]} />
      </AppearanceProvider>,
    );

    // El disparo real es el botón «Elegir archivo»; el input vive oculto.
    const archivo = document.querySelector('input[type="file"]');
    expect(archivo).toBeInstanceOf(HTMLInputElement);
    expect((archivo as HTMLInputElement).type).toBe("file");
    expect((archivo as HTMLElement).className).toContain("hidden");
    expect(screen.getByText("Elegir archivo")).toBeInTheDocument();
  });
});
