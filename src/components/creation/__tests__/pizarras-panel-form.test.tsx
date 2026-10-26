import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";

// AppearanceProvider (que envuelve al botón de compartir) usa usePathname.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
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

vi.mock("@/lib/os-social", () => ({
  createPost: vi.fn().mockResolvedValue({ ok: true }),
  fetchMyEntities: vi.fn().mockResolvedValue({ pages: [], groups: [] }),
}));

// Con `globals: false` no hay limpieza automática entre pruebas.
afterEach(() => cleanup());

import { PizarrasPanel } from "../pizarras-panel";
import { listCanvases, type Canvas } from "@/lib/canvas/canvas";

/** Pizarra de nube con la forma completa que hoy devuelve `listCanvases`. */
function pizarra(parcial: Partial<Canvas> = {}): Canvas {
  return {
    id: "c1",
    owner: null,
    scope: "personal",
    scope_ref: null,
    title: "Diagrama del valle",
    blocks: [],
    shared: false,
    ...parcial,
  };
}

describe("PizarrasPanel · compartir como publicación", () => {
  it("abre el diálogo de compartir con su comentario opcional", async () => {
    vi.mocked(listCanvases).mockResolvedValue([
      pizarra({ id: "c1", title: "Diagrama del valle", blocks: [], shared: false }),
    ]);

    // El botón de compartir vive en ui/button, que exige AppearanceProvider.
    render(
      <AppearanceProvider>
        <PizarrasPanel />
      </AppearanceProvider>,
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
});
