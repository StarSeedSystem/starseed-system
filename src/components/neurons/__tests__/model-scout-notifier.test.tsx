// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModelScoutNotifier } from "@/components/neurons/model-scout-notifier";

const mockDetectCapabilities = vi.hoisted(() => vi.fn());
const mockScoutSignature = vi.hoisted(() => vi.fn());
const mockHasNewScoutFindings = vi.hoisted(() => vi.fn());
const mockMarkScoutSeen = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock("@/lib/neurons/neurons", () => ({
  detectCapabilities: mockDetectCapabilities,
}));

vi.mock("@/ai/astraura/model-scout", () => ({
  scoutSignature: mockScoutSignature,
  hasNewScoutFindings: mockHasNewScoutFindings,
  markScoutSeen: mockMarkScoutSeen,
}));

vi.mock("sonner", () => ({
  toast: {
    info: mockToast,
  },
}));

describe("ModelScoutNotifier", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockDetectCapabilities.mockResolvedValue({
      platform: "macOS",
      cores: 8,
      memoryGb: 16,
    });
    mockScoutSignature.mockReturnValue("abc123");
    mockHasNewScoutFindings.mockReturnValue(true);
    localStorage.clear();
  });

  it("avisa cuando la firma es nueva", async () => {
    mockHasNewScoutFindings.mockReturnValue(true);

    render(<ModelScoutNotifier />);
    await vi.runAllTimersAsync();

    expect(mockDetectCapabilities).toHaveBeenCalled();
    expect(mockScoutSignature).toHaveBeenCalled();
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith("abc123");
    expect(mockMarkScoutSeen).toHaveBeenCalledWith("abc123");
    expect(mockToast).toHaveBeenCalledWith(
      "Hay modelos que rinden mejor para tu equipo",
      expect.objectContaining({
        description: "Abre Neuronas para ver las recomendaciones.",
      }),
    );
  });

  it("no avisa cuando la firma ya fue vista", async () => {
    mockHasNewScoutFindings.mockReturnValue(false);

    render(<ModelScoutNotifier />);
    await vi.runAllTimersAsync();

    expect(mockDetectCapabilities).toHaveBeenCalled();
    expect(mockScoutSignature).toHaveBeenCalled();
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith("abc123");
    expect(mockMarkScoutSeen).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("no vuelve a avisar cuando la firma coincide con la guardada", async () => {
    const existingSig = "existingSig456";
    localStorage.setItem("starseed.astraura.scout.sig.v1", existingSig);
    mockScoutSignature.mockReturnValue(existingSig);
    mockHasNewScoutFindings.mockReturnValue(false);

    render(<ModelScoutNotifier />);
    await vi.runAllTimersAsync();

    expect(mockScoutSignature).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "macOS", cores: 8, memoryGb: 16 }),
      expect.any(Number),
    );
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith(existingSig);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("actualiza la firma cuando cambia el hardware", async () => {
    const oldSig = "oldSig456";
    localStorage.setItem("starseed.astraura.scout.sig.v1", oldSig);
    mockScoutSignature.mockReturnValue("newSig789");
    mockHasNewScoutFindings.mockReturnValue(true);

    render(<ModelScoutNotifier />);
    await vi.runAllTimersAsync();

    expect(mockScoutSignature).toHaveBeenCalled();
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith("newSig789");
    expect(mockMarkScoutSeen).toHaveBeenCalledWith("newSig789");
    expect(mockToast).toHaveBeenCalled();
  });
});