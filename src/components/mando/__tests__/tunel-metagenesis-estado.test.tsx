import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TunelMetaGenesisEstado } from "../tunel-metagenesis-estado";

const nativeFetch = globalThis.fetch;

describe("TunelMetaGenesisEstado", () => {
  let calls: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/mando/tunel-metagenesis")) {
        return {
          ok: true,
          json: async () => ({
            cargado: true,
            pid: 12345,
            ultimasLineas: [
              "Línea 1 https://ejemplo.trycloudflare.com",
              "Línea 2 sin URL",
              "Línea 3 https://otro.trycloudflare.com/path"
            ],
            medidoEn: new Date().toISOString()
          })
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    };
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = nativeFetch;
    vi.clearAllMocks();
  });

  it("muestra estado de carga inicialmente", () => {
    render(<TunelMetaGenesisEstado />);
    expect(screen.getByText(/Cargando estado del túnel/i)).toBeInTheDocument();
  });

  it("muestra túnel activo cuando el servicio está cargado", async () => {
    render(<TunelMetaGenesisEstado />);
    await screen.findByText(/Túnel de MetaGenesis: activo \(pid \d+\)/i);
    expect(await screen.findByText(/Línea 1 \[túnel\]/i)).toBeInTheDocument();
    expect(await screen.findByText(/Línea 2 sin URL/i)).toBeInTheDocument();
    expect(await screen.findByText(/Línea 3 \[túnel\]/i)).toBeInTheDocument();
  });

  it("muestra túnel parado cuando el servicio no está cargado", async () => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/mando/tunel-metagenesis")) {
        return {
          ok: true,
          json: async () => ({ cargado: false, pid: null, ultimasLineas: [], medidoEn: new Date().toISOString() })
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    };
    render(<TunelMetaGenesisEstado />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(screen.getByText(/Túnel de MetaGenesis: parado/i)).toBeInTheDocument();
  });

  it("realiza fetch cada 60 segundos cuando el componente está visible", async () => {
    vi.useFakeTimers();
    render(<TunelMetaGenesisEstado />);
    await act(async () => {
      await Promise.resolve();
    });
    const initial = calls.length;
    expect(initial).toBeGreaterThanOrEqual(1);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(calls.length).toBe(initial);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(calls.length).toBe(initial + 1);
    vi.useRealTimers();
  });

  it("no realiza fetch cuando la página no está visible", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true
    });
    render(<TunelMetaGenesisEstado />);
    await act(async () => {
      await Promise.resolve();
    });
    const initial = calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(calls.length).toBe(initial);
    vi.useRealTimers();
  });

  it("cancela URLs trycloudflare en una línea", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/mando/tunel-metagenesis")) {
        return {
          ok: true,
          json: async () => ({ cargado: true, pid: 54321, ultimasLineas: ["Línea 4 https://a.trycloudflare.com y https://b.trycloudflare.com"], medidoEn: new Date().toISOString() })
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    };
    render(<TunelMetaGenesisEstado />);
    expect(await screen.findByText(/Línea 4 \[túnel\]/i)).toBeInTheDocument();
    expect(await screen.findByText(/y \[túnel\]/i)).toBeInTheDocument();
    globalThis.fetch = originalFetch;
  });
});
