import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/lib/neurons/neurons", () => ({
  NEURON_EVENT: "starseed:neurons",
  settingsFor: vi.fn(() => ({
    fileRequests: true,
    screenVoice: true,
    auroraListening: true,
    role: "ambos",
    casaos: { enabled: false, url: "" },
    syncBrains: true,
    syncLibrary: true,
    syncNeurons: true,
    syncExternal: false,
    notes: "",
    icono: "desktop",
    colorPublico: "#007FFF",
  })),
  iconoElegido: vi.fn((v) => (["desktop", "laptop", "mobile", "tablet", "server", "other"].includes(v as any) ? v : null)),
  nombreEsteAparato: vi.fn(() => "Mi MacBook Pro"),
  resolverAliasEsteMedio: vi.fn(() => "device-1"),
  thisDeviceId: vi.fn(() => "device-1"),
  listNeurons: vi.fn(async () => [
    {
      id: "device-1",
      name: "MacBook Pro de Maggasukha",
      kind: "laptop",
      capabilities: {
        platform: "macOS",
        browser: "Chrome 131",
        aparato: { v: 1, medio: "navegador", so: "macOS", equipo: "MacBook Pro" },
        aparatos: { "device-1": { ts: Date.now(), n: "Mi MacBook Pro", medio: "navegador", so: "macOS", equipo: "MacBook Pro" } },
      },
      permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
      last_seen_at: new Date().toISOString(),
      isThisDevice: true,
      online: true,
    },
    {
      id: "device-2",
      name: "iPhone de Maggasukha",
      kind: "mobile",
      capabilities: {
        platform: "iOS",
        browser: "Safari 18",
        aparato: { v: 1, medio: "navegador", so: "iOS", equipo: "iPhone 16" },
        aparatos: { "device-2": { ts: Date.now() - 3600000, n: "iPhone de Maggasukha", medio: "navegador", so: "iOS", equipo: "iPhone 16" } },
      },
      permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
      last_seen_at: new Date(Date.now() - 3600000).toISOString(),
      isThisDevice: false,
      online: false,
    },
  ]),
  permissionsFor: vi.fn(() => ({ compute: true, storage: true, sync: true, agent: true, senses: true, wake: true })),
}));

vi.mock("@/lib/neurons/aparato-este-medio", () => ({
  aparatoDeEsteMedio: vi.fn(async () => ({ v: 1, medio: "navegador", so: "macOS", equipo: "MacBook Pro" })),
}));

import { FichaNeurona } from "../ficha-neurona";

function renderFicha(neuronaId = "device-1") {
  return render(<AppearanceProvider><FichaNeurona neuronaId={neuronaId} /></AppearanceProvider>);
}

describe("FichaNeurona", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("monta la ficha con una neurona de un aparato", async () => {
    renderFicha("device-1");
    await screen.findByText(/MacBook Pro de Maggasukha/);
    expect(screen.getByText(/Identidad/)).toBeInTheDocument();
    expect(screen.getByText(/Aparatos/)).toBeInTheDocument();
    expect(screen.getByText(/Permisos/)).toBeInTheDocument();
    expect(screen.getByText(/Papel en la red/)).toBeInTheDocument();
    expect(screen.getByText(/Salud/)).toBeInTheDocument();
  });

  it("monta la ficha con una neurona de dos aparatos", async () => {
    renderFicha("device-2");
    await screen.findByText(/iPhone de Maggasukha/);
    expect(screen.getByText(/Identidad/)).toBeInTheDocument();
    expect(screen.getByText(/Aparatos/)).toBeInTheDocument();
  });

  it("las secciones son plegables", async () => {
    renderFicha("device-1");
    const identidadBtn = screen.getByRole("button", { name: /Identidad/ });
    await userEvent.click(identidadBtn);
    expect(screen.queryByText(/Nombre de la neurona/)).not.toBeInTheDocument();
    await userEvent.click(identidadBtn);
    expect(await screen.findByText(/Nombre de la neurona/)).toBeInTheDocument();
  });

  it("buscador filtra secciones", async () => {
    renderFicha("device-1");
    const search = screen.getByPlaceholderText(/Buscar en la ficha/);
    await userEvent.type(search, "color");
    expect(screen.getByText(/Color público/)).toBeInTheDocument();
    expect(screen.queryByText(/Nombre de la neurona/)).not.toBeInTheDocument();
    await userEvent.clear(search);
    expect(await screen.findByText(/Nombre de la neurona/)).toBeInTheDocument();
  });

  it("no usa truncate/line-clamp/whitespace-nowrap en botones", () => {
    const { container } = renderFicha("device-1");
    const buttons = container.querySelectorAll("button, [role=button]");
    buttons.forEach((btn) => {
      const className = btn.className || "";
      expect(className).not.toContain("truncate");
      expect(className).not.toContain("line-clamp");
      expect(className).not.toContain("whitespace-nowrap");
    });
  });

  it("tiene cursor-pointer en elementos clicables", () => {
    const { container } = renderFicha("device-1");
    const clickables = container.querySelectorAll("button, [role=button], a, summary, [onClick]");
    clickables.forEach((el) => {
      const className = el.className || "";
      expect(className).toContain("cursor-pointer");
    });
  });
});