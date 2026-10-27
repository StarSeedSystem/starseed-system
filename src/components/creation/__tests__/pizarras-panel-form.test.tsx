// @vitest-environment jsdom
/**
 * pizarras-panel-form.test.tsx — el diálogo de compartir de PizarrasPanel
 * (SP092941d, sugiere SA092938). El textarea de comentario no tiene label
 * visible, así que lleva aria-label «Comentario de la publicación (opcional)»
 * para que los lectores de pantalla anuncien su propósito.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Canvas } from "@/lib/canvas/canvas";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/lib/canvas/canvas", () => ({
    listCanvases: vi.fn(async () => [unaPizarra()]),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/crear",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/os-social", () => ({
    createPost: vi.fn(async () => ({ ok: true })),
    fetchMyEntities: vi.fn(async () => ({ pages: [], groups: [] })),
}));
vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({ boards: [], setActiveBoard: vi.fn() }),
}));
vi.mock("@/context/control-panel-context", () => ({
    useControlPanel: () => ({ setActiveTab: vi.fn(), setIsOpen: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/creation/creation-fields", () => ({ DestSelector: () => null }));
vi.mock("@/components/creation/creation-config", () => ({
    buildSsMetaComment: vi.fn(() => "ss-meta"),
    destToEntity: vi.fn(() => ({ entityType: "persona", entitySlug: "yo" })),
    CREATION_DEST_BY_ID: {},
}));

function unaPizarra(): Canvas {
    return {
        id: "p-1",
        owner: "uid-1",
        scope: "persona",
        scope_ref: "yo",
        title: "Origen de la bigorna",
        blocks: [],
        shared: false,
    };
}

import { PizarrasPanel } from "@/components/creation/pizarras-panel";

afterEach(() => cleanup());

describe("PizarrasPanel · diálogo de compartir", () => {
    it("abre el diálogo de compartir con su comentario opcional", async () => {
        render(
            <AppearanceProvider>
                <PizarrasPanel />
            </AppearanceProvider>,
        );

        // La pizarra de nube aparece con su acción de compartir.
        expect(await screen.findByText("Origen de la bigorna")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Compartir como publicación"));

        // El diálogo ofrece el comentario opcional y la publicación.
        const comentario = await screen.findByPlaceholderText(
            "Añade un comentario (opcional)…",
        );
        expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
        expect(screen.getByText("Publicar")).toBeInTheDocument();
    });

    test("el textarea de comentario lleva aria-label (sin label visible)", async () => {
        render(
            <AppearanceProvider>
                <PizarrasPanel />
            </AppearanceProvider>,
        );
        await screen.findByText("Origen de la bigorna");

        fireEvent.click(screen.getByText("Compartir como publicación"));

        const comentario = await screen.findByLabelText(
            "Comentario de la publicación (opcional)",
        );
        expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
    });
});
