// @vitest-environment jsdom
/**
 * CAP1125D · un nodo Linux sin monitor conectado no monta adornos pesados.
 *
 * El estado lo mide la app nativa (`sinPantalla`) y lo publica en el canal de energía. Aquí se comprueba que la
 * compuerta de fondos pesados lo usa: sin pantalla no se montan; si hay control remoto o transmisión viva, sí
 * (quien mira la pantalla la ve aunque no haya monitor). Solo tiempo de ejecución: no cambia el modo elegido.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { PerfHeavyOnly } from "@/components/perf/perf-gate";
import { actualizarEnergia, setPerfMode } from "@/lib/perf/device-tier";
import type { EstadoEnergia, TareaPesada } from "@/lib/perf/modo-rendimiento";

function estado(extra: Partial<EstadoEnergia> = {}): EstadoEnergia {
  return {
    sistema: "linux",
    bateriaPct: null,
    cargando: null,
    ahorroSistema: false,
    modoBajoConsumo: false,
    perfilEnergia: null,
    temperaturaC: null,
    tareasPesadas: [],
    ...extra,
  };
}

function adornos(tareas: readonly TareaPesada[] = []): void {
  actualizarEnergia(estado({ sinPantalla: true, tareasPesadas: tareas }));
}

function montar(): void {
  render(
    <PerfHeavyOnly>
      <div data-testid="adorno" />
    </PerfHeavyOnly>,
  );
}

describe("CAP1125D · adornos pesados cuando no hay pantalla", () => {
  beforeEach(() => {
    setPerfMode("alto"); // sin pantalla manda aunque el modo no tenga tope
    actualizarEnergia(null);
  });

  afterEach(() => {
    cleanup();
    actualizarEnergia(null);
    window.localStorage.clear();
  });

  it("sin monitor y sin nadie mirando no monta los fondos pesados", () => {
    adornos();
    montar();
    expect(screen.queryByTestId("adorno")).toBeNull();
  });

  it("con pantalla conectada sí los monta", () => {
    actualizarEnergia(estado({ sinPantalla: false }));
    montar();
    expect(screen.queryByTestId("adorno")).not.toBeNull();
  });

  it("sin dato de pantalla (ausente) se comporta como hoy: los monta", () => {
    actualizarEnergia(estado());
    montar();
    expect(screen.queryByTestId("adorno")).not.toBeNull();
  });

  it("una sesión de control remoto los vuelve a montar: quien controla sí ve la pantalla", () => {
    adornos(["control-remoto"]);
    montar();
    expect(screen.queryByTestId("adorno")).not.toBeNull();
  });

  it("una transmisión viva también los monta; una llamada sola no", () => {
    adornos(["transmision"]);
    montar();
    expect(screen.queryByTestId("adorno")).not.toBeNull();
    cleanup();
    adornos(["llamada"]);
    montar();
    expect(screen.queryByTestId("adorno")).toBeNull();
  });

  it("al terminar el control vuelven a ocultarse sin cambiar el modo elegido", () => {
    adornos(["control-remoto"]);
    montar();
    expect(screen.queryByTestId("adorno")).not.toBeNull();
    act(() => {
      actualizarEnergia(estado({ sinPantalla: true }));
    });
    expect(screen.queryByTestId("adorno")).toBeNull();
    expect(window.localStorage.getItem("starseed.perf.v1")).toBe("alto");
  });
});
