import { render, screen } from "@testing-library/react";
import * as React from "react";
import { OrbesBots } from "../orbes-bots";

// Mock the QuantumOrbAvatar
jest.mock("../../../components/aurora/quantum-orb-avatar", () => ({
  QuantumOrbAvatar: ({ personaId, size, aria-label, onClick }) => {
    return React.createElement("div", { 
      "data-testid": "quantum-orb-avataar",
      "data-persona": personaId,
      "data-size": size,
      "data-label": aria-label,
      onClick: onClick
    });
  }
}));

describe("OrbesBots", () => {
  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString();
        },
        clear: () => {
          store = {};
        }
      };
    })();
    Object.defineProperty(window, "localStorage", { value: localStorageMock });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders no orbes when there are no bots", async () => {
    // Mock Supabase auth to return no user (local)
    jest.spyOn(require("../../../utils/supabase/client"), "createClient").mockImplementation(() => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } })
      }
    } as any));

    // Mock leerBots to return empty array
    jest.spyOn(require("../../../lib/astraura-bots/adaptadores/almacen-bots"), "leerBots").mockReturnValue([]);

    render(<OrbesBots />);

    // Wait for the component to load
    await expect(screen.queryByTestId("quantum-orb-avataar")).not.toBeInTheDocument();
  });

  it("renders orbes when there are bots", async () => {
    // Mock Supabase auth to return a user
    const userId = "test-user-id";
    jest.spyOn(require("../../../utils/supabase/client"), "createClient").mockImplementation(() => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: userId } } })
      }
    } as any));

    // Mock leerBots to return a bot (excluding the default)
    const testBot = {
      id: "test-bot-1",
      nombre: "Test Bot 1",
      dueno: { tipo: "perfil", id: userId, cuentaId: userId },
      origen: "astraura",
      gobierno: "jerarquico",
      personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
      cuerpo: { forma: "orbe", tono: 0, escala: 1 },
      sentidosHabilitados: ["pantalla"],
      activo: true
    };
    jest.spyOn(require("../../../lib/astraura-bots/adaptadores/almacen-bots"), "leerBots").mockReturnValue([testBot]);

    render(<OrbesBots />);

    // Wait for the component to load
    const orbeAvataar = await screen.findByTestId("quantum-orb-avataar");
    expect(orbeAvataar).toHaveAttribute("data-persona", "test-bot-1");
    expect(orbeAvataar).toHaveAttribute("data-label", "Test Bot 1");
  });
});