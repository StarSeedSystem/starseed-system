import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockUid = "user-test-123";
const mockEntidadJerarquica = {
  tipo: "grupo" as const,
  slug: "grupo-test",
  nombre: "Grupo Jerárquico",
  id: "entidad-1",
  rango: 3,
  dueña: false,
  rol: "gestión",
};
const mockEntidadDemocratica = {
  tipo: "pagina" as const,
  slug: "pagina-test",
  nombre: "Página Democrática",
  id: "entidad-2",
  rango: 2,
  dueña: false,
  rol: "colaboración",
};

vi.mock("next/dynamic", () => ({
  default: (cargar: () => Promise<unknown>) => {
    const fuente = String(cargar);
    if (/ActualizacionesGenesis/.test(fuente)) {
      return (props: any) => <div data-testid="actualizaciones-genesis-montado" data-uid={mockUid} {...props} />;
    }
    if (/ActualizacionesPoliGenesis/.test(fuente)) {
      return (props: any) => (
        <div data-testid="actualizaciones-poligenesis-montado">
          <div data-testid="actualizaciones-poligenesis" data-democratico={String(props.democratico)} data-puede-gestionar={String(props.puedeGestionar)} />
        </div>
      );
    }
    return () => <div data-testid="desconocido" />;
  },
}));

vi.mock("@/components/actualizaciones/panel-actualizaciones", () => ({
  ActualizacionesGenesis: ({ uid }: { uid?: string | null }) => (
    <div data-testid="actualizaciones-genesis" data-uid={uid ?? "sin-uid"} />
  ),
  ActualizacionesPoliGenesis: ({ entidad, democratico, puedeGestionar }: { entidad: any; democratico: boolean; puedeGestionar: boolean }) => (
    <div data-testid="actualizaciones-poligenesis" data-democratico={String(democratico)} data-puede-gestionar={String(puedeGestionar)} />
  ),
  EntidadActualizable: {} as any,
}));

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    rawConfig: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } },
    updateConfig: vi.fn(),
    bgScopeMode: "cuenta",
  }),
}));

vi.mock("@/lib/genesis/puertos-os", () => ({
  puertosDelOs: () => ({
    perfil: { leer: vi.fn(), escribir: vi.fn() },
    entidad: { crearPagina: vi.fn(), leer: vi.fn(), escribir: vi.fn(), contarPublicaciones: vi.fn(), borrarPagina: vi.fn() },
    dock: { leer: () => [], guardar: vi.fn(), iconoValido: () => true },
    tableros: { listar: () => [], leerWidgets: () => [], guardarWidgets: vi.fn(), widgetConocido: () => null },
    agentes: { crear: vi.fn(), borrar: vi.fn(), vincular: vi.fn(), desvincular: vi.fn() },
    ahora: () => Date.now(),
    nuevoId: () => `test-${Date.now()}`,
  }),
  contextoDeMiCuenta: async () => ({
    contexto: { perfil: { nombre: "Test User" }, paginas: [] },
    paginasPropias: [],
  }),
  miCuenta: async () => mockUid,
}));

vi.mock("@/lib/genesis/entidades", () => ({
  misEntidades: async () => ({ ok: true, lista: [mockEntidadJerarquica, mockEntidadDemocratica] }),
  modoDe: async (entidad: any) => ({ democratico: entidad.rango === 2, explicito: true }),
  propuestasDe: async () => ({ ok: true, lista: [] }),
}));

vi.mock("@/lib/genesis/operaciones", () => ({
  decidirAplicacion: (ambito: any, rango: number, democratico: boolean) => {
    if (ambito.tipo === "persona") return { modo: "aplicar", motivo: "Es tu cuenta." };
    if (democratico) {
      return rango >= 2
        ? { modo: "proponer", motivo: "Esta entidad decide en democracia: cada cambio se convierte en una propuesta que se vota." }
        : { modo: "sin-permiso", motivo: "Para proponer cambios necesitas al menos rol de colaboración en esta entidad." };
    }
    return rango >= 3
      ? { modo: "aplicar", motivo: "Tienes rol de gestión en esta entidad." }
      : { modo: "sin-permiso", motivo: "En modo jerárquico solo aplican cambios quienes tienen rol de gestión (o la cuenta dueña)." };
  },
  rangoDeRol: (rol: string) => {
    switch ((rol ?? "").trim().toLowerCase()) {
      case "total": case "owner": case "dueño": return 4;
      case "gestor": case "admin": return 3;
      case "colaborador": case "editor": return 2;
      case "observador": case "viewer": return 1;
      default: return 0;
    }
  },
}));

vi.mock("@/lib/genesis/aplicar", () => ({ aplicarOperacion: vi.fn() }));
vi.mock("@/lib/genesis/historial", () => ({
  anotar: vi.fn(),
  leerHistorial: async () => ({ entradas: [], donde: "cuenta" }),
}));
vi.mock("@/lib/governance/engine", () => ({ createProposal: vi.fn() }));
vi.mock("@/components/genesis/panel-operaciones", () => ({ PanelOperaciones: () => <div data-testid="panel-operaciones" /> }));
vi.mock("@/components/genesis/atajos-genesis", () => ({ AtajosGenesis: () => <div data-testid="atajos-genesis" /> }));
vi.mock("@/components/genesis/conectores/seccion-asignaciones", () => ({ SeccionAsignacionesGenesis: () => <div data-testid="seccion-asignaciones" />, guardarAsignaciones: vi.fn() }));
vi.mock("@/lib/protogenesis/almacen-encargos", () => ({ almacenNavegador: () => null, cargarEncargos: () => [] }));
vi.mock("@/lib/protogenesis/decision", () => ({ decidirResultado: () => ({ modo: "aplicar", motivo: "", borrador: null }), propuestaMetaGenesis: vi.fn(), faltaDePlan: () => null }));
vi.mock("@/components/protogenesis/panel-protogenesis", () => ({ PanelProtoGenesis: () => <div data-testid="panel-protogenesis" /> }));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => <div data-testid="bots-entidad" /> }));
vi.mock("@/components/protomolecula/gobierno", () => ({ GobiernoProtoResumen: () => <div data-testid="gobierno-proto-resumen" /> }));
vi.mock("@/components/genesis/seccion-bots", () => ({ SeccionBotsGenesis: () => <div data-testid="seccion-bots-genesis" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/genesis");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Actualizaciones en Mi Genesis y PoliGenesis", () => {
  it("Mi Genesis monta ActualizacionesGenesis con su uid", async () => {
    render(<MiGenesis />);
    // Click the button to expand the collapsible section
    const button = screen.getByText("Actualizaciones de tu OS");
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByTestId("actualizaciones-genesis-montado")).toBeInTheDocument();
    });
    expect(screen.getByTestId("actualizaciones-genesis-montado")).toHaveAttribute("data-uid", mockUid);
  });

  it("PoliGenesis monta ActualizacionesPoliGenesis con democratico=true y puedeGestionar=true para entidad democrática rango 2", async () => {
    render(<PoliGenesis entidadInicial={mockEntidadDemocratica.id} />);
    await waitFor(() => {
      expect(screen.getByTestId("actualizaciones-poligenesis-montado")).toBeInTheDocument();
    });
    // Wait for modo to load (async)
    await waitFor(() => {
      const democratico = screen.getByTestId("actualizaciones-poligenesis-montado").querySelector("[data-democratico]");
      expect(democratico).toHaveAttribute("data-democratico", "true");
    });
    await waitFor(() => {
      const puedeGestionar = screen.getByTestId("actualizaciones-poligenesis-montado").querySelector("[data-puede-gestionar]");
      expect(puedeGestionar).toHaveAttribute("data-puede-gestionar", "true");
    });
  });

  it("PoliGenesis monta ActualizacionesPoliGenesis con democratico=false y puedeGestionar=true para entidad jerárquica rango 3", async () => {
    render(<PoliGenesis entidadInicial={mockEntidadJerarquica.id} />);
    await waitFor(() => {
      expect(screen.getByTestId("actualizaciones-poligenesis-montado")).toBeInTheDocument();
    });
    await waitFor(() => {
      const democratico = screen.getByTestId("actualizaciones-poligenesis-montado").querySelector("[data-democratico]");
      expect(democratico).toHaveAttribute("data-democratico", "false");
    });
    await waitFor(() => {
      const puedeGestionar = screen.getByTestId("actualizaciones-poligenesis-montado").querySelector("[data-puede-gestionar]");
      expect(puedeGestionar).toHaveAttribute("data-puede-gestionar", "true");
    });
  });

  it("PoliGenesis no monta ActualizacionesPoliGenesis sin entidad elegida", async () => {
    render(<PoliGenesis entidadInicial={null} />);
    await waitFor(() => {
      expect(screen.queryByTestId("actualizaciones-poligenesis-montado")).not.toBeInTheDocument();
    });
  });
});