import { render, screen, waitFor } from "@testing-library/react";
import { TunelMetagenesisEstado } from "../tunel-metagenesis-estado";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Set global expect for jest-dom
global.expect = expect;

// Import jest-dom after expect is available
import '@testing-library/jest-dom';

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    json: vi.fn().mockResolvedValue({}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TunelMetagenesisEstado", () => {
  it("shows loading state initially", () => {
    render(<TunelMetagenesisEstado />);
    const element = screen.queryByText(/cargando estado del túnel de metagenesis/i);
    expect(element).not.toBeNull();
  });

  it("displays active state when tunnel is running", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cargado: true,
        pid: 12345,
        ultimasLineas: ["Linea 1", "Linea 2"],
        medidoEn: new Date().toISOString(),
      }),
    });

    render(<TunelMetagenesisEstado />);
    expect(screen.getByText(/cargando estado del túnel de metagenesis/i)).toBeInTheDocument();

    // Wait for the data to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText(/túnel de metagenesis: activo \(pid 12345\)/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/últimas líneas:/i)).toBeInTheDocument();
    expect(screen.getByText("Linea 1")).toBeInTheDocument();
    expect(screen.getByText("Linea 2")).toBeInTheDocument();
  });

  it("displays stopped state when tunnel is not running", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cargado: false,
        pid: null,
        ultimasLineas: [],
        medidoEn: new Date().toISOString(),
      }),
    });

    render(<TunelMetagenesisEstado />);
    expect(screen.getByText(/cargando estado del túnel de metagenesis/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/túnel de metagenesis: parado/i)).toBeInTheDocument();
    });

    // Should not show the últimas líneas section
    expect(screen.queryByText(/últimas líneas:/i)).not.toBeInTheDocument();
  });

  it("tachar trycloudflare URLs in the client", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cargado: true,
        pid: 12345,
        ultimasLineas: [
          "Visita https://mi-tunel.trycloudflare.com",
          "Otro https://otro.trycloudflare.com/path",
          "Sin cambio: https://example.com",
        ],
        medidoEn: new Date().toISOString(),
      }),
    });

    render(<TunelMetagenesisEstado />);
    await waitFor(() => {
      expect(screen.getByText(/túnel de metagenesis: activo \(pid 12345\)/i)).toBeInTheDocument();
    });

    // The lines should have been tachared
    expect(screen.getByText("Visita [túnel]")).toBeInTheDocument();
    expect(screen.getByText("Otro [túnel]/path")).toBeInTheDocument();
    expect(screen.getByText("Sin cambio: https://example.com")).toBeInTheDocument();
  });
});