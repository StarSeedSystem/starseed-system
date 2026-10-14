import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Estacion } from "@/lib/estaciones/tipos";

const AHORA = Date.now();

const estado = vi.hoisted(() => ({
  uid: "u1",
  tabla: [] as Estacion[],
  terminarOk: true,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/realtime/realtime", () => ({
  useRealtimeRows: () => ({ rows: estado.tabla, loading: false, reload: async () => {} }),
}));
vi.mock("@/lib/estaciones/datos", () => ({
  listarEstaciones: async () => estado.tabla,
  ocultasLocales: () => new Set(),
  ocultarLocal: vi.fn(),
  usuarioEnSesion: async () => estado.uid,
  pausarEstacion: vi.fn().mockResolvedValue(true),
  terminarEstacion: vi.fn().mockImplementation(() => Promise.resolve(estado.terminarOk)),
}));
vi.mock("@/lib/estaciones/internas", () => ({ estacionesInternas: async () => [] }));
vi.mock("@/ai/astraura/mesh/server-relay", () => ({ pullPublicFeed: async () => ({ items: [] }) }));

import { DirectorioEstaciones } from "../directorio-estaciones";

function base(parche: Partial<Estacion> = {}): Estacion {
  return {
    id: "e1", owner_id: "u1", ambito_tipo: "persona", entidad_ref: null,
    titulo: "Mía", descripcion: "", tipo: "audio", fuente: "enlace",
    enlace: "https://x.com", formato: "audio", imagen: null, idioma: "es",
    categorias: [], licencia: "cc-by", visibilidad: "publica",
    empieza_en: null, termina_en: null, ultimo_latido: new Date(AHORA).toISOString(),
    pausada: false, en_malla: false, espectadores: 0,
    created_at: new Date(AHORA).toISOString(), updated_at: new Date(AHORA).toISOString(),
    ...parche,
  };
}

afterEach(cleanup);
beforeEach(() => {
  estado.tabla = [];
  estado.uid = "u1";
  estado.terminarOk = true;
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

describe("Directorio propias", () => {
  it("muestra Terminar solo en estación propia", async () => {
    estado.tabla = [base({ id: "m1", owner_id: "u1" }), base({ id: "a1", owner_id: "u2", titulo: "Ajena" })];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(screen.getAllByText("Mía").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /Opciones/ })[0]);
    expect(screen.getByText("Terminar")).toBeTruthy();
    expect(screen.getAllByText("Ajena").length).toBeGreaterThan(0);
  });

  it("al confirmar terminar, llama terminarEstacion y retira la tarjeta", async () => {
    const { terminarEstacion } = await import("@/lib/estaciones/datos");
    estado.tabla = [base({ id: "m1" })];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(screen.getAllByText("Mía").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /Opciones/ })[0]);
    fireEvent.click(screen.getByText("Terminar"));
    await waitFor(() => expect(terminarEstacion).toHaveBeenCalledWith("m1"));
    await waitFor(() => expect(screen.queryAllByText("Mía")).toHaveLength(0));
  });

  it("si terminar falla muestra aviso y mantiene la tarjeta", async () => {
    estado.terminarOk = false;
    estado.tabla = [base({ id: "m1" })];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(screen.getAllByText("Mía").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /Opciones/ })[0]);
    fireEvent.click(screen.getByText("Terminar"));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("No se pudo terminar. Comprueba tu sesión."));
    expect(screen.getAllByText("Mía").length).toBeGreaterThan(0);
  });
});
