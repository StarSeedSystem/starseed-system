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
    fireEvent.click(screen.getByText("Compartir como publicación"));

    const comentario = await screen.findByLabelText(
      "Comentario de la publicación (opcional)",
    );
    expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
  });
});
