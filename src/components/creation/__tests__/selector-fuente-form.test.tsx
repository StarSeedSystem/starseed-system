// Pruebas del formulario del selector de fuente (Adenda 66 §5), rescatadas
// de la rama nube/39711481854 y adaptadas a la API de hoy: los paneles de
// URL y de dispositivo se prueban sin red y sin Supabase.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/library/entity-library", () => ({
    myLibraryDestinations: vi.fn(async () => []),
    listLibrary: vi.fn(async () => ({ folders: [], items: [] })),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: vi.fn(async () => []) }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: vi.fn(async () => []) }));
// Button lee el modo del tema; sin proveedor basta un config mínimo.
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "" } } }),
}));

import { SourcePicker } from "../source-picker";

describe("formularios del selector de fuente", () => {
    afterEach(() => cleanup());

    // El picker se maneja controlado (open) y con pestañas acotadas; con el
    // Radix simulado el panel queda montado de una vez, sin portal.
    const renderPicker = (kinds: Array<"device" | "url">) =>
        render(<SourcePicker open onPick={vi.fn()} kinds={kinds} />);

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
        render(<SourcePicker open onPick={onPick} kinds={["url"]} />);

        const usar = screen.getByText("Usar enlace");
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
        // (aria-label de la rama: pendiente, se anota en el informe).
        const archivo = document.querySelector('input[type="file"]');
        expect(archivo).toBeInstanceOf(HTMLInputElement);
        expect((archivo as HTMLInputElement).type).toBe("file");
        expect((archivo as HTMLElement).className).toContain("hidden");
        expect(screen.getByText("Elegir archivo")).toBeInTheDocument();
    });
});
