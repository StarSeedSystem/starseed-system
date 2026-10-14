import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PanelProtomolecula, PanelProtomoleculaAutonomo } from "../panel-protomolecula";
import type { 
  Autor, 
  Molecula, 
  Operacion, 
  Capa, 
  AtomoEnUso, 
  ValorParametro, 
  EstadoValores, 
  Ambito,
  TipoCapa,
  Computo,
  ReferenciaEntidad
} from "@/lib/protomolecula/tipos";
import { limpiarRegistro } from "@/lib/protomolecula/registro-atomos";

vi.mock("@/lib/protomolecula/almacen-moleculas", () => ({
  listarMoleculas: vi.fn(),
  cargarMolecula: vi.fn(),
  guardarMolecula: vi.fn(),
  registrarControlador: vi.fn()
}));
vi.mock("@/lib/protomolecula/controlador", () => ({
  crearControlador: vi.fn()
}));
vi.mock("@/lib/protomolecula/registro-atomos", () => ({
  listarAtomos: vi.fn(),
  limpiarRegistro: vi.fn()
}));
vi.mock("@/lib/protomolecula/parametros", async () => {
  const actual = await vi.importActual("@/lib/protomolecula/parametros");
  return {
    ...actual,
    describirCambio: vi.fn().mockImplementation((o) => `Desc: ${o.tipo}`)
  };
});

const mC = vi.fn();
const mL = vi.fn();
const mG = vi.fn();
const mS = vi.fn();
const mR = vi.fn();
const mCC = vi.fn();
const mLA = vi.fn();
const mD = vi.fn();
const mLR = vi.fn();

const autor: Autor = { tipo: "persona", id: "test-user", nombre: "Test User" };

// Mock núcleo molecule
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

// Mock núcleo controlador
const ctrlBase = {
  obtener: vi.fn().mockReturnValue(molBase),
  suscribir: vi.fn().mockImplementation((cb) => { cb({ ...molBase }); return vi.fn(); }),
  mover: vi.fn(),
  dictar: vi.fn()
};

describe("PanelProtomolecula", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const almacenMoleculas = import("@/lib/protomolecula/almacen-moleculas");
    almacenMoleculas.then(mod => {
      mod.listarMoleculas.mockImplementation(mL).mockResolvedValue([molBase]);
      mod.cargarMolecula.mockImplementation(mG).mockResolvedValue(molBase);
      mod.guardarMolecula.mockImplementation(mS).mockResolvedValue(undefined);
      mod.registrarControlador.mockImplementation(mR).mockResolvedValue(undefined);
    });
    const controladorMod = import("@/lib/protomolecula/controlador");
    controladorMod.then(mod => {
      mod.crearControlador.mockImplementation(mCC).mockReturnValue(ctrlBase);
    });
    const registroAtomosMod = import("@/lib/protomolecula/registro-atomos");
    registroAtomosMod.then(mod => {
      mod.listarAtomos.mockImplementation(mLA).mockResolvedValue([]);
      mod.limpiarRegistro.mockImplementation(mLR);
    });
    // describirCambio is mocked in the vi.mock for parametros
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
    expect(mS).toHaveBeenCalled();
  });

  it("procesa dictado volumen +3dB", async () => {
    // Mock an atom that matches the núcleo types
    const atomo: AtomoEnUso[] = [{
      id: "v",
      herramientaId: "vt",
      titulo: "Volumen",
      capaId: undefined,
      ejecutaEn: undefined,
      estado: "activo"
    }];
    (import("@/lib/protomolecula/registro-atomos").listarAtomos as any).mockImplementation(mLA).mockResolvedValue(atomo);

    const resultado = { 
      ok: true, 
      operacion: { 
        tipo: "exacta", 
        valor: 53, 
        referencia: { atomoId: "v", parametroId: "n" } 
      }, 
      resumen: "sube volumen 3dB" 
    };
    (ctrlBase.dictar as any).mockResolvedValue(resultado);

    const { rerender } = render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    await waitFor(() => expect(screen.getByText(/vol/i)).toBeInTheDocument());
    expect(ctrlBase.dictar).toHaveBeenCalledWith("sube el volumen 3 dB", autor, undefined);
  });

  it("muestra deshacer/rehacer", async () => {
    const hist = [{ 
      operacion: { 
        tipo: "exacta", 
        objetivo: { atomoId: "v", parametroId: "n" }, 
        accion: { tipo: "exacta", valor: 53 }, 
        autor: autor, 
        origen: "mano", 
        t: Date.now() 
      }, 
      antes: 50, 
      despues: 60, 
      acotado: false, 
      reversible: true 
    }];
    (ctrlBase.suscribir as any).mockImplementation((cb) => { 
      cb({ ...molBase, historial: hist }); 
      return vi.fn(); 
    });

    render(<PanelProtomolecula controlador={ctrlBase as any} autor={autor} />);
    expect(screen.getByRole("button", { name: /deshacer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rehacer/i })).toBeInTheDocument();
  });

  it("op agente grupo pendiente", async () => {
    const molG: Molecula = { 
      ...molBase, 
      ambito: "grupo" 
    };
    const opAg: Operacion = { 
      id: "o1", 
      objetivo: { atomoId: "v", parametroId: "n" }, 
      accion: { tipo: "exacta", valor: 70 }, 
      autor: { tipo: "agente", id: "ag", nombre: "Agente" }, 
      origen: "agente", 
      t: Date.now() 
    };
    const cambio = { 
      operacion: opAg, 
      antes: 50, 
      despues: 70, 
      acotado: false, 
      reversible: true 
    };

    (ctrlBase.obtener as any).mockReturnValue(molG);
    (ctrlBase.suscribir as any).mockImplementation((cb) => { 
      cb({ ...molG, historial: [cambio] }); 
      return vi.fn(); 
    });

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