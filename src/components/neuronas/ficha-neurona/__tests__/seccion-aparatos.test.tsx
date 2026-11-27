import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/lib/neurons/neurons", () => ({
  NEURON_EVENT: "starseed:neurons",
  nombreEsteAparato: vi.fn(() => "Mi MacBook Pro"),
  resolverAliasEsteMedio: vi.fn(() => "device-1"),
  thisDeviceId: vi.fn(() => "device-1"),
  listNeurons: vi.fn(async () => [
    {
      id: "device-1",
      name: "MacBook Pro de Maggasukha",
      kind: "laptop",
      capabilities: {
        aparatos: {
          "device-1": { ts: Date.now(), n: "Mi MacBook Pro", medio: "navegador", so: "macOS", equipo: "MacBook Pro" },
          "device-3": { ts: Date.now() - 86400000, n: "Monitor externo", medio: "navegador", so: "macOS", equipo: "LG UltraFine" },
        },
      },
    },
    {
      id: "device-2",
      name: "iPhone de Maggasukha",
      kind: "mobile",
      capabilities: {
        aparatos: {
          "device-2": { ts: Date.now() - 3600000, n: "iPhone de Maggasukha", medio: "navegador", so: "iOS", equipo: "iPhone 16" },
        },
      },
    },
  ]),
  cambiarNeuronaDeEsteAparato: vi.fn(async () => ({ ok: true, anterior: "device-1", nueva: "device-2" })),
  renombrarEsteAparato: vi.fn(async () => true),
}));

vi.mock("@/lib/neurons/aparato-este-medio", () => ({
  aparatoDeEsteMedio: vi.fn(async () => ({ v: 1, medio: "navegador", so: "macOS", equipo: "MacBook Pro" })),
}));

vi.mock("@/lib/neurons/aparatos-de-neurona", () => ({
  neuronasParaElegir: vi.fn((filas, idActual) =>
    filas
      .filter((f) => !f.capabilities?.fusionada)
      .map((f) => ({
        id: f.id,
        nombre: f.name || "Sin nombre",
        aparatos: [
          { id: "device-1", nombre: "Mi MacBook Pro", medio: "navegador", so: "macOS", equipo: "MacBook Pro", visto: Date.now() },
          { id: "device-3", nombre: "Monitor externo", medio: "navegador", so: "macOS", equipo: "LG UltraFine", visto: Date.now() - 86400000 },
        ],
        esActual: f.id === idActual,
        variosAparatos: true,
      }))
  ),
  textoUltimaVez: vi.fn((visto) => `vista hace ${Math.floor((Date.now() - visto) / 60000)} min`),
}));

import { SeccionAparatos } from "../seccion-aparatos";

function renderSeccion(neuronaId = "device-1") {
  return render(
    <AppearanceProvider>
      <SeccionAparatos
        neurona={{
          id: neuronaId,
          name: neuronaId === "device-1" ? "MacBook Pro de Maggasukha" : "iPhone de Maggasukha",
          kind: neuronaId === "device-1" ? "laptop" : "mobile",
          capabilities: {
            aparatos: neuronaId === "device-1" ? {
              "device-1": { ts: Date.now(), n: "Mi MacBook Pro", medio: "navegador", so: "macOS", equipo: "MacBook Pro" },
              "device-3": { ts: Date.now() - 86400000, n: "Monitor externo", medio: "navegador", so: "macOS", equipo: "LG UltraFine" },
            } : {
              "device-2": { ts: Date.now() - 3600000, n: "iPhone de Maggasukha", medio: "navegador", so: "iOS", equipo: "iPhone 16" },
            },
          },
        }}
        esEsta={neuronaId === "device-1"}
      />
    </AppearanceProvider>
  );
}

describe("SeccionAparatos", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lista los aparatos de la neurona con nombre, sistema, medio y última vez", async () => {
    renderSeccion("device-1");
    await screen.findByText(/Aparatos de esta neurona/);
    expect(screen.getByText(/Mi MacBook Pro/)).toBeInTheDocument();
    expect(screen.getByText(/macOS/)).toBeInTheDocument();
    expect(screen.getByText(/navegador/)).toBeInTheDocument();
    expect(screen.getByText(/vista hace/)).toBeInTheDocument();
    expect(screen.getByText(/Monitor externo/)).toBeInTheDocument();
    expect(screen.getByText(/LG UltraFine/)).toBeInTheDocument();
  });

  it("neurona con un solo aparato muestra solo ese", async () => {
    renderSeccion("device-2");
    await screen.findByText(/Aparatos de esta neurona/);
    expect(screen.getByText(/iPhone de Maggasukha/)).toBeInTheDocument();
    expect(screen.queryByText(/Monitor externo/)).not.toBeInTheDocument();
  });

  it("permite renombrar un aparato", async () => {
    const { renombrarEsteAparato } = await import("@/lib/neurons/neurons");
    renderSeccion("device-1");
    await screen.findByText(/Aparatos de esta neurona/);
    await userEvent.click(screen.getByRole("button", { name: /Renombrar.*Mi MacBook Pro/ }));
    const input = await screen.findByDisplayValue("Mi MacBook Pro");
    await userEvent.clear(input);
    await userEvent.type(input, "MacBook renombrado");
    await userEvent.tab();
    expect(renombrarEsteAparato).toHaveBeenCalledWith("MacBook renombrado");
  });

  it("muestra botón separar en neurona propia cuando hay varios aparatos", async () => {
    renderSeccion("device-1");
    await screen.findByText(/Aparatos de esta neurona/);
    expect(screen.getByRole("button", { name: /Separar en neurona propia/ })).toBeInTheDocument();
  });

  it("muestra botón unir a otra neurona", async () => {
    renderSeccion("device-1");
    await screen.findByText(/Aparatos de esta neurona/);
    expect(screen.getByRole("button", { name: /Unir a otra neurona/ })).toBeInTheDocument();
  });

  it("separar en neurona propia llama a cambiarNeuronaDeEsteAparato con destino null", async () => {
    const { cambiarNeuronaDeEsteAparato } = await import("@/lib/neurons/neurons");
    renderSeccion("device-1");
    await screen.findByText(/Aparatos de esta neurona/);
    await userEvent.click(screen.getByRole("button", { name: /Separar en neurona propia/ }));
    await userEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(cambiarNeuronaDeEsteAparato).toHaveBeenCalledWith(null, expect.any(String));
  });

  it("unir a otra neurona muestra lista y confirma", async () => {
    const { cambiarNeuronaDeEsteAparato } = await import("@/lib/neurons/neurons");
    renderSeccion("device-1");
    await screen.findByText(/Aparatos de esta neurona/);
    await userEvent.click(screen.getByRole("button", { name: /Unir a otra neurona/ }));
    await screen.findByText(/iPhone de Maggasukha/);
    await userEvent.click(screen.getByRole("button", { name: /Elegir.*iPhone de Maggasukha/ }));
    await userEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(cambiarNeuronaDeEsteAparato).toHaveBeenCalledWith("device-2", undefined);
  });

  it("no usa truncate/line-clamp/whitespace-nowrap en botones", () => {
    const { container } = renderSeccion("device-1");
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      const className = btn.className || "";
      expect(className).not.toContain("truncate");
      expect(className).not.toContain("line-clamp");
      expect(className).not.toContain("whitespace-nowrap");
    });
  });

  it("tiene cursor-pointer en elementos clicables", () => {
    const { container } = renderSeccion("device-1");
    const clickables = container.querySelectorAll("button, [role=button], summary");
    clickables.forEach((el) => {
      const className = el.className || "";
      expect(className).toContain("cursor-pointer");
    });
  });
});