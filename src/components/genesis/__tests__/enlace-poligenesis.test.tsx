import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnlacePoliGenesis } from "@/components/genesis/enlace-poligenesis";
import { misEntidades } from "@/lib/genesis/entidades";

vi.mock("@/lib/genesis/entidades");

describe("EnlacePoliGenesis", () => {
  afterEach(() => {
    vi.resetAllMocks();
    cleanup();
  });

  it("renderiza el enlace cuando la entidad tiene rango >= 2", async () => {
    const entidadId = "1";
    const slug = "test-slug";
    vi.mocked(misEntidades).mockResolvedValueOnce({
      ok: true,
      lista: [{ id: entidadId, slug, rango: 3 } as any],
    });

    render(<EnlacePoliGenesis entidadId={entidadId} slug={slug} />);

    const link = await screen.findByText(/Gestionar con PoliGenesis/i);
    const anchor = link.closest("a");
    expect(anchor).toBeInTheDocument();
    expect(anchor).toHaveAttribute("href", `/poligenesis?entidad=${entidadId}`);
  });

  it("no renderiza nada cuando la entidad tiene rango 1", async () => {
    const entidadId = "1";
    const slug = "test-slug";
    vi.mocked(misEntidades).mockResolvedValueOnce({
      ok: true,
      lista: [{ id: entidadId, slug, rango: 1 } as any],
    });

    render(<EnlacePoliGenesis entidadId={entidadId} slug={slug} />);

    await waitFor(() => {
      expect(screen.queryByText(/Gestionar con PoliGenesis/i)).not.toBeInTheDocument();
    });
  });

  it("no renderiza nada cuando la entidad no se encuentra", async () => {
    const entidadId = "1";
    const slug = "test-slug";
    vi.mocked(misEntidades).mockResolvedValueOnce({
      ok: true,
      lista: [],
    });

    render(<EnlacePoliGenesis entidadId={entidadId} slug={slug} />);

    await waitFor(() => {
      expect(screen.queryByText(/Gestionar con PoliGenesis/i)).not.toBeInTheDocument();
    });
  });

  it("no renderiza nada cuando la llamada falla", async () => {
    const entidadId = "1";
    const slug = "test-slug";
    vi.mocked(misEntidades).mockResolvedValueOnce({
      ok: false,
      motivo: "error",
    });

    render(<EnlacePoliGenesis entidadId={entidadId} slug={slug} />);

    await waitFor(() => {
      expect(screen.queryByText(/Gestionar con PoliGenesis/i)).not.toBeInTheDocument();
    });
  });
});
