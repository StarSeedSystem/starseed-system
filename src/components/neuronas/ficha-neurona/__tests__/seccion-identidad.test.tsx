import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";

vi.mock("@/lib/neurons/neurons", () => ({
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
    notes: "Notas de prueba",
    icono: "laptop",
    colorPublico: "#007FFF",
  })),
  iconoElegido: vi.fn((v) => (["desktop", "laptop", "mobile", "tablet", "server", "other"].includes(v as any) ? v : null)),
  setNeuronSettings: vi.fn(),
  setNeuronKind: vi.fn(),
  thisDeviceId: vi.fn(() => "device-1"),
}));

import { SeccionIdentidad } from "../seccion-identidad";

function renderSeccion() {
  return render(
    <AppearanceProvider>
      <SeccionIdentidad
        neurona={{
          id: "device-1",
          name: "MacBook Pro de Maggasukha",
          kind: "laptop",
          capabilities: { platform: "macOS", browser: "Chrome 131" },
        }}
        nombreAparato="Mi MacBook Pro"
        esEsta={true}
      />
    </AppearanceProvider>
  );
}

describe("SeccionIdentidad", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("muestra nombre de la neurona editable", async () => {
    renderSeccion();
    expect(screen.getByText(/Nombre de la neurona/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("MacBook Pro de Maggasukha")).toBeInTheDocument();
  });

  it("muestra nombre de este aparato editable", async () => {
    renderSeccion();
    expect(screen.getByText(/Nombre de este aparato/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mi MacBook Pro")).toBeInTheDocument();
  });

  it("muestra selector de tipo/icono", async () => {
    renderSeccion();
    expect(screen.getByText(/Tipo \/ Icono/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Portátil/ })).toBeInTheDocument();
  });

  it("muestra selector de color público", async () => {
    renderSeccion();
    expect(screen.getByText(/Color público/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("#007FFF")).toBeInTheDocument();
  });

  it("muestra campo de foto/avatar", async () => {
    renderSeccion();
    expect(screen.getByText(/Foto/)).toBeInTheDocument();
  });

  it("guarda cambios al editar nombre de la neurona", async () => {
    const { setNeuronSettings } = await import("@/lib/neurons/neurons");
    renderSeccion();
    const input = screen.getByDisplayValue("MacBook Pro de Maggasukha");
    await userEvent.clear(input);
    await userEvent.type(input, "Nuevo nombre");
    await userEvent.tab();
    expect(setNeuronSettings).toHaveBeenCalledWith("device-1", expect.objectContaining({ name: "Nuevo nombre" }));
  });

  it("guarda cambios al editar nombre del aparato", async () => {
    const { renombrarEsteAparato } = await import("@/lib/neurons/neurons");
    vi.mocked(renombrarEsteAparato).mockResolvedValue(true);
    renderSeccion();
    const input = screen.getByDisplayValue("Mi MacBook Pro");
    await userEvent.clear(input);
    await userEvent.type(input, "Nuevo aparato");
    await userEvent.tab();
    expect(renombrarEsteAparato).toHaveBeenCalledWith("Nuevo aparato");
  });

  it("cambia el tipo/icono al seleccionar otro", async () => {
    const { setNeuronKind } = await import("@/lib/neurons/neurons");
    renderSeccion();
    await userEvent.click(screen.getByRole("button", { name: /Móvil/ }));
    expect(setNeuronKind).toHaveBeenCalledWith("device-1", "mobile");
  });

  it("no usa truncate/line-clamp/whitespace-nowrap en botones", () => {
    const { container } = renderSeccion();
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      const className = btn.className || "";
      expect(className).not.toContain("truncate");
      expect(className).not.toContain("line-clamp");
      expect(className).not.toContain("whitespace-nowrap");
    });
  });

  it("tiene cursor-pointer en elementos clicables", () => {
    const { container } = renderSeccion();
    const clickables = container.querySelectorAll("button, [role=button], summary");
    clickables.forEach((el) => {
      const className = el.className || "";
      expect(className).toContain("cursor-pointer");
    });
  });
});