import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { TunelMetagenesisEstado } from "../tunel-metagenesis-estado";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import '@testing-library/jest-dom/vitest';

// Mock fetch
const fetchMock = vi.fn();
beforeEach(() => {
  (globalThis as any).fetch = fetchMock;
  // Default implementation that returns a successful response with empty data
  fetchMock.mockImplementation(() => Promise.resolve({
    ok: true,
    json: async () => ({
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
    }),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TunelMetagenesisEstado", () => {
  it("shows loading state initially", () => {
    render(<TunelMetagenesisEstado />);
    const element = screen.queryByText(/cargando estado del túnel de metagenesis/i);
    expect(element).not.toBeNull();
  });

it("displays active state when tunnel is running", async () => {
  const data = {
    cargado: true,
    pid: 12345,
    ultimasLineas: ["Linea 1", "Linea 2"],
    medidoEn: new Date().toISOString(),
  };
  // Override the default mock implementation for this specific call
  fetchMock.mockImplementationOnce(() => Promise.resolve({
    ok: true,
    json: () => data, // Synchronous function returning data directly
  }));

  render(<TunelMetagenesisEstado />);
  expect(screen.getByText(/cargando estado del túnel de metagenesis/i)).toBeInTheDocument();

  // Wait for the data to be fetched and displayed
  await waitFor(() => {
    expect(screen.getByText(/túnel de metagenesis: activo \(pid 12345\)/i)).toBeInTheDocument();
    expect(screen.getByText(/últimas líneas:/i)).toBeInTheDocument();
    expect(screen.getByText("Linea 1")).toBeInTheDocument();
    expect(screen.getByText("Linea 2")).toBeInTheDocument();
  });
  });
});

it("displays stopped state when tunnel is not running", async () => {
  const data = {
    cargado: false,
    pid: null,
    ultimasLineas: [],
    medidoEn: new Date().toISOString(),
  };
  // Override the default mock implementation for this specific call
  fetchMock.mockImplementationOnce(() => Promise.resolve({
    ok: true,
    json: () => data, // Synchronous function returning data directly
  }));

  render(<TunelMetagenesisEstado />);
  expect(screen.getByText(/cargando estado del túnel de metagenesis/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText(/túnel de metagenesis: parado/i)).toBeInTheDocument();
  });

  // Should not show the últimas líneas section
  expect(screen.queryByText(/últimas líneas:/i)).not.toBeInTheDocument();
});

it("tachar trycloudflare URLs in the client", async () => {
  const data = {
    cargado: true,
    pid: 12345,
    ultimasLineas: [
      "Visita https://mi-tunel.trycloudflare.com",
      "Otro https://otro.trycloudflare.com/path",
      "Sin cambio: https://example.com",
    ],
    medidoEn: new Date().toISOString(),
  };
  // Override the default mock implementation for this specific call
  fetchMock.mockImplementationOnce(() => Promise.resolve({
    ok: true,
    json: () => data, // Synchronous function returning data directly
  }));

  render(<TunelMetagenesisEstado />);
  await waitFor(() => {
    expect(screen.getByText(/túnel de metagenesis: activo \(pid 12345\)/i)).toBeInTheDocument();
    expect(screen.getByText("Visita [túnel]")).toBeInTheDocument();
    expect(screen.getByText("Otro [túnel]/path")).toBeInTheDocument();
    expect(screen.getByText("Sin cambio: https://example.com")).toBeInTheDocument();
  });
});