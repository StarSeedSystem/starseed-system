import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PanelProtomolecula, PanelProtomoleculaAutonomo } from "../panel-protomolecula";
import type { Autor, Molecula, Operacion } from "@/lib/protomolecula/tipos";
import { limpiarRegistro } from "@/lib/protomolecula/registro-atomos";

import { vi } from "vitest";

// Mock the modules we depend on
vi.mock("@/lib/protomolecula/molecula-estado");
vi.mock("@/lib/protomolecula/controlador");
vi.mock("@/lib/protomolecula/registro-atomos");
vi.mock("@/lib/protomolecula/parametros");

describe("PanelProtomolecula", () => {
  const autor: Autor = { tipo: "persona", id: "test-user", nombre: "Test User" };

  const molBase: Molecula = {
    id: "t",
    titulo: "Molécula",
    ambito: "personal",
    capas: [],
    atomos: [],
    valores: {},
    version: 1,
    creadaEn: Date.now(),
    actualizadaEn: Date.now()
  };

  const ctrlBase = {
    obtener: vi.fn().mockReturnValue({ molecula: molBase, historial: { hechos: [], rehacer: [] } }),
    suscribir: vi.fn().mockImplementation((cb) => {
      cb({ molecula: molBase, historial: { hechos: [], rehacer: [] } });
      return { unsubscribe: vi.fn() };
    }),
    mover: vi.fn(),
    dictar: vi.fn().mockResolvedValue([{ ok: true, operacion: { tipo: "exacta", valor: 53 }, resumen: "sube volumen 3dB" }])
  };

  it("muestra título", async () => {
    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByText(/molécula/i)).toBeInTheDocument();
  });

  it("avisa sin herramientas", async () => {
    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByText(/aún no hay herramientas/i)).toBeInTheDocument();
  });

  it("Autonomo crea molécula por defecto", async () => {
    render(<PanelProtomoleculaAutonomo />);
    await waitFor(() => expect(screen.getByText(/mi primera molécula/i)).toBeInTheDocument());
  });

  it("procesa dictado volumen +3dB", async () => {
    // Mock listarAtomos to return a test atom
    const listarAtomosMock = vi.mocked(await import("@/lib/protomolecula/registro-atomos"));
    listarAtomosMock.listarAtomos.mockResolvedValue([
      { 
        id: "v", 
        herramientaId: "vt", 
        nombre: "Vol", 
        categoria: "audio", 
        integracion: "iframe-aislado", 
        control: "ventana", 
        parametros: [{ id: "n", nombre: "Nivel", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "dB", defecto: 50 }] 
      }
    ]);

    const { rerender } = render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    await waitFor(() => expect(screen.getByText(/vol/i)).toBeInTheDocument());
    expect(ctrlBase.dictar).toHaveBeenCalledWith("sube el volumen 3 dB", autor, undefined);
  });

  it("muestra deshacer/rehacer", async () => {
    const hist = [{ operacion: { tipo: "exacta" }, antes: 50, despues: 60, acotado: false, reversible: true }];
    const suscribirMock = vi.mocked(ctrlBase.suscribir);
    suscribirMock.mockImplementation((cb) => {
      cb({ molecula: molBase, historial: { hechos: hist, rehacer: [] } });
      return { unsubscribe: vi.fn() };
    });
    
    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByRole("button", { name: /deshacer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rehacer/i })).toBeInTheDocument();
  });

  it("op agente grupo pendiente", async () => {
    const molG = { ...molBase, ambito: "grupo" };
    const opAg: Operacion = { id: "o1", objetivo: { atomoId: "v", parametroId: "n" }, accion: { tipo: "exacta", valor: 70 }, autor: { tipo: "agente", id: "ag", nombre: "Agente" }, origen: "agente", t: Date.now() };
    const cambio = { operacion: opAg, antes: 50, despues: 70, acotado: false, reversible: true };
    
    const obtenerMock = vi.mocked(ctrlBase.obtener);
    obtenerMock.mockReturnValue({ molecula: molG, historial: { hechos: [cambio], rehacer: [] } });
    const suscribirMock = vi.mocked(ctrlBase.suscribir);
    suscribirMock.mockImplementation((cb) => {
      cb({ molecula: molG, historial: { hechos: [cambio], rehacer: [] } });
      return { unsubscribe: vi.fn() };
    });
    
    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByText(/agente/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeEnabled();
  });

  it("llama limpiarRegistro al desmontar", () => {
    const { unmount } = render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    unmount();
    expect(limpiarRegistro).toHaveBeenCalled();
  });
});