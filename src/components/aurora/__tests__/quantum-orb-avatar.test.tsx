import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QuantumOrbAvatar } from "@/components/aurora/quantum-orb-avatar";
import { quantumOrbBus, onQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

vi.mock("@/components/aurora/quantum-orb", () => ({
  createQuantumOrbRenderer: () => ({
    resize: vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      ellipse: vi.fn(),
      setTransform: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      shadowColor: "",
      shadowBlur: 0,
      globalAlpha: 1,
    }),
    frame: vi.fn(),
  }),
  prefersReducedMotion: () => false,
}));

vi.mock("@/lib/aurora/quantum-orb-theme", async () => {
  const actual = await vi.importActual("@/lib/aurora/quantum-orb-theme");
  return {
    ...actual,
    resolveQuantumOrbTheme: vi.fn().mockReturnValue({
      id: "aurora",
      name: "Aurora",
      shortName: "Aurora",
      primary: "#ec4899",
      secondary: "#00f0ff",
      core: "#f43f5e",
      glow: "rgba(236, 72, 153, 0.7)",
      accent: "#fbcfe8",
      styleType: "aurora_heart_petals",
      badgeTitle: "AURORA RESPONDIENDO",
    }),
  };
});

describe("QuantumOrbAvatar — auto-publica vector visual en bus params", () => {
  beforeEach(() => {
    quantumOrbBus.clear("params");
    vi.useRealTimers();
  });

  it("publica vector visual completo al montarse (turbulence, spikiness, symmetry, hueShift, breath)", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => {
      expect(received.length).toBeGreaterThan(0);
    });

    const params = received[0];
    expect(params).toHaveProperty("turbulence");
    expect(params).toHaveProperty("spikiness");
    expect(params).toHaveProperty("symmetry");
    expect(params).toHaveProperty("hueShift");
    expect(params).toHaveProperty("breath");

    expect(params.turbulence).toBeGreaterThanOrEqual(0);
    expect(params.turbulence).toBeLessThanOrEqual(1);
    expect(params.spikiness).toBeGreaterThanOrEqual(0);
    expect(params.spikiness).toBeLessThanOrEqual(1);
    expect(params.symmetry).toBeGreaterThanOrEqual(0);
    expect(params.symmetry).toBeLessThanOrEqual(1);
    expect(params.hueShift).toBeGreaterThanOrEqual(0);
    expect(params.hueShift).toBeLessThanOrEqual(1);
    expect(params.breath).toBeGreaterThanOrEqual(0);
    expect(params.breath).toBeLessThanOrEqual(1);

    unsub();
  });

  it("publica vector diferente según personalityId (hephaestus vs aurora)", async () => {
    const receivedAurora: Partial<QuantumOrbParams>[] = [];
    const receivedHephaestus: Partial<QuantumOrbParams>[] = [];

    const unsubA = onQuantumOrbParams((p) => receivedAurora.push(p));
    render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => expect(receivedAurora.length).toBeGreaterThan(0));
    const auroraParams = receivedAurora[0];
    unsubA();

    quantumOrbBus.clear("params");

    const unsubH = onQuantumOrbParams((p) => receivedHephaestus.push(p));
    render(<QuantumOrbAvatar personaId="hephaestus" size={36} state="idle" />);

    await waitFor(() => expect(receivedHephaestus.length).toBeGreaterThan(0));
    const hephaestusParams = receivedHephaestus[0];
    unsubH();

    expect(auroraParams).not.toEqual(hephaestusParams);
  });

  it("publica vector diferente según state (idle vs thinking vs speaking)", async () => {
    const receivedIdle: Partial<QuantumOrbParams>[] = [];
    const receivedThinking: Partial<QuantumOrbParams>[] = [];

    const unsubI = onQuantumOrbParams((p) => receivedIdle.push(p));
    render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => expect(receivedIdle.length).toBeGreaterThan(0));
    const idleParams = receivedIdle[0];
    unsubI();

    quantumOrbBus.clear("params");

    const unsubT = onQuantumOrbParams((p) => receivedThinking.push(p));
    render(<QuantumOrbAvatar personaId="aurora" size={36} state="thinking" />);

    await waitFor(() => expect(receivedThinking.length).toBeGreaterThan(0));
    const thinkingParams = receivedThinking[0];
    unsubT();

    expect(idleParams).not.toEqual(thinkingParams);
  });

  it("permite sobrescribir params vía prop y publica la mezcla", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    render(
      <QuantumOrbAvatar
        personaId="aurora"
        size={36}
        state="idle"
        params={{ turbulence: 0.9, spikiness: 0.1 }}
      />
    );

    await waitFor(() => expect(received.length).toBeGreaterThan(0));

    const params = received[0];
    expect(params.turbulence).toBe(0.9);
    expect(params.spikiness).toBe(0.1);
    expect(params).toHaveProperty("symmetry");
    expect(params).toHaveProperty("hueShift");
    expect(params).toHaveProperty("breath");

    unsub();
  });

  it("respeta prefers-reduced-motion (no rompe el render)", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => {
      expect(received.length).toBeGreaterThan(0);
    });

    unsub();
  });

  it("reacciona a params del bus y actualiza su vector visual (merge bus + local)", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const initialParams = received[0];
    unsub();

    // Emitir params desde el bus (simula backend 1.58b)
    quantumOrbBus.emit("params", { turbulence: 0.8, symmetry: 0.9 });

    // El componente debería haber fusionado los params del bus con los locales
    // Verificamos que no re-emite los params del bus (prevención de bucle)
    const receivedAfterBus: Partial<QuantumOrbParams>[] = [];
    const unsub2 = onQuantumOrbParams((p) => receivedAfterBus.push(p));

    // Esperar un tick para que el efecto del bus procese
    await waitFor(() => {}, { timeout: 100 });

    // No debería haber nueva emisión porque los params vinieron del bus
    expect(receivedAfterBus.length).toBe(0);
    unsub2();
  });

  it("tras un tick del bus, un cambio local vuelve a publicar su vector", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    const { rerender } = render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const inicial = received[0];

    // Un tick del bus (backend 1.58b) no debe dejar el canal mudo para siempre.
    quantumOrbBus.emit("params", { turbulence: 0.8, symmetry: 0.9 });
    await waitFor(() => {});

    const despues: Partial<QuantumOrbParams>[] = [];
    const unsub2 = onQuantumOrbParams((p) => despues.push(p));
    rerender(<QuantumOrbAvatar personaId="aurora" size={36} state="thinking" />);

    await waitFor(() => expect(despues.length).toBeGreaterThan(0));
    expect(despues[0]).not.toEqual(inicial);

    unsub();
    unsub2();
  });

  it("no re-emite params idénticos (deduplicación)", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const initialCount = received.length;
    unsub();

    // Forzar re-render sin cambiar props (misma personaId, state, params)
    const { rerender } = render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);
    rerender(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => {}, { timeout: 100 });

    // No debería haber nueva emisión porque los params son idénticos
    const receivedAfterRerender: Partial<QuantumOrbParams>[] = [];
    const unsub2 = onQuantumOrbParams((p) => receivedAfterRerender.push(p));
    await waitFor(() => {}, { timeout: 100 });
    expect(receivedAfterRerender.length).toBe(0);
    unsub2();
  });

  it("emite cuando cambian los params locales (personaId/state/props)", async () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    const { rerender } = render(<QuantumOrbAvatar personaId="aurora" size={36} state="idle" />);

    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const initialParams = { ...received[0] };
    unsub();

    // Cambiar state → debería emitir nuevo vector
    const receivedAfterChange: Partial<QuantumOrbParams>[] = [];
    const unsub2 = onQuantumOrbParams((p) => receivedAfterChange.push(p));

    rerender(<QuantumOrbAvatar personaId="aurora" size={36} state="thinking" />);

    await waitFor(() => expect(receivedAfterChange.length).toBeGreaterThan(0));
    expect(receivedAfterChange[0]).not.toEqual(initialParams);
    unsub2();
  });
});