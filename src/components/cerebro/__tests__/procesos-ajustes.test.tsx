import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import { ProcesosAjustesContenido } from "../procesos-ajustes";

expect.extend(matchers);
afterEach(cleanup);

beforeEach(() => {
  vi.resetModules();
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

function montarProcesos(seccion: "general" | "privacidad" | "sincronia" | "avanzado" = "general", brainId: string | null = null) {
  const onCambio = vi.fn();
  render(
    <AppearanceProvider>
      <ProcesosAjustesContenido seccion={seccion} brainId={brainId} onCambio={onCambio} />
    </AppearanceProvider>,
  );
  return { onCambio };
}

describe("ProcesosAjustesContenido", () => {
  it("muestra 'Tipos visibles', 'Intervalo de monitoreo' y 'Servidores ocultos' en General", () => {
    montarProcesos("general");
    expect(screen.getByText("Tipos visibles")).toBeInTheDocument();
    expect(screen.getByText("Intervalo de monitoreo")).toBeInTheDocument();
    expect(screen.getByText("Servidores ocultos")).toBeInTheDocument();
    expect(screen.getAllByText("Genesis")).toHaveLength(2);
    expect(screen.getAllByText("PoliGenesis")).toHaveLength(2);
  });

  it("muestra mensaje informativo en Privacidad y permisos (no aplica a procesos)", () => {
    montarProcesos("privacidad");
    expect(screen.getByText(/privacidad y permisos se configuran por cerebro/i)).toBeInTheDocument();
  });

  it("muestra mensaje informativo en Sincronía (no aplica a procesos)", () => {
    montarProcesos("sincronia");
    expect(screen.getByText(/sincronización de procesos se gestiona automáticamente/i)).toBeInTheDocument();
  });

  it("muestra 'Umbrales de aviso' y 'Límites por cerebro' en Avanzado", () => {
    montarProcesos("avanzado", "brain-123");
    expect(screen.getByText("Umbrales de aviso")).toBeInTheDocument();
    expect(screen.getByText("Límites por cerebro")).toBeInTheDocument();
    expect(screen.getByText("CPU máx. (%)")).toBeInTheDocument();
    expect(screen.getByText("RAM máx. (MB)")).toBeInTheDocument();
  });

  it("no muestra 'Límites por cerebro' en Avanzado sin brainId", () => {
    montarProcesos("avanzado", null);
    expect(screen.getByText("Umbrales de aviso")).toBeInTheDocument();
    expect(screen.queryByText("Límites por cerebro")).toBeNull();
  });

  it("cambia el intervalo al mover el slider", () => {
    const { onCambio } = montarProcesos("general");
    const slider = screen.getByLabelText("Intervalo (segundos)");
    fireEvent.change(slider, { target: { value: "30" } });
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ intervaloSeg: 30 }));
  });

  it("alterna tipos visibles al hacer clic en el primer Genesis (Tipos visibles)", () => {
    const { onCambio } = montarProcesos("general");
    const genesisToggles = screen.getAllByLabelText("Genesis");
    fireEvent.click(genesisToggles[0]);
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ tipos: expect.arrayContaining(["genesis"]) }));
  });
});