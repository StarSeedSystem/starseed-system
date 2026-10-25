// Pruebas del formulario de compartir pizarra como publicación, rescatadas
// de la rama nube/39711481854 y adaptadas a la API de hoy: el diálogo
// ShareCanvasDialog se abre desde una pizarra de nube, sin red ni Supabase.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/canvas/canvas", () => ({ listCanvases: vi.fn() }));
vi.mock("@/lib/os-social", () => ({ createPost: vi.fn() }));
vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({ boards: [], setActiveBoard: vi.fn() }),
}));
vi.mock("@/context/control-panel-context", () => ({
    useControlPanel: () => ({ setActiveTab: vi.fn(), setIsOpen: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Button lee el modo del tema; sin proveedor basta un config mínimo.
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "" } } }),
}));

import { PizarrasPanel } from "../pizarras-panel";
import { listCanvases } from "@/lib/canvas/canvas";

describe("compartir pizarra como publicación", () => {
    afterEach(() => cleanup());

    it("abre el diálogo de compartir con su comentario opcional", async () => {
        (listCanvases as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: "c1", title: "Diagrama del valle", blocks: [], shared: false },
        ]);

        render(<PizarrasPanel />);

        // La pizarra de nube aparece con su acción de compartir.
        expect(await screen.findByText("Diagrama del valle")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Compartir como publicación"));

        // El diálogo ofrece el comentario opcional y la publicación.
        const comentario = await screen.findByPlaceholderText(
            "Añade un comentario (opcional)…",
        );
        expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
        expect(screen.getByText("Publicar")).toBeInTheDocument();
    });
});
