import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { SeccionInternet } from "../seccion-internet";
import { TextosInternet } from "@/lib/malla/internet/tipos";

const CLAVE_SUGERENCIA = "starseed.malla.internet.sugerencia.v1";
const CLAVE_CONEXION = "starseed.malla.internet.v1";

const extra = {
  desde: "Desde",
  hasta: "Hasta",
  limite: "Límite",
  compartirConOtros: "Compartir con otros",
  declararDePago: "Declarar de pago",
  declararNoDePago: "Declarar sin pago",
};

function renderSeccion() {
  return render(
    <AppearanceProvider>
      <SeccionInternet textos={TextosInternet} extra={extra} />
    </AppearanceProvider>
  );
}

function leerNegativa(): { en: number; conexion: string } | null {
  const crudo = window.localStorage.getItem(CLAVE_SUGERENCIA);
  if (crudo === null) return null;
  return JSON.parse(crudo);
}

let changeCallback: (() => void) | null = null;

function mockConexion(tipo: string, saveData: boolean = false, effectiveType?: string) {
  changeCallback = null;
  const connection = {
    type: tipo,
    saveData,
    effectiveType,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "change") changeCallback = cb;
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "change" && changeCallback === cb) changeCallback = null;
    }),
  };
  Object.defineProperty(navigator, "connection", {
    value: connection,
    configurable: true,
  });
  return connection;
}

function actualizarConexion(tipo: string, saveData: boolean = false, effectiveType?: string) {
  const conn = (navigator as any).connection;
  if (conn) {
    conn.type = tipo;
    conn.saveData = saveData;
    conn.effectiveType = effectiveType;
  }
}

function dispararCambioConexion() {
  if (changeCallback) changeCallback();
}

function limpiarMockConexion() {
  Object.defineProperty(navigator, "connection", {
    value: undefined,
    configurable: true,
  });
}

function esperarSugerencia() {
  return waitFor(() => {
    expect(screen.getByRole("status", { name: /Conexión limitada detectada/i })).toBeInTheDocument();
  });
}

function esperarSinSugerencia() {
  return waitFor(() => {
    expect(screen.queryByRole("status", { name: /Conexión limitada detectada/i })).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  limpiarMockConexion();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SeccionInternet - sugerencia de modo banco", () => {
  it("no sugiere si la conexión no es limitada (wifi)", async () => {
    mockConexion("wifi");
    renderSeccion();
    await esperarSinSugerencia();
  });

  it("no sugiere si el modo banco ya está activo", async () => {
    mockConexion("cellular");
    const { rerender } = renderSeccion();
    await esperarSugerencia();
    
    // Activate banco by clicking the switch
    const switchBanco = screen.getByRole("switch", { name: /Modo banco/i });
    fireEvent.click(switchBanco);
    
    // Re-render with banco active - the suggestion should disappear
    await waitFor(() => {
      expect(screen.queryByRole("status", { name: /Conexión limitada detectada/i })).not.toBeInTheDocument();
    });
  });

  it("ofrece sugerencia con conexión cellular y banco inactivo", async () => {
    mockConexion("cellular");
    renderSeccion();
    await esperarSugerencia();
  });

  it("Activar solo enciende el banco, no toca compartirConOtros", async () => {
    mockConexion("cellular");
    renderSeccion();
    await esperarSugerencia();
    
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    fireEvent.click(btnActivar);
    
    // Verify banco switch is now on
    await waitFor(() => {
      const switchBanco = screen.getByRole("switch", { name: /Modo banco/i });
      expect(switchBanco).toBeChecked();
    });
    
    // Verify compartirConOtros is still off
    const switchCompartir = screen.getByRole("switch", { name: /Compartir con otros/i });
    expect(switchCompartir).not.toBeChecked();
  });

  it("Ahora no oculta y no vuelve a salir al re-renderizar", async () => {
    mockConexion("cellular");
    renderSeccion();
    await esperarSugerencia();
    
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    fireEvent.click(btnAhoraNo);
    
    await esperarSinSugerencia();
    
    // Re-render should not show it again
    const { unmount } = renderSeccion();
    await esperarSinSugerencia();
    unmount();
  });

  it("cambiar la conexión a wifi oculta el aviso", async () => {
    mockConexion("cellular");
    renderSeccion();
    await esperarSugerencia();
    
    actualizarConexion("wifi");
    dispararCambioConexion();
    await esperarSinSugerencia();
  });

  it("declarar 'no es de pago' lo oculta", async () => {
    mockConexion("cellular");
    renderSeccion();
    await esperarSugerencia();
    
    fireEvent.click(screen.getByRole("button", { name: /Declarar sin pago/i }));
    await esperarSinSugerencia();
  });

  it("guarda negativa en localStorage al pulsar Ahora no", async () => {
    mockConexion("cellular");
    renderSeccion();
    await esperarSugerencia();
    
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    fireEvent.click(btnAhoraNo);
    
    await waitFor(() => {
      const negativa = leerNegativa();
      expect(negativa).not.toBeNull();
      expect(negativa?.conexion).toContain("cellular");
    });
  });

  it("no sugiere si ya declaró que no es de pago", async () => {
    mockConexion("cellular");
    // Pre-set the declaration to false
    window.localStorage.setItem(CLAVE_CONEXION, JSON.stringify({ declaraLimitada: false }));
    
    renderSeccion();
    await esperarSinSugerencia();
  });
});