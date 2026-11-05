import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({ success: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => ctl.success(...a) } }));

import {
  ModelScoutNotifier,
  NEURONAS_PATH,
  debeAvisarScoutNovedades,
  resumenAvisoScout,
} from "../model-scout-notifier";
import { SCOUT_SIGNATURE_KEY } from "@/ai/astraura/model-scout";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const CAPS: NeuronCapabilities = {
  platform: "macOS",
  gpuRenderer: "Apple M2",
  memoryGb: 16,
  cores: 8,
  webgpu: true,
};

describe("debeAvisarScoutNovedades", () => {
  it("avisa con una firma nueva", () => {
    expect(debeAvisarScoutNovedades("16.abc", null)).toBe(true);
    expect(debeAvisarScoutNovedades("16.abc", "15.xyz")).toBe(true);
  });

  it("no avisa si la firma es la misma o está vacía", () => {
    expect(debeAvisarScoutNovedades("16.abc", "16.abc")).toBe(false);
    expect(debeAvisarScoutNovedades("", null)).toBe(false);
  });
});

describe("resumenAvisoScout", () => {
  it("usa el resumen del scout cuando existe", () => {
    expect(resumenAvisoScout({ summary: "Tu equipo puede con X" })).toBe("Tu equipo puede con X");
  });

  it("cae a la frase fija sin resumen", () => {
    expect(resumenAvisoScout(null)).toMatch(/Aurora revisó/);
  });
});

describe("ModelScoutNotifier", () => {
  beforeEach(() => {
    localStorage.clear();
    ctl.success.mockReset();
  });

  afterEach(cleanup);

  it("avisa una vez por firma nueva y no repite con la misma", async () => {
    const primera = render(<ModelScoutNotifier caps={CAPS} />);
    await waitFor(() => expect(ctl.success).toHaveBeenCalledTimes(1));

    expect(localStorage.getItem(SCOUT_SIGNATURE_KEY)).toBeTruthy();
    expect(ctl.success.mock.calls[0][1]).toMatchObject({
      action: { label: "Ver en Neuronas" },
    });

    primera.unmount();
    render(<ModelScoutNotifier caps={CAPS} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctl.success).toHaveBeenCalledTimes(1);
  });

  it("vuelve a avisar cuando cambia la firma", async () => {
    render(<ModelScoutNotifier caps={CAPS} />);
    await waitFor(() => expect(ctl.success).toHaveBeenCalledTimes(1));
    cleanup();

    render(<ModelScoutNotifier caps={{ ...CAPS, memoryGb: 32 }} />);
    await waitFor(() => expect(ctl.success).toHaveBeenCalledTimes(2));
  });

  it("navega a Neuronas al pulsar el enlace", async () => {
    const ir = vi.fn();
    render(<ModelScoutNotifier caps={CAPS} onIrANeuronas={ir} />);
    await waitFor(() => expect(ctl.success).toHaveBeenCalledTimes(1));

    const opciones = ctl.success.mock.calls[0][1] as { action: { onClick: () => void } };
    opciones.action.onClick();
    expect(ir).toHaveBeenCalledTimes(1);
    expect(NEURONAS_PATH).toBe("/agent?tab=neuronas");
  });
});
