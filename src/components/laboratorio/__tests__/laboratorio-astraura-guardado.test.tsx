import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El mapa 3D (WebGL) y las piezas pesadas no importan aquí: solo el aviso «Guardado».
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/laboratorio/inspector-nodo", () => ({ InspectorNodo: () => null }));
vi.mock("@/components/laboratorio/comparador-versiones", () => ({ ComparadorVersiones: () => null }));
// Button/Card/Tabs leen la apariencia: un valor mínimo basta (modo plano, sin cristal).
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } },
  }),
}));
vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
  detectarCapacidades: () => new Promise(() => undefined),
}));

import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { LaboratorioAstraura } from "../laboratorio-astraura";

function montar() {
  return render(
    <ConfirmProvider>
      <LaboratorioAstraura />
    </ConfirmProvider>,
  );
}

const guardar = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const estado = () => screen.getByRole("status");

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LaboratorioAstraura · aviso «Guardado»", () => {
  it("la región viva existe desde el principio, es cortés y está vacía", () => {
    montar();
    expect(estado().getAttribute("aria-live")).toBe("polite");
    expect(estado().textContent).toBe("");
  });

  it("anuncia «Guardado» al guardar y lo retira a los 3 s", () => {
    montar();
    guardar();
    expect(estado().textContent).toBe("Guardado");

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(estado().textContent).toBe("Guardado");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(estado().textContent).toBe("");
  });

  it("guardar de nuevo reinicia la cuenta atrás", () => {
    montar();
    guardar();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    guardar();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // 4 s desde el primer guardado, pero solo 2 s desde el segundo: sigue visible.
    expect(estado().textContent).toBe("Guardado");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(estado().textContent).toBe("");
  });

  it("al desmontar limpia el temporizador de 3 s", () => {
    const poner = vi.spyOn(globalThis, "setTimeout");
    const quitar = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = montar();
    guardar();

    const i = poner.mock.calls.findIndex(([, ms]) => ms === 3000);
    expect(i).toBeGreaterThanOrEqual(0);
    const idDelAviso = poner.mock.results[i].value;

    unmount();
    expect(quitar).toHaveBeenCalledWith(idDelAviso);
  });
});
