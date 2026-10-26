import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { SourcePicker, type SourceRefKind } from "../source-picker";

// Con `globals: false` no hay limpieza automática entre pruebas: sin ella,
// cada diálogo quedaría pegado al body y «Usar enlace» aparecería duplicado.
afterEach(() => cleanup());

vi.mock("@/lib/files/os-files", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("@/lib/library/entity-library", () => ({
  myLibraryDestinations: vi.fn().mockResolvedValue([]),
  listLibrary: vi.fn(),
}));

vi.mock("@/lib/brains/brains", () => ({
  listBrains: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/neurons/neurons", () => ({
  listNeurons: vi.fn().mockResolvedValue([]),
}));

/** Pinta el picker con su AppearanceProvider y devuelve el `onPick` espía. */
function renderPicker(kinds: SourceRefKind[], onPick = vi.fn()) {
  render(
    <AppearanceProvider>
      <SourcePicker open onPick={onPick} kinds={kinds} />
    </AppearanceProvider>
  );
  return onPick;
}

describe("SourcePicker · panel de URL", () => {
  it("el panel de URL acompaña a cada input con su etiqueta y su input de texto", () => {
    renderPicker(["url"]);

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
    renderPicker(["url"], onPick);

    // getByText devolvería el span interior; el estado disabled vive en el button.
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

  it("el input de archivo del dispositivo es type file y permanece oculto", () => {
    renderPicker(["device"]);

    // El disparo real es el botón «Elegir archivo»; el input vive oculto
    // (se usa el mismo componente de siempre, no una carpeta nueva).
    const archivo = document.querySelector('input[type="file"]');
    expect(archivo).toBeInstanceOf(HTMLInputElement);
    expect((archivo as HTMLInputElement).type).toBe("file");
    expect((archivo as HTMLElement).className).toContain("hidden");
    expect(screen.getByText("Elegir archivo")).toBeInTheDocument();
  });
});
