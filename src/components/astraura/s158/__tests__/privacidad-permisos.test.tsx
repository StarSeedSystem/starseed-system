// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/aurora/senses/request-permission", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aurora/senses/request-permission")>();
  return { ...real, consultarPermiso: vi.fn(), pedirPermiso: vi.fn(), suscribirPermiso: vi.fn() };
});
vi.mock("@/lib/astraura/astraura-158-client", () => ({
  fetchAstraura158Privacy: vi.fn(), updateAstraura158Privacy: vi.fn(), toggleAstraura158AirGap: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { consultarPermiso, pedirPermiso, suscribirPermiso } from "@/lib/aurora/senses/request-permission";
import { fetchAstraura158Privacy } from "@/lib/astraura/astraura-158-client";
import type { EstadoPermiso } from "@/lib/permisos/contrato";
import { estadoTab, PrivacidadTab } from "../privacidad-tab";

const CONSULTAR = vi.mocked(consultarPermiso);
const PEDIR = vi.mocked(pedirPermiso);
const SUSCRIBIR = vi.mocked(suscribirPermiso);
const CARGAR = vi.mocked(fetchAstraura158Privacy);

function estados(mapa: Partial<Record<string, EstadoPermiso>>) {
  CONSULTAR.mockImplementation(async (id) => mapa[id] ?? "preguntar");
}
const montar = () => render(<PrivacidadTab target="local" refresh={vi.fn()} />);

beforeEach(() => {
  vi.resetAllMocks();
  CARGAR.mockResolvedValue({ ok: true, target: "local", endpoint: "", data: { settings: {}, air_gap_active: false, protected_sensors_count: 0 } });
  PEDIR.mockResolvedValue({ id: "microfono", estado: "concedido" });
  SUSCRIBIR.mockImplementation(() => vi.fn());
  CONSULTAR.mockResolvedValue("preguntar");
});
afterEach(cleanup);

describe("estadoTab", () => {
  it("traduce el contrato unificado a las insignias de la pestaña", () => {
    expect([estadoTab("concedido"), estadoTab("denegado"), estadoTab("preguntar"), estadoTab("no-disponible")])
      .toEqual(["granted", "denied", "prompt", "unsupported"]);
  });
});

describe("PrivacidadTab · permisos reales", () => {
  it("al montar consulta los cuatro sensores y pinta sus insignias", async () => {
    estados({ ubicacion: "concedido", microfono: "denegado", camara: "preguntar", almacenamiento: "no-disponible" });
    montar();
    expect(await screen.findByText("concedido")).toBeTruthy();
    expect(screen.getByText("denegado")).toBeTruthy();
    expect(screen.getByText("pendiente")).toBeTruthy();
    expect(screen.getByText("no soportado en este navegador")).toBeTruthy();
    for (const id of ["ubicacion", "microfono", "camara", "almacenamiento"]) expect(CONSULTAR).toHaveBeenCalledWith(id);
  });

  it("un cambio en vivo de suscribirPermiso actualiza la insignia", async () => {
    estados({});
    const oyentes: Record<string, (estado: "granted" | "denied" | "prompt" | "unsupported") => void> = {};
    SUSCRIBIR.mockImplementation((id, cb) => { oyentes[id] = cb; return vi.fn(); });
    montar();
    await waitFor(() => expect(screen.getAllByText("pendiente")).toHaveLength(4));
    act(() => oyentes.microfono("denied"));
    expect(await screen.findByText("denegado")).toBeTruthy();
  });

  it("el botón del micrófono pide por el motor unificado y vuelve a consultar", async () => {
    let consultasMic = 0;
    CONSULTAR.mockImplementation(async (id) => {
      if (id !== "microfono") return "preguntar";
      consultasMic += 1;
      return consultasMic === 1 ? "denegado" : "concedido";
    });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Solicitar acceso: Micrófono" }));
    await waitFor(() => expect(PEDIR).toHaveBeenCalledWith("microfono"));
    await waitFor(() => expect(consultasMic).toBe(2));
    expect(await screen.findByText("concedido")).toBeTruthy();
  });

  it("al desmontar llama a los tres des-suscriptores", async () => {
    const desSuscripciones = [vi.fn(), vi.fn(), vi.fn()];
    let indice = 0;
    SUSCRIBIR.mockImplementation(() => desSuscripciones[indice++]);
    const { unmount } = montar();
    await waitFor(() => expect(SUSCRIBIR).toHaveBeenCalledTimes(3));
    unmount();
    for (const desSuscribir of desSuscripciones) expect(desSuscribir).toHaveBeenCalledTimes(1);
  });
});
