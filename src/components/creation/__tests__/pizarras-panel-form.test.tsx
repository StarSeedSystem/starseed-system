// @vitest-environment jsdom
/**
 * pizarras-panel-form.test.tsx — accesibilidad del formulario de «Compartir
 * como publicación» de PizarrasPanel (rescate de la rama nube/39711481854,
 * tarea DGM1018Cc). El comentario no tiene label visible, así que debe llevar
 * aria-label. El resto del panel (router, pizarras de nube, toasts) va
 * mockeado: la prueba solo mira el nombre accesible del textarea.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Canvas } from "@/lib/canvas/canvas";
import { AppearanceProvider } from "@/context/appearance-context";

const pushMock = vi.fn();
const toastMock = vi.fn();
const setActiveBoardMock = vi.fn();
const setActiveTabMock = vi.fn();
const setIsOpenMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/crear",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/context/board-context", () => ({
  useBoardSystem: () => ({ boards: [], setActiveBoard: setActiveBoardMock }),
}));
vi.mock("@/context/control-panel-context", () => ({
  useControlPanel: () => ({ setActiveTab: setActiveTabMock, setIsOpen: setIsOpenMock }),
}));

vi.mock("@/lib/os-social", () => ({
  createPost: vi.fn(async () => ({ ok: true })),
  fetchMyEntities: vi.fn(async () => []),
}));

// Pizarra de nube que la tarjeta del panel lista antes de abrir el diálogo.
const nube = vi.hoisted(() => ({
  id: "c-nube",
  owner: "uid-1",
  scope: "account",
  scope_ref: null,
  title: "Pizarra de la nube",
  blocks: [],
  shared: false,
}));

vi.mock("@/lib/canvas/canvas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/canvas/canvas")>("@/lib/canvas/canvas");
  return { ...actual, listCanvases: vi.fn(async () => [nube as Canvas]) };
});

import { PizarrasPanel } from "../pizarras-panel";

async function renderConPizarraNube() {
  // El AppearanceProvider lo pide el propio Button shadcn del repo (ver
  // malla-neuronas-panel-vinculos.test.tsx).
  render(
    <AppearanceProvider>
      <PizarrasPanel />
    </AppearanceProvider>,
  );
  await screen.findByText("Pizarra de la nube");
}

beforeEach(() => {
  pushMock.mockClear();
  toastMock.mockClear();
  setActiveBoardMock.mockClear();
  setActiveTabMock.mockClear();
  setIsOpenMock.mockClear();
});
afterEach(() => cleanup());

describe("PizarrasPanel · formulario de compartir", () => {
  test("el textarea de comentario lleva aria-label (sin label visible)", async () => {
    await renderConPizarraNube();

    fireEvent.click(screen.getByText("Compartir como publicación"));

    const comentario = await screen.findByLabelText("Comentario de la publicación (opcional)");
    expect(comentario).toBeInstanceOf(HTMLTextAreaElement);
  });
});
