<<<<<<< HEAD
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import * as canvas from "@/lib/canvas/canvas";
import { AppearanceProvider } from "@/context/appearance-context";

expect.extend(matchers);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/crear",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/os-social", () => ({
  createPost: vi.fn().mockResolvedValue({ ok: true }),
  fetchMyEntities: vi.fn().mockResolvedValue({ pages: [], groups: [] }),
}));

vi.mock("@/lib/canvas/canvas", () => ({
  listCanvases: vi.fn().mockResolvedValue([]),
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

import { PizarrasPanel } from "../pizarras-panel";

describe("PizarrasPanel", () => {
  afterEach(cleanup);

  it("abre el diálogo de compartir con su comentario opcional", async () => {
    vi.mocked(canvas.listCanvases).mockResolvedValue([
      {
        id: "c1",
        owner: null,
        scope: "account",
        scope_ref: null,
        title: "Diagrama del valle",
        blocks: [],
        shared: false,
      },
    ]);

    render(
      <AppearanceProvider>
        <PizarrasPanel />
      </AppearanceProvider>
    );

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

  it("el textarea de comentario lleva aria-label (sin label visible)", async () => {
    vi.mocked(canvas.listCanvases).mockResolvedValue([
      {
        id: "c1",
        owner: null,
        scope: "account",
        scope_ref: null,
        title: "Diagrama del valle",
        blocks: [],
        shared: false,
      },
    ]);

    render(
      <AppearanceProvider>
        <PizarrasPanel />
      </AppearanceProvider>
    );

    await screen.findByText("Diagrama del valle");
    fireEvent.click(await screen.findByText("Compartir como publicación"));

    const comentario = await screen.findByLabelText("Comentario de la publicación (opcional)");
    expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
  });
=======
// @vitest-environment jsdom
/**
 * pizarras-panel-form.test.tsx — accesibilidad del diálogo de compartir
 * (SP092941b). El textarea de comentario no tiene label visible, así que debe
 * llevar aria-label «Comentario de la publicación (opcional)» para que los
 * lectores de pantalla anuncicen su propósito.
 */
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
}));
vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({ boards: [], setActiveBoard: vi.fn() }),
}));
vi.mock("@/context/control-panel-context", () => ({
    useControlPanel: () => ({ setActiveTab: vi.fn(), setIsOpen: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/os-social", () => ({ createPost: vi.fn(async () => ({})) }));
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

async function renderConPizarraNube() {
    render(
        <AppearanceProvider>
            <PizarrasPanel />
        </AppearanceProvider>,
    );
    await screen.findByText("Origen de la bigorna");
}

describe("PizarrasPanel · diálogo de compartir", () => {
    test("el textarea de comentario lleva aria-label (sin label visible)", async () => {
        await renderConPizarraNube();

        fireEvent.click(screen.getByText("Compartir como publicación"));

        const comentario = await screen.findByLabelText("Comentario de la publicación (opcional)");
        expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
    });
>>>>>>> abbc2e2d9 (salvavidas · SP092941c: trabajo del agente antes de las puertas (tsc / vitest))
});
