import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AsistenteConectores } from "../asistente-conectores";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    bgScopeMode: "cuenta",
    config: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } },
  }),
}));
vi.mock("@/ai/astraura/free-catalog", () => ({
  FREE_CATALOG: [
    {
      id: "test-local",
      label: "Test Local",
      tier: "local",
      providerId: "openai-compatible",
      baseUrl: "http://localhost:11434",
      requiresKey: false,
      getKeyUrl: null,
      keyOptional: false,
      models: [
        { id: "modelo-1", label: "Modelo Local 1", strengths: ["chat", "code"], quality: 7, context: 4096 },
        { id: "modelo-2", label: "Modelo Local 2", strengths: ["reasoning"], quality: 8, context: 8192 },
      ],
      limits: "Sin límites",
      why: "Test",
      privacy: "local",
      weight: 1.2,
    },
    {
      id: "test-free-key",
      label: "Test Free Key",
      tier: "free-key",
      providerId: "openai-compatible",
      baseUrl: "https://api.test.com/v1",
      requiresKey: true,
      getKeyUrl: "https://test.com/keys",
      keyOptional: true,
      models: [
        { id: "modelo-3", label: "Modelo Cloud 1", strengths: ["chat", "vision"], quality: 7, context: 131072, vision: true },
      ],
      limits: "100 req/día",
      why: "Test",
      privacy: "cloud",
      weight: 1.0,
    },
    {
      id: "test-instant",
      label: "Test Instant",
      tier: "instant",
      providerId: "starseed",
      baseUrl: "builtin://test",
      requiresKey: false,
      getKeyUrl: null,
      keyOptional: false,
      models: [
        { id: "modelo-4", label: "Modelo Browser", strengths: ["fast"], quality: 6, context: 2048 },
      ],
      limits: "Ilimitado local",
      why: "Test",
      privacy: "browser",
      weight: 0.9,
    },
  ],
}));

const mockContexto = {
  neuronas: [
    { id: "n1", nombre: "MacBook Pro", online: true, capacidades: ["astraura-158", "ollama"], puedeServirAstraura: true, latenciaMs: 45 },
    { id: "n2", nombre: "iPhone", online: false, capacidades: [], puedeServirAstraura: false },
  ],
  servidoresCerebro: [
    { id: "s1", nombre: "Servidor Casa", endpoint: "https://cerebro.casa.local", capacidades: ["memoria", "agentes"], online: true },
  ],
  capaAstraura: { disponible: true, modo: "local" as const, personalidades: ["aurora", "hermione"] },
};

