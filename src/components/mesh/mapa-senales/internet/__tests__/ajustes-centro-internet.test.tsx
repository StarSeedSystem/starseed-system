import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AjustesNeurona } from "../../ajustes-centro";
import type { CentroNeurona } from "@/lib/senales/centro";

const CENTRO_BASE: CentroNeurona = {
  nombreNeurona: "Mac de prueba",
  iniciales: "MP",
  sinNombre: false,
  nombrePerfil: "Perfil test",
  usuario: "@test",
  subtitulo: "En línea",
  textoMedios: "WiFi",
  avatar: { modo: "iniciales" },
  radar: { emision: "publica", titulo: "Visible en el radar", motivo: null },
};

const textosInternetMock = {
  bancoTitulo: "Modo banco",
  bancoAyuda: "Raciona los datos por día",
  quedaHoy: (mb: number) => `Quedan ${mb} MB hoy`,
  agotadoHoy: "Agotado hoy",
  meshTitulo: "Compartir por malla",
  meshAyuda: "Permite compartir internet por la red mesh P2P",
  meshSinLimite: "Sin límite",
  meshConLimite: (mb: number) => `${mb} MB disponibles`,
  conexionLimitada: "Limitada",
  conexionNoLimitada: "No limitada",
  conexionDesconocida: "Sin datos",
  fuenteDeclarada: "Declarada por la persona",
  fuenteNativa: "Marca de red del dispositivo",
  fuenteNavegador: "Información del navegador",
  sugerirTitulo: "Conexión limitada detectada",
  sugerirCuerpo: "Se ha detectado que tu conexión a internet es limitada.",
  sugerirActivar: "Activar modo banco",
  sugerirAhoraNo: "Ahora no",
  audMiCuenta: "Neuronas de mi cuenta",
  audEntidad: "Miembros de una entidad",
  audPublico: "Público",
};

function renderAjustes(props: {
  centro?: CentroNeurona;
  textosInternet?: typeof textosInternetMock;
} = {}) {
  return render(
    <AjustesNeurona
      centro={props.centro ?? CENTRO_BASE}
      neuronaId="test-id"
      verPublicos={false}
      onVerPublicos={vi.fn()}
      onNombre={vi.fn()}
      textosInternet={props.textosInternet}
    />
  );
}

function mockNavigatorConnection(connection: Partial<Navigator["connection"]> | null) {
  const originalConnection = (navigator as any).connection;
  if (connection === null) {
    (navigator as any).connection = undefined;
  } else {
    (navigator as any).connection = {
      type: "wifi",
      effectiveType: "4g",
      saveData: false,
      ...connection,
    };
  }
  return () => {
    if (originalConnection === undefined) {
      delete (navigator as any).connection;
    } else {
      (navigator as any).connection = originalConnection;
    }
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AjustesNeurona - sección Internet compartido", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no muestra la sección cuando textosInternet no se proporciona", () => {
    renderAjustes({ textosInternet: undefined });
    expect(screen.queryByText(/Internet compartido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Limitada|No limitada|Sin datos/i)).not.toBeInTheDocument();
  });

  it("muestra la sección Internet compartido cuando textosInternet se proporciona", () => {
    renderAjustes({ textosInternet: textosInternetMock });
    expect(screen.getByText(/Internet compartido/i)).toBeInTheDocument();
  });

  it("la sección aparece una sola vez", () => {
    renderAjustes({ textosInternet: textosInternetMock });
    const sections = screen.getAllByText(/Internet compartido/i);
    expect(sections).toHaveLength(1);
  });

  it("muestra el estado de conexión inicial como 'Sin datos'", () => {
    const restore = mockNavigatorConnection(null);
    renderAjustes({ textosInternet: textosInternetMock });
    expect(screen.getByText(/Sin datos/i)).toBeInTheDocument();
    restore();
  });

  it("actualiza la clasificación según navigator.connection.type", () => {
    const restore = mockNavigatorConnection({ type: "cellular" });
    renderAjustes({ textosInternet: textosInternetMock });
    expect(screen.getByText(/Limitada/i)).toBeInTheDocument();
    expect(screen.getByText(/Información del navegador/i)).toBeInTheDocument();
    restore();
  });

  it("muestra 'No limitada' para wifi sin saveData", () => {
    const restore = mockNavigatorConnection({ type: "wifi", saveData: false });
    renderAjustes({ textosInternet: textosInternetMock });
    expect(screen.getByText(/No limitada/i)).toBeInTheDocument();
    expect(screen.getByText(/Conexión por WiFi o Ethernet/i)).toBeInTheDocument();
    restore();
  });

  it("muestra 'Limitada' para wifi con saveData activado", () => {
    const restore = mockNavigatorConnection({ type: "wifi", saveData: true });
    renderAjustes({ textosInternet: textosInternetMock });
    expect(screen.getByText(/Limitada/i)).toBeInTheDocument();
    expect(screen.getByText(/Modo ahorro de datos activado/i)).toBeInTheDocument();
    restore();
  });

  it("los ajustes existentes (nombre, privacidad, modo banco) siguen funcionando", () => {
    renderAjustes({ textosInternet: textosInternetMock });
    expect(screen.getByLabelText(/Nombre de la neurona/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacidad del radar público/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Modo banco/i })).toBeInTheDocument();
    expect(screen.getByText(/Así te ven las demás cuentas/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Ver los datos públicos de otras cuentas/i })).toBeInTheDocument();
  });

  it("no rompe cuando navigator.connection no está disponible", () => {
    const restore = mockNavigatorConnection(null);
    expect(() => renderAjustes({ textosInternet: textosInternetMock })).not.toThrow();
    expect(screen.getByText(/Sin datos/i)).toBeInTheDocument();
    restore();
  });
});