import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TunelMetaGenesisEstado } from "../tunel-metagenesis-estado";

const nativoFetch = globalThis.fetch;

describe("TunelMetaGenesisEstado", () => {
  let llamadas: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    llamadas.length = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      llamadas.push({ url, init });
      
      if (url.includes("/api/mando/tunel-metagenesis")) {
        // Simular respuesta del API
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
      
      // Respuesta por defecto para otros endpoints
      return {
        ok: true,
        json: async () => ({})
      } as Response;
    };
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = nativoFetch;
    vi.clearAllMocks();
  });

  it("muestra estado de carga inicialmente", async () => {
    render(<TunelMetaGenesisEstado />);
    expect(screen.getByText(/Cargando estado del túnel/i)).toBeInTheDocument();
  });

  it("muestra túnel activo cuando el servicio está cargado", async () => {
    // Renderizar y esperar a que se haga la primera llamada y se procese el resultado
    render(<TunelMetaGenesisEstado />);
    
    // Esperar a que aparezca el texto del estado activo
    await await screen.findByText(/Túnel de MetaGenesis: activo \(pid \d+\)/i);
    
    // Verificar que las URLs fueron tachadas en las líneas
    expect(await screen.findByText(/Línea 1 \[túnel\]/i)).toBeInTheDocument();
    expect(await screen.findByText(/Línea 2 sin URL/i)).toBeInTheDocument();
    expect(await screen.findByText(/Línea 3 \[túnel\]/i)).toBeInTheDocument();
  });

  it("muestra túnel parado cuando el servicio no está cargado", async () => {
    // Cambiar el mock para devolver servicio no cargado
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      llamadas.push({ url, init });
      
      if (url.includes("/api/mando/tunel-metagenesis")) {
        return {
          ok: true,
          json: async () => ({
            cargado: false,
            pid: null,
            ultimasLineas: [],
            medidoEn: new Date().toISOString()
          })
        } as Response;
      }
      
      return {
        ok: true,
        json: async () => ({})
      } as Response;
    };
    
    render(<TunelMetaGenesisEstado />);
    
    // Esperar a que se haga la primera llamada
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    expect(screen.getByText(/Túnel de MetaGenesis: parado/i)).toBeInTheDocument();
  });

  it("realiza fetch cada 60 segundos cuando el componente está visible", async () => {
    vi.useFakeTimers();
    
    render(<TunelMetaGenesisEstado />);
    
    // Primera llamada inmediata
    await act(async () => {
      await Promise.resolve();
    });
    
    let llamadasIniciales = llamadas.length;
    expect(llamadasIniciales).toBeGreaterThanOrEqual(1);
    
    // Avanzar 30 segundos - debería no haber nuevas llamadas
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    
    let llamadasDespues30s = llamadas.length;
    expect(llamadasDespues30s).toBe(llamadasIniciales);
    
    // Avanzar otros 30 segundos (total 60) - debería haber una nueva llamada
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    
    let llamadasDespues60s = llamadas.length;
    expect(llamadasDespues60s).toBe(llamadasIniciales + 1);
    
    vi.useRealTimers();
  });

  it("no realiza fetch cuando la página no está visible", async () => {
    vi.useFakeTimers();
    
    // Simular que la página está oculta
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true
    });
    
    render(<TunelMetaGenesisEstado />);
    
    // Esperar el efecto inicial
    await act(async () => {
      await Promise.resolve();
    });
    
    let llamadasIniciales = llamadas.length;
    
    // Avanzar 60 segundos
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    
    // Debe seguir teniendo el mismo número de llamadas (no se hizo fetch por estar oculto)
    let llamadasDespuesEspera = llamadas.length;
    expect(llamadasDespuesEspera).toBe(llamadasIniciales);
    
    vi.useRealTimers();
  });

  it("no muestra el encabezado «Últimas líneas» cuando no hay líneas", async () => {
    // Cambiar el mock para devolver servicio cargado pero sin líneas
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      llamadas.push({ url, init });
      
      if (url.includes("/api/mando/tunel-metagenesis")) {
        return {
          ok: true,
          json: async () => ({
            cargado: true,
            pid: 12345,
            ultimasLineas: [], // <-- No hay líneas
            medidoEn: new Date().toISOString()
          })
        } as Response;
      }
      
      return {
        ok: true,
        json: async () => ({})
      } as Response;
    };

    render(<TunelMetaGenesisEstado />);
    
    // Esperar a que se haga la primera llamada y se procese el resultado
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    // Ahora verificar que aparece el estado activo pero NO aparece el encabezado de líneas
    expect(screen.getByText(/Túnel de MetaGenesis: activo \(pid \d+\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Últimas líneas:/i)).not.toBeInTheDocument();
  });
});