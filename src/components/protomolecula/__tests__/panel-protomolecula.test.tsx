import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PanelProtomolecula, PanelProtomoleculaAutonomo } from "../panel-protomolecula";
import type { Autor, Molecula, Operacion } from "@/lib/protomolecula/tipos";
import { limpiarRegistro } from "@/lib/protomolecula/registro-atomos";

jest.mock("@/lib/protomolecula/almacen-moleculas");
jest.mock("@/lib/protomolecula/controlador");
jest.mock("@/lib/protomolecula/registro-atomos");
jest.mock("@/lib/protomolecula/parametros");

const mC = jest.fn();
const mL = jest.fn();
const mG = jest.fn();
const mS = jest.fn();
const mR = jest.fn();
const mCC = jest.fn();
const mLA = jest.fn();
const mD = jest.fn();
const mLR = jest.fn();

const autor: Autor = { tipo: "persona", id: "test-user", nombre: "Test User" };

// Molécula base del núcleo (con capas y atomos vacíos, lo cual es válido)
const molBase: Molecula = {
  id: "t",
  titulo: "Molécula",
  ambito: "personal", // Ambito del núcleo incluye "personal"
  capas: [],
  atomos: [],
  valores: {},
  version: 1,
  creadaEn: Date.now(),
  actualizadaEn: Date.now(),
};

const ctrlBase = {
  obtener: jest.fn().mockReturnValue(molBase),
  suscribir: jest.fn().mockImpl((cb) => { cb({ ...molBase }); return { unsubscribe: jest.fn() }; }),
  mover: jest.fn(),
  dictar: jest.fn()
};

describe("PanelProtomolecula", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require("@/lib/protomolecula/almacen-moleculas").crearMolecula as jest.Mock).mockImpl(mC).mockResolvedValue(molBase);
    (require("/home/runner/work/_temp/starseed-wt/PM1010F0Gd/src/lib/protomolecula/almacen-moleculas").listarMoleculas as jest.Mock).mockImpl(mL).mockResolvedValue([molBase]);
    (require("@/lib/protomolecula/almacen-moleculas").cargarMolecula as jest.Mock).mockImpl(mG).mockResolvedValue(molBase);
    (require("@/lib/protomolecula/almacen-moleculas").guardarMolecula as jest.Mock).mockImpl(mS).mockResolvedValue(undefined);
    (require("@/lib/protomolecula/almacen-moleculas").registrarControlador as jest.Mock).mockImpl(mR).mockResolvedValue(undefined);
    (require("@/lib/protomolecula/controlador").crearControlador as jest.Mock).mockImpl(mCC).mockReturnValue(ctrlBase);
    (require("@/lib/protomolecula/registro-atomos").listarAtomos as jest.Mock).mockImpl(mLA).mockResolvedValue([]);
    (require("@/lib/protomolecula/registro-atomos").limpiarRegistro as jest.Mock).mockImpl(mLR);
    (require("@/lib/protomolecula/parametros").describirCambio as jest.Mock).mockImpl(mD).mockImplementation((o) => `Desc: ${o.tipo}`);
  });

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
    expect(mC).toHaveBeenCalled();
  });

  it("procesa dictado volumen +3dB", async () => {
    const atomo = [{ id: "v", herramientaId: "vt", nombre: "Vol", categoria: "audio", integracion: "iframe", control: "ventana", parametros: [{ id: "n", nombre: "Nivel", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "dB", defecto: 50 }] }];
    (require("@/lib/protomolecula/registro-atomos").listarAtomos as jest.Mock).mockResolvedValue(atomo);

    const resultado = { ok: true, operacion: { tipo: "exacta", valor: 53, referencia: { atomoId: "v", parametroId: "n" } }, resumen: "sube volumen 3dB" };
    (ctrlBase.dictar as jest.Mock).mockResolvedValue(resultado);

    const { rerender } = render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    await waitFor(() => expect(screen.getByText(/vol/i)).toBeInTheDocument());
    expect(ctrlBase.dictar).toHaveBeenCalledWith("sube el volumen 3 dB", autor, undefined);
  });

  it("muestra deshacer/rehacer", async () => {
    const hist = [{ operacion: { tipo: "exacta" }, antes: 50, despues: 60, acotado: false, reversible: true }];
    (ctrlBase.suscribir as jest.Mock).mockImpl((cb) => { cb({ ...molBase, historial: hist }); return { unsubscribe: jest.fn() }; });

    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByRole("button", { name: /deshacer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rehacer/i })).toBeInTheDocument();
  });

  it("op agente grupo pendiente", async () => {
    const molG = { ...molBase, ambito: "grupo" };
    const opAg: Operacion = { id: "o1", objetivo: { atomoId: "v", parametroId: "n" }, accion: { tipo: "exacta", valor: 70 }, autor: { tipo: "agente", id: "ag", nombre: "Agente" }, origen: "agente", t: Date.now() };
    const cambio = { operacion: opAg, antes: 50, despues: 70, acotado: false, reversible: true };

    (ctrlBase.obtener as jest.Mock).mockReturnValue(molG);
    (ctrlBase.suscribir as jest.Mock).mockImpl((cb) => { cb({ ...molG, historial: [cambio] }); return { unsubscribe: jest.fn() }; });

    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByText(/agente/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeEnabled();
  });

  it("llama limpiarRegistro al desmontar", () => {
    const { unmount } = render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    unmount();
    expect(mLR).toHaveBeenCalled();
  });
});