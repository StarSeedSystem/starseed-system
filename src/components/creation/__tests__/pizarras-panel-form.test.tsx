// Pruebas del formulario de compartir pizarra, adaptadas de la rama
// nube/39711481854 a la API de hoy: al pulsar «Compartir como publicación»
// se abre el comentario de la publicación.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nube = vi.hoisted(() => [
    {
        id: "canvas-1",
        owner: "persona-1",
        scope: "user",
        scope_ref: null,
        title: "Pizarra de prueba",
        blocks: [],
        shared: false,
    },
]);

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({ boards: [], setActiveBoard: vi.fn() }),
}));
vi.mock("@/context/control-panel-context", () => ({
    useControlPanel: () => ({ setActiveTab: vi.fn(), setIsOpen: vi.fn() }),
}));
vi.mock("@/lib/canvas/canvas", () => ({ listCanvases: async () => nube }));
vi.mock("@/lib/os-social", () => ({
    createPost: vi.fn(async () => ({ ok: true })),
    fetchMyEntities: async () => ({ pages: [], groups: [] }),
}));

import { PizarrasPanel } from "../pizarras-panel";

afterEach(() => cleanup());

describe("PizarrasPanel · compartir", () => {
    it("al compartir una pizarra de la nube aparece el comentario de la publicación", async () => {
        render(<PizarrasPanel />);

        const compartir = await screen.findByText("Compartir como publicación");
        fireEvent.click(compartir);

        const comentario = await screen.findByPlaceholderText("Añade un comentario (opcional)…");
        expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
    });
});
