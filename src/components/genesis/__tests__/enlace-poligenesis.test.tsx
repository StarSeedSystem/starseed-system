import { describe, it, expect, vi } from "vitest";
import { render, screen, findByTestId, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { EnlacePoliGenesis } from "../enlace-poligenesis";

describe("EnlacePoliGenesis", () => {
  it("shows the link when the entity has rango >= 2", async () => {
    vi.mock("../../../lib/genesis/entidades", () => ({
      misEntidades: vi.fn().mockResolvedValueOnce({
        ok: true,
        lista: [
          { id: "1", slug: "test-group", nombre: "Test Group", rango: 3, rol: "gestión", dueña: false },
        ],
      }),
    }));

    render(<EnlacePoliGenesis entidadId="1" slug="test-group" />);

    // Wait for the promise to resolve
    await expect(findByTestId("poligenesis-link")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /gestionar con poli genesi/i });
    expect(link).toHaveAttribute("href", "/poligenesis?entidad=1");
  });

  it("does not show anything when the entity has rango < 2", async () => {
    vi.mock("../../../lib/genesis/entidades", () => ({
      misEntidades: vi.fn().mockResolvedValueOnce({
        ok: true,
        lista: [
          { id: "1", slug: "test-group", nombre: "Test Group", rango: 1, rol: "colaboración", dueña: false },
        ],
      }),
    }));

    render(<EnlacePoliGenesis entidadId="1" slug="test-group" />);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /gestionar con poli genesi/i })).not.toBeInTheDocument();
    });
  });

  it("does not show anything when the entity is not found", async () => {
    vi.mock("../../../lib/genesis/entidades", () => ({
      misEntidades: vi.fn().mockResolvedValueOnce({
        ok: true,
        lista: [],
      }),
    }));

    render(<EnlacePoliGenesis entidadId="1" slug="test-group" />);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /gestionar con poli genesi/i })).not.toBeInTheDocument();
    });
  });

  it("does not show anything when misEntidades returns ok false", async () => {
    vi.mock("../../../lib/genesis/entidades", () => ({
      misEntidades: vi.fn().mockResolvedValueOnce({
        ok: false,
        motivo: "Inicia sesión para ver tus grupos y páginas.",
      }),
    }));

    render(<EnlacePoliGenesis entidadId="1" slug="test-group" />);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /gestionar con poli genesi/i })).not.toBeInTheDocument();
    });
  });
});