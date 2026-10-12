import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeAll, Mock } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock the entire module
vi.mock("@/lib/genesis/entidades");

import * as entMod from "@/lib/genesis/entidades";

describe("EnlacePoliGenesis", () => {
  afterEach(function () {
    cleanup();
    vi.resetAllMocks();
  });

  it("renders link when entity with rango >= 2 matches by id", async () => {
    console.log(`[TEST] initial mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
    (entMod.misEntidades as Mock).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: "ent1", slug: "slug1", rango: 3 },
        { id: "ent2", slug: "slug2", rango: 1 },
      ],
    });

    const { EnlacePoliGenesis } = await import("../enlace-poligenesis");
    render(<EnlacePoliGenesis entidadId="ent1" slug="slug1" />);

    await vi.waitFor(() => {
      const link = screen.getByRole("link", { name: /gestionar con poligenesis/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/poligenesis?entidad=ent1");
    });

    console.log(`[TEST] final mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
  });

  it("renders link when entity with rango >= 2 matches by slug", async () => {
    console.log(`[TEST] initial mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
    (entMod.misEntidades as Mock).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: "ent1", slug: "slug-a", rango: 2 },
        { id: "ent2", slug: "slug-b", rango: 1 },
      ],
    });

    const { EnlacePoliGenesis } = await import("../enlace-poligenesis");
    render(<EnlacePoliGenesis entidadId="ent1" slug="slug-b" />);

    await vi.waitFor(() => {
      const link = screen.getByRole("link", { name: /gestionar con poligenesis/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/poligenesis?entidad=ent1");
    });

    console.log(`[TEST] final mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
  });

  it("renders nothing when entity rango < 2", async () => {
    console.log(`[TEST] initial mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
    (entMod.misEntidades as Mock).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: "ent1", slug: "slug1", rango: 1 },
        { id: "ent2", slug: "slug2", rango: 0 },
      ],
    });

    const { EnlacePoliGenesis } = await import("../enlace-poligenesis");
    render(<EnlacePoliGenesis entidadId="ent1" slug="slug1" />);

    await vi.waitFor(() => {
      expect(screen.queryByRole("link", { name: /gestionar con poligenesis/i })).not.toBeInTheDocument();
    });

    console.log(`[TEST] final mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
  });

  it("renders nothing when entity not found", async () => {
    console.log(`[TEST] initial mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
    (entMod.misEntidades as Mock).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: "ent1", slug: "slug1", rango: 3 },
      ],
    });

    const { EnlacePoliGenesis } = await import("../enlace-poligenesis");
    render(<EnlacePoliGenesis entidadId="ent999" slug="slug-999" />);

    await vi.waitFor(() => {
      expect(screen.queryByRole("link", { name: /gestionar con poligenesis/i })).not.toBeInTheDocument();
    });

    console.log(`[TEST] final mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
  });

  it("renders nothing when misEntidades returns ok false", async () => {
    console.log(`[TEST] initial mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
    (entMod.misEntidades as Mock).mockResolvedValueOnce({
      ok: false,
      motivo: "error",
    });

    const { EnlacePoliGenesis } = await import("../enlace-poligenesis");
    render(<EnlacePoliGenesis entidadId="ent1" slug="slug1" />);

    await vi.waitFor(() => {
      expect(screen.queryByRole("link", { name: /gestionar con poligenesis/i })).not.toBeInTheDocument();
    });

    console.log(`[TEST] final mock call count: ${(entMod.misEntidades as Mock).mock.calls.length}`);
  });
});