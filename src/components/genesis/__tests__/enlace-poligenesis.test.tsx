import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { misEntidades } from "@/lib/genesis/entidades";
import { EnlacePoliGenesis } from "../enlace-poligenesis";

vi.mock("@/lib/genesis/entidades");

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("EnlacePoliGenesis", () => {
  it("renders the link when entity is found by id with rango >= 2", async () => {
    (misEntidades as mock).mockResolvedValueOnce({
      ok: true,
      lista: [{ id: "1", slug: "group1", rango: 2 }],
    });

    render(<EnlacePoliGenesis entidadId="1" slug="group1" />);

    const link = await screen.findByRole("link", { name: /gestionar con poligenesis/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/poligenesis?entidad=1");
  });

  it("renders the link when entity is found by slug with rango >= 2", async () => {
    (misEntidades as mock).mockResolvedValueOnce({
      ok: true,
      lista: [{ id: "1", slug: "group1", rango: 2 }],
    });

    render(<EnlacePoliGenesis entidadId="undefined" slug="group1" />);

    const link = await screen.findByRole("link", { name: /gestionar con poligenesis/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/poligenesis?entidad=1");
  });

  it("does not render when entity is found but rango < 2", async () => {
    (misEntidades as mock).mockResolvedValueOnce({
      ok: true,
      lista: [{ id: "1", slug: "group1", rango: 1 }],
    });

    render(<EnlacePoliGenesis entidadId="1" slug="group1" />);
    await Promise.resolve(); // flush promise resolutions

    expect(screen.queryAllByRole("link", { name: /gestionar con poligenesis/i })).toHaveLength(0);
  });

  it("does not render when entity is not found", async () => {
    (misEntidades as mock).mockResolvedValueOnce({
      ok: true,
      lista: [{ id: "2", slug: "group2", rango: 2 }],
    });

    render(<EnlacePoliGenesis entidadId="1" slug="group1" />);
    await Promise.resolve(); // flush promise resolutions

    expect(screen.queryAllByRole("link", { name: /gestionar con poligenesis/i })).toHaveLength(0);
  });

  it("does not render when misEntidades returns ok false", async () => {
    (misEntidades as mock).mockResolvedValueOnce({
      ok: false,
      motivo: "error",
    });

    render(<EnlacePoliGenesis entidadId="1" slug="group1" />);
    await Promise.resolve(); // flush promise resolutions

    expect(screen.queryAllByRole("link", { name: /gestionar con poligenesis/i })).toHaveLength(0);
  });

  it("does not render while loading", () => {
    (misEntidades as mock).mockImplementation(() => new Promise(() => {})); // never resolves

    render(<EnlacePoliGenesis entidadId="1" slug="group1" />);

    expect(screen.queryAllByRole("link", { name: /gestionar con poligenesis/i })).toHaveLength(0);
  });
});