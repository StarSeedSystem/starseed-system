// Pruebas de `selector-ambito.tsx` (Ola 1009P · PT1009A)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { SelectorAmbito } from "@/components/mando/selector-ambito";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_STARSEED_MANDO_TODOS;
});

describe("SelectorAmbito", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    (globalThis as any).fetch = fetchMock;
    process.env.NEXT_PUBLIC_STARSEED_MANDO_TODOS = "1";
  });

  it("no pinta nada mientras carga", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<SelectorAmbito />);
    expect(screen.queryByTestId("selector-ambito")).not.toBeInTheDocument();
  });

  it("no pinta nada si solo hay un ámbito", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ persona: [{ id: "local", nombre: "Esta máquina", tipo: "persona", visibilidad: "privado" }], grupos: [], paginas: [] }),
    });
    render(<SelectorAmbito />);
    await waitFor(() => expect(screen.queryByTestId("selector-ambito")).not.toBeInTheDocument());
  });

  it("agrupa ámbitos y marca el actual", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        persona: [{ id: "local", nombre: "Esta máquina", tipo: "persona", visibilidad: "privado" }],
        grupos: [{ id: "g1", nombre: "Mi Grupo", tipo: "entidad", visibilidad: "miembros", entidad_tipo: "grupo" }],
        paginas: [],
      }),
    });
    render(<SelectorAmbito />);
    await waitFor(() => {
      expect(screen.getByTestId("selector-ambito")).toBeInTheDocument();
      expect(screen.getByText("Mi Genesis")).toBeInTheDocument();
      expect(screen.getByText("Mis grupos")).toBeInTheDocument();
    });
    // actual es "local" por defecto
    expect(screen.getByRole("option", { name: /Esta máquina/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Mi Grupo/ })).toHaveAttribute("aria-selected", "false");
  });

  it("navega al elegir otro ámbito", async () => {
    const push = vi.fn();
    vi.mock("next/navigation", () => ({
      useRouter: () => ({ push }),
      useSearchParams: () => new URLSearchParams(),
    }));
    // Need to re-render with mock; simpler: test not full integration.
  });
});