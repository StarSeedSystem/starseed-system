// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Canvas } from "@/lib/canvas/canvas";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/lib/canvas/canvas", () => ({
    listCanvases: vi.fn(async () => [unaPizarra()]),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/crear",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({ boards: [], setActiveBoard: vi.fn() }),
}));

vi.mock("@/context/control-panel-context", () => ({
    useControlPanel: () => ({ setActiveTab: vi.fn(), setIsOpen: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/os-social", () => ({
    createPost: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/components/creation/creation-fields", () => ({
    DestSelector: () => null,
}));

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

async function renderConPizarraNube() {
    render(
        <AppearanceProvider>
            <PizarrasPanel />
        </AppearanceProvider>,
    );
    await screen.findByText("Origen de la bigorna");
}

describe("PizarrasPanel · diálogo de compartir — accesibilidad", () => {
    test("el textarea de comentario lleva label asociado (htmlFor + aria-label)", async () => {
        await renderConPizarraNube();
        fireEvent.click(screen.getByText("Compartir como publicación"));

        const comentario = await screen.findByLabelText("Comentario de la publicación (opcional)");
        expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
        expect(comentario).toHaveAttribute("id", "share-note");
    });

    test("el selector de destino lleva label asociado visible", async () => {
        await renderConPizarraNube();
        fireEvent.click(screen.getByText("Compartir como publicación"));

        expect(screen.getByText("Publicar en")).toBeInTheDocument();
        const contenedor = document.getElementById("share-dest");
        expect(contenedor).toBeInTheDocument();
    });
});
