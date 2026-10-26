/**
 * Rescate de la rama nube/40228390243 · la pizarra de nube se abre al compartir
 * como publicación: acción visible por pizarra y diálogo con su comentario
 * opcional antes de publicar.
 */
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { PizarrasPanel } from "../pizarras-panel";
import { listCanvases, type Canvas } from "@/lib/canvas/canvas";
import { AppearanceProvider } from "@/context/appearance-context";
expect.extend(matchers);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/crear",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-toast", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/hooks/use-toast");
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});
vi.mock("@/lib/canvas/canvas", () => ({ listCanvases: vi.fn() }));
vi.mock("@/lib/os-social", () => ({ createPost: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/context/board-context", () => ({
  useBoardSystem: () => ({ boards: [], setActiveBoard: vi.fn() }),
}));
vi.mock("@/context/control-panel-context", () => ({
  useControlPanel: () => ({ isOpen: false, setIsOpen: vi.fn(), setActiveTab: vi.fn() }),
}));

afterEach(() => cleanup());

describe("PizarrasPanel · compartir como publicación (rama rescatada)", () => {
  it("abre el diálogo de compartir con su comentario opcional", async () => {
    vi.mocked(listCanvases).mockResolvedValue([
      {
        id: "c1",
        owner: "cuenta-de-prueba",
        scope: "account",
        scope_ref: null,
        title: "Diagrama del valle",
        blocks: [],
        shared: false,
      },
    ]);

    // El Button local lee useAppearance: envuelto como el resto del repo.
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

// PLACEHOLDER-EXPORT