const mockFetch = vi.fn();
beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("AsistenteConectores", () => {
  it("muestra el paso 1 con contexto local y permite avanzar", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockContexto,
    });

    render(<AsistenteConectores ambito="cuenta" />);

    expect(await screen.findByText("Conectar Genesis · tu cuenta")).toBeInTheDocument();
    expect(await screen.findByText("Paso 1 de 3")).toBeInTheDocument();
    expect(await screen.findByText("Neuronas de la cuenta (2)")).toBeInTheDocument();
    expect(await screen.findByText("MacBook Pro")).toBeInTheDocument();
    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    expect(await screen.findByText("Servidores del cerebro (1)")).toBeInTheDocument();
    expect(await screen.findByText("Servidor Casa")).toBeInTheDocument();
    expect(await screen.findByText("Capa de Astraura 1.58-bit")).toBeInTheDocument();
    expect(await screen.findByText("Local (esta neurona)")).toBeInTheDocument();

    const btnSiguiente = screen.getByRole("button", { name: /siguiente/i });
    fireEvent.click(btnSiguiente);
    expect(await screen.findByText("Paso 2 de 3")).toBeInTheDocument();
  });

  it("paso 2 muestra opciones gratuitas y permite seleccionar", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockContexto,
    });

    render(<AsistenteConectores ambito="grupo" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));

    expect(await screen.findByText("Test Local · Modelo Local 1")).toBeInTheDocument();
    expect(await screen.findByText("Test Local · Modelo Local 2")).toBeInTheDocument();
    expect(await screen.findByText("Test Free Key · Modelo Cloud 1")).toBeInTheDocument();
    expect(await screen.findByText("Test Instant · Modelo Browser")).toBeInTheDocument();

    const checkbox1 = screen.getByLabelText(/seleccionar test local · modelo local 1/i);
    fireEvent.click(checkbox1);
    expect(checkbox1).toBeChecked();

    const checkbox2 = screen.getByLabelText(/seleccionar test free key · modelo cloud 1/i);
    fireEvent.click(checkbox2);
    expect(checkbox2).toBeChecked();

    const btnSiguiente = screen.getByRole("button", { name: /siguiente/i });
    fireEvent.click(btnSiguiente);
    expect(await screen.findByText("Paso 3 de 3")).toBeInTheDocument();
  });

  it("paso 3 muestra resumen por papel con cadena ordenada por privacidad", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockContexto,
    });

    render(<AsistenteConectores ambito="pagina" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));

    fireEvent.click(screen.getByLabelText(/seleccionar test local · modelo local 1/i));
    fireEvent.click(screen.getByLabelText(/seleccionar test local · modelo local 2/i));
    fireEvent.click(screen.getByLabelText(/seleccionar test free key · modelo cloud 1/i));

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText(/paso 3 de 3/i));

    expect(await screen.findByText("chat")).toBeInTheDocument();
    expect(await screen.findByText("code")).toBeInTheDocument();
    expect(await screen.findByText("reasoning")).toBeInTheDocument();
    expect(await screen.findByText("vision")).toBeInTheDocument();
    expect(await screen.findByText("fast")).toBeInTheDocument();

    expect(await screen.findByText("Test Local · Modelo Local 1")).toBeInTheDocument();
    expect(await screen.findByText("Test Local · Modelo Local 2")).toBeInTheDocument();
    expect(await screen.findByText("Test Free Key · Modelo Cloud 1")).toBeInTheDocument();
  });

  it("botón Vincular abre enlaceAlta en pestaña nueva y muestra campo de clave", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockContexto,
    });

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<AsistenteConectores ambito="cuenta" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));

    const tarjetaFreeKey = screen.getByText("Test Free Key · Modelo Cloud 1").closest("div[class*='rounded-xl']")!;
    const btnVincular = within(tarjetaFreeKey).getByRole("button", { name: /vincular/i });
    fireEvent.click(btnVincular);

    expect(openSpy).toHaveBeenCalledWith("https://test.com/keys", "_blank", "noopener,noreferrer");

    const inputClave = await screen.findByPlaceholderText(/pega tu .* clave api aquí/i);
    expect(inputClave).toBeInTheDocument();

    openSpy.mockRestore();
  });

  it("campo de clave aparece tras vincular y envía a la API", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockContexto })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<AsistenteConectores ambito="cuenta" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));

    const tarjetaFreeKey = screen.getByText("Test Free Key · Modelo Cloud 1").closest("div[class*='rounded-xl']")!;
    const btnVincular = within(tarjetaFreeKey).getByRole("button", { name: /vincular/i });
    fireEvent.click(btnVincular);

    const inputClave = await screen.findByPlaceholderText(/pega tu .* clave api aquí/i);
    fireEvent.change(inputClave, { target: { value: "sk-test-123" } });

    const btnEnviar = screen.getByRole("button", { name: /enviar y borrar/i });
    fireEvent.click(btnEnviar);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/genesis/conectores/clave", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("sk-test-123"),
      }));
    });

    expect(await screen.findByText(/clave guardada/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/pega tu .* clave api aquí/i)).not.toBeInTheDocument();
  });

  it("maneja error al enviar clave", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockContexto })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    render(<AsistenteConectores ambito="cuenta" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));

    const tarjetaFreeKey = screen.getByText("Test Free Key · Modelo Cloud 1").closest("div[class*='rounded-xl']")!;
    const btnVincular = within(tarjetaFreeKey).getByRole("button", { name: /vincular/i });
    fireEvent.click(btnVincular);

    const inputClave = await screen.findByPlaceholderText(/pega tu .* clave api aquí/i);
    fireEvent.change(inputClave, { target: { value: "sk-test-123" } });

    fireEvent.click(screen.getByRole("button", { name: /enviar y borrar/i }));

    await waitFor(() => {
      expect(screen.getByText(/error al enviar la clave/i)).toBeInTheDocument();
    });
  });

  it("navegación anterior funciona entre pasos", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockContexto,
    });

    render(<AsistenteConectores ambito="cuenta" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));

    fireEvent.click(screen.getByLabelText(/seleccionar test local · modelo local 1/i));

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => screen.getByText(/paso 3 de 3/i));

    fireEvent.click(screen.getByRole("button", { name: /anterior/i }));
    await waitFor(() => screen.getByText("Paso 2 de 3"));
  });

  it("interruptores del paso 1 están presentes y tienen estado inicial", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockContexto,
    });

    render(<AsistenteConectores ambito="cuenta" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(3);

    const switchNeuronas = switches[0];
    expect(switchNeuronas).toHaveAttribute("aria-checked", "true");

    const switchCerebro = switches[1];
    expect(switchCerebro).toHaveAttribute("aria-checked", "true");

    const switchAstraura = switches[2];
    expect(switchAstraura).toHaveAttribute("aria-checked", "true");
  });

  it("muestra estado vacío honesto cuando no hay neuronas ni servidores", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        neuronas: [],
        servidoresCerebro: [],
        capaAstraura: { disponible: false, modo: "apagado" as const, personalidades: [] },
      }),
    });

    render(<AsistenteConectores ambito="cuenta" />);

    await waitFor(() => screen.getByText("Paso 1 de 3"));
    expect(await screen.findByText("No hay neuronas registradas en esta cuenta.")).toBeInTheDocument();
    expect(await screen.findByText("No hay servidores de cerebro vinculados.")).toBeInTheDocument();
  });
});