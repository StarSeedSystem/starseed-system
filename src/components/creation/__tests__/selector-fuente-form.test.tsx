<<<<<<< HEAD
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import type { SourceRefKind } from "../source-picker";
import { AppearanceProvider } from "@/context/appearance-context";

expect.extend(matchers);

vi.mock("@/lib/files/os-files", () => ({
  uploadFile: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("@/lib/library/entity-library", () => ({
  myLibraryDestinations: vi.fn().mockResolvedValue([]),
  listLibrary: vi.fn().mockResolvedValue({ folders: [], items: [] }),
}));

vi.mock("@/lib/brains/brains", () => ({
  listBrains: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/neurons/neurons", () => ({
  listNeurons: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { SourcePicker } from "../source-picker";

function renderPicker(kinds: SourceRefKind[]) {
  return render(
    <AppearanceProvider>
      <SourcePicker open onPick={() => {}} kinds={kinds} />
    </AppearanceProvider>
  );
}

describe("SourcePicker", () => {
  afterEach(cleanup);

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
    render(
      <AppearanceProvider>
        <SourcePicker open onPick={onPick} kinds={["url"]} />
      </AppearanceProvider>
    );

    const usar = screen.getByRole("button", { name: "Usar enlace" });
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

    // El disparo real es el botón «Elegir archivo»; el input vive oculto.
    const archivo = document.querySelector('input[type="file"]');
    expect(archivo).toBeInstanceOf(HTMLInputElement);
    expect((archivo as HTMLInputElement).type).toBe("file");
    expect((archivo as HTMLElement).className).toContain("hidden");
    expect(screen.getByText("Elegir archivo")).toBeInTheDocument();
  });

  it("las etiquetas URL y Etiqueta quedan ligadas a su input por id", () => {
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

  it("el input de archivo del dispositivo lleva aria-label (sin label visible)", () => {
    renderPicker(["device"]);

    const archivo = screen.getByLabelText("Archivo del dispositivo");
    expect(archivo).toBeInstanceOf(HTMLInputElement);
    expect((archivo as HTMLInputElement).type).toBe("file");
  });
=======
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
>>>>>>> abbc2e2d9 (salvavidas · SP092941c: trabajo del agente antes de las puertas (tsc / vitest))
});
