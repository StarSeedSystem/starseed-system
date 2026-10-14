import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectorioEstaciones } from "../directorio-estaciones";
import type { Estacion } from "@/lib/estaciones/tipos";

// Mocks
vi.mock("@/lib/estaciones/datos", () => ({
  listarEstaciones: async () => [],
  ocultasLocales: () => new Set(),
  ocultarLocal: vi.fn(),
  terminarEstacion: vi.fn(),
  pausarEstacion: vi.fn(),
  usuarioEnSesion: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => null }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/realtime/realtime", () => ({
  useRealtimeRows: () => ({ rows: [], loading: false, reload: async () => {} }),
}));
vi.mock("@/lib/estaciones/internas", () => ({
  estacionesInternas: async () => [],
}));
vi.mock("@/lib/estaciones/malla", () => ({
  estacionesDeFaros: () => [],
}));
vi.mock("@/ai/astraura/mesh/server-relay", () => ({
  pullPublicFeed: async () => ({ items: [], next: { atIso: "", id: "" } }),
}));

const AHORA = Date.now();

function base(parche: Partial<Estacion> = {}): Estacion {
  return {
    id: "est-1",
    owner_id: "u1",
    ambito_tipo: "persona",
    entidad_ref: null,
    titulo: "Radio libre",
    descripcion: "",
    tipo: "audio",
    fuente: "enlace",
    enlace: "https://ejemplo.org/stream",
    formato: "audio",
    imagen: null,
    idioma: "es",
    categorias: [],
    licencia: "cc-by",
    visibilidad: "publica",
    empieza_en: null,
    termina_en: null,
    ultimo_latido: new Date(AHORA - 30_000).toISOString(),
    pausada: false,
    en_malla: false,
    espectadores: 42,
    created_at: "2026-10-07T10:00:00Z",
    updated_at: "2026-10-07T10:00:00Z",
    ...parche,
  };
}

afterEach(cleanup);

describe("DirectorioEstaciones · propias", () => {
  it("shows 'Terminar' for own station", async () => {
    const uid = "u1";
    (usuarioEnSesion as vi.Mock).mockResolvedValue(uid);
    const estacion = base({ owner_id: uid });
    render(<DirectorioEstaciones />);
    await screen.findByText("Radio libre");
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    expect(screen.getByText("Terminar")).toBeTruthy();
  });

  it("does not show 'Terminar' for other's station", async () => {
    const uid = "u1";
    (usuarioEnSesion as vi.Mock).mockResolvedValue(uid);
    const estacion = base({ owner_id: "u2" });
    render(<DirectorioEstaciones />);
    await screen.findByText("Radio libre");
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    expect(screen.queryByText("Terminar")).toBeNull();
  });

  it("calls terminarEstacion on confirm and removes station", async () => {
    const uid = "u1";
    (usuarioEnSesion as vi.Mock).mockResolvedValue(uid);
    const terminarEstacionMock = terminarEstacion as vi.Mock;
    terminarEstacionMock.mockResolvedValue(true);
    const estacion = base({ owner_id: uid });
    render(<DirectorioEstaciones />);
    await screen.findByText("Radio libre");
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    fireEvent.click(screen.getByText("Terminar"));
    window.confirm = vi.fn().mockReturnValue(true);
    // Note: In jsdom, we need to handle the confirm synchronously.
    // The actual implementation may require waiting for the state update.
    // For simplicity, we assume the station is removed after the call.
    await vi.waitFor(() => {
      expect(screen.queryByText("Radio libre")).not.toBeInTheDocument();
    });
    expect(terminarEstacionMock).toHaveBeenCalledWith("est-1");
  });

  it("shows error on terminarEstacion failure", async () => {
    const uid = "u1";
    (usuarioEnSesion as vi.Mock).mockResolvedValue(uid);
    const terminarEstacionMock = terminarEstacion as vi.Mock;
    terminarEstacionMock.mockResolvedValue(false);
    const estacion = base({ owner_id: uid });
    render(<DirectorioEstaciones />);
    await screen.findByText("Radio libre");
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    fireEvent.click(screen.getByText("Terminar"));
    window.confirm = vi.fn().mockReturnValue(true);
    await vi.waitFor(() => {
      expect(screen.getByText("No se pudo terminar. Comprueba tu sesión.")).toBeInTheDocument();
    });
    expect(screen.getByText("Radio libre")).toBeInTheDocument();
  });
});