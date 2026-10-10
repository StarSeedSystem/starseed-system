/**
 * Panel «Actualizaciones» como lo usa la persona: política por capa que se guarda y viaja con la
 * cuenta, neuronas con la versión de cada capa y su canaria, el estado del servidor frente a esta
 * neurona y el paso «Actualizaciones» al crear una entidad. La presencia y la red van dobladas.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  medios: [] as unknown[],
  conectado: true,
  aplicar: vi.fn(),
  humo: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/neurons/presencia", async (orig) => {
  const real = await orig<typeof import("@/lib/neurons/presencia")>();
  return { ...real, usePresenciaNeuronas: () => ({ conectado: h.conectado, medios: h.medios }) };
});
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "neu-mac", resolverAliasEsteMedio: () => "" }));
vi.mock("@/lib/actualizaciones/versiones-locales", () => ({
  versionesDeEsteMedio: async () => ({ interfaz: "2026.10.09", sw: "v8-2026-07-29" }),
  olvidarVersionesMedidas: () => undefined,
}));
vi.mock("@/lib/actualizaciones/aplicadores", () => ({
  aplicarCapa: (...a: unknown[]) => h.aplicar(...a),
  pruebaDeHumo: () => h.humo(),
}));

import { ActualizacionesGenesis, ActualizacionesMetaGenesis, ActualizacionesPoliGenesis } from "../panel-actualizaciones";
import { PasoActualizaciones } from "../paso-actualizaciones";
import { CLAVE_POLITICAS, CLAVE_NEURONA_ELEGIDA } from "@/lib/actualizaciones/almacen-politicas";

const medio = (n: string, m: string, etiqueta: string, v: Record<string, string>) => ({
  n, m, tipo: "web", etiqueta, plataforma: undefined, visible: true, desde: "", t: 1, s: {}, v,
});

beforeEach(() => {
  localStorage.clear();
  h.conectado = true;
  h.medios = [medio("neu-mac", "m1", "Chrome", { interfaz: "2026.10.09" }), medio("neu-tab", "m2", "Tablet", { interfaz: "2026.10.01" })];
  h.aplicar.mockResolvedValue({ ok: true, texto: "Recargando con la versión nueva." });
  h.humo.mockResolvedValue({ paginaCarga: true, servicios: {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/version.json") return { ok: true, json: async () => ({ build: "build-nuevo-123" }) };
    if (url === "/sw-v7.js") return { ok: true, text: async () => 'const SW_VERSION = "v9-2026-10-10";' };
    return { ok: false };
  }));
  (window as unknown as { STARSEED_BUILD_INICIAL?: string }).STARSEED_BUILD_INICIAL = "build-viejo-001";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MetaGenesis › Actualizaciones", () => {
  it("compara lo que sirve el servidor con esta neurona, capa por capa", async () => {
    render(<ActualizacionesMetaGenesis />);
    expect(await screen.findByText("build-nuevo-12")).toBeInTheDocument();
    expect(screen.getByText("build-viejo-00")).toBeInTheDocument();
    expect(screen.getByText("v9-2026-10-10")).toBeInTheDocument();
    expect(screen.getAllByText("HAY NUEVA").length).toBe(2); // interfaz y sin conexión
    expect(screen.getByText("no es la app nativa")).toBeInTheDocument();
  });

  it("«Aplicar aquí» llama al aplicador real de la capa y dice lo que pasó", async () => {
    render(<ActualizacionesMetaGenesis />);
    await screen.findByText("build-nuevo-12");
    fireEvent.click(screen.getAllByRole("button", { name: /Aplicar aquí/ })[0]);
    await waitFor(() => expect(h.aplicar).toHaveBeenCalledWith("interfaz", expect.objectContaining({ sistema: "starseed-os" }), { permitirRelanzar: true }));
    expect(await screen.findByRole("status")).toHaveTextContent("Interfaz: Recargando con la versión nueva.");
  });

  it("la prueba de humo dice si pasa o qué falla", async () => {
    h.humo.mockResolvedValue({ paginaCarga: false, servicios: {} });
    render(<ActualizacionesMetaGenesis />);
    fireEvent.click(screen.getByRole("button", { name: /Prueba de humo/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("La página del OS no carga.");
  });

  it("neuronas con su versión, la atrasada con su motivo y la canaria se recuerda", async () => {
    render(<ActualizacionesMetaGenesis />);
    const lista = await screen.findByRole("list", { name: "Neuronas y versión de cada capa" });
    expect(within(lista).getByText("Tablet")).toBeInTheDocument();
    expect(within(lista).getByText("ESTA")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Neuronas atrasadas" })).toHaveTextContent("Tablet va atrasada en interfaz (2026.10.01 → 2026.10.09)");
    fireEvent.click(within(lista).getAllByRole("button", { name: /Hacer canaria/ })[1]);
    expect(localStorage.getItem(CLAVE_NEURONA_ELEGIDA)).toBe("neu-tab");
    expect(within(lista).getByRole("button", { name: /Canaria/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("sin presencia lo dice y enseña al menos esta neurona", async () => {
    h.conectado = false;
    h.medios = [];
    render(<ActualizacionesMetaGenesis />);
    expect(await screen.findByText(/La presencia en vivo no está conectada/)).toBeInTheDocument();
    expect(await screen.findByText("Esta neurona")).toBeInTheDocument();
  });

  it("cambiar la política de una capa la guarda para el sistema «os»", async () => {
    render(<ActualizacionesMetaGenesis />);
    const grupo = screen.getByRole("group", { name: "Política de StarSeed OS" });
    fireEvent.change(within(grupo).getByLabelText("Interfaz"), { target: { value: "manual" } });
    expect(JSON.parse(localStorage.getItem(CLAVE_POLITICAS)!).os.politica.interfaz).toEqual({ modo: "manual" });
    fireEvent.change(within(grupo).getByLabelText("Modelos"), { target: { value: "programada" } });
    expect(within(grupo).getByLabelText("Modelos: desde")).toBeInTheDocument();
  });
});

describe("Genesis y PoliGenesis", () => {
  it("Mi Genesis: el OS en mis neuronas y mi perfil (solo datos e interfaz)", () => {
    render(<ActualizacionesGenesis uid="u1" />);
    const perfil = screen.getByRole("group", { name: "Política de Mi perfil y mi interfaz" });
    expect(within(perfil).getAllByRole("combobox")).toHaveLength(2);
    fireEvent.change(within(perfil).getByLabelText("Datos"), { target: { value: "manual" } });
    expect(JSON.parse(localStorage.getItem(CLAVE_POLITICAS)!)["perfil:u1"].tipo).toBe("perfil");
  });

  it("PoliGenesis: democrática lo dice; sin gestión, solo lectura", () => {
    render(<ActualizacionesPoliGenesis entidad={{ tipo: "grupo", slug: "huerto", nombre: "Huerto" }} democratico puedeGestionar={false} />);
    expect(screen.getByText(/ninguna versión de sus sistemas se publica sin votación/)).toBeInTheDocument();
    const grupo = screen.getByRole("group", { name: "Política de Huerto" });
    expect(within(grupo).getByLabelText("Datos")).toBeDisabled();
  });
});

describe("Paso «Actualizaciones» al crear", () => {
  it("propone la política de su tipo y avisa de cada cambio", () => {
    const cambiar = vi.fn();
    render(<PasoActualizaciones tipo="grupo" valor={null} onCambiar={cambiar} />);
    expect(screen.getByTestId("paso-actualizaciones")).toHaveTextContent("3 capas automáticas · 3 con aviso");
    fireEvent.change(screen.getByLabelText("Interfaz"), { target: { value: "automatica-esta" } });
    expect(cambiar).toHaveBeenCalledWith(expect.objectContaining({ interfaz: { modo: "automatica-esta" } }));
  });
});
