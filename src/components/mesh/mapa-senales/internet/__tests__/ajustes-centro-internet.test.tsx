import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { AjustesNeurona } from "../../ajustes-centro";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { CentroNeurona } from "@/lib/senales/centro";
import type { DecisionAvatar } from "@/lib/senales/perfil-centro";
import type { ResumenRadarPublico, LineaRadar } from "@/lib/senales/radar-publico";

const AVATAR_BASE: DecisionAvatar = {
  modo: "iniciales",
  url: null,
  motivo: "sin foto ni avatar 3D",
};

const RADAR_BASE: ResumenRadarPublico = {
  emision: "publica",
  titulo: "Visible en el radar",
  motivo: null,
  lineas: [
    { etiqueta: "Nombre de la neurona", visible: true, valor: "se ve" },
    { etiqueta: "Foto del perfil", visible: false, valor: "oculto" },
    { etiqueta: "Tipo de aparato", visible: false, valor: "oculto" },
    { etiqueta: "Posición GPS", visible: false, valor: "oculto" },
  ],
};

const CENTRO_BASE: CentroNeurona = {
  nombreNeurona: "Test Neurona",
  iniciales: "TN",
  sinNombre: false,
  nombrePerfil: "Test Perfil",
  usuario: "@test",
  subtitulo: "Subtítulo",
  textoMedios: "Medios",
  avatar: AVATAR_BASE,
  radar: RADAR_BASE,
  mediosAbiertos: 1,
  datos: [],
};

function renderAjustes(props: { textosInternet?: typeof TextosInternet } = {}) {
  const { textosInternet } = props;
  return render(
    <AppearanceProvider>
      <AjustesNeurona
        centro={CENTRO_BASE}
        neuronaId="test-id"
        verPublicos={true}
        onVerPublicos={vi.fn()}
        onNombre={vi.fn()}
        textosInternet={textosInternet}
      />
    </AppearanceProvider>
  );
}

function mockNavigatorConnection(connection: { type?: string; saveData?: boolean; effectiveType?: string } | null) {
  Object.defineProperty(navigator, "connection", {
    value: connection,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AjustesNeurona - Internet compartido", () => {
  beforeEach(() => {
    mockNavigatorConnection(null);
  });

  it("no muestra la sección cuando textosInternet no se proporciona", () => {
    renderAjustes();
    expect(screen.queryByLabelText(/Internet compartido/i)).not.toBeInTheDocument();
  });

  it("muestra la sección cuando textosInternet se proporciona", () => {
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByLabelText(/Internet compartido/i)).toBeInTheDocument();
  });

  it("muestra 'Sin datos' cuando navigator.connection no está disponible", () => {
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("muestra 'Limitada' cuando la conexión es cellular", () => {
    mockNavigatorConnection({ type: "cellular", saveData: false, effectiveType: "4g" });
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByText("Limitada")).toBeInTheDocument();
    expect(screen.getByText("Información del navegador")).toBeInTheDocument();
  });

  it("muestra 'Limitada' cuando saveData es true", () => {
    mockNavigatorConnection({ type: "wifi", saveData: true, effectiveType: "4g" });
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByText("Limitada")).toBeInTheDocument();
    expect(screen.getByText("Información del navegador")).toBeInTheDocument();
  });

  it("muestra 'No limitada' cuando la conexión es wifi sin saveData", () => {
    mockNavigatorConnection({ type: "wifi", saveData: false, effectiveType: "4g" });
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByText("No limitada")).toBeInTheDocument();
    expect(screen.getByText("Información del navegador")).toBeInTheDocument();
  });

  it("muestra 'Limitada' cuando effectiveType es 2g", () => {
    mockNavigatorConnection({ type: "cellular", saveData: false, effectiveType: "2g" });
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByText("Limitada")).toBeInTheDocument();
    expect(screen.getByText("Información del navegador")).toBeInTheDocument();
  });

  it("los ajustes existentes siguen presentes", () => {
    renderAjustes({ textosInternet: TextosInternet });
    expect(screen.getByLabelText(/Nombre de la neurona/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacidad del radar público/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Compartir internet/i)).toHaveLength(4); // título + 3 ayudas de mesh
    expect(screen.getByText(/Ver los datos públicos de otras cuentas/i)).toBeInTheDocument();
  });
});