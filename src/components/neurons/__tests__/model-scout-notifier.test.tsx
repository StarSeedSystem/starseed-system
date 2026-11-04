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

vi.stubGlobal("addEventListener", vi.fn());
vi.stubGlobal("removeEventListener", vi.fn());

describe("ModelScoutNotifier", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  beforeEach(() => {
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
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockDetectCapabilities).toHaveBeenCalled();
    expect(mockScoutSignature).toHaveBeenCalled();
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith("abc123");
    expect(mockMarkScoutSeen).toHaveBeenCalledWith("abc123");
    expect(mockToast).toHaveBeenCalledWith(
      "Hay modelos que rinden mejor para tu equipo",
      expect.objectContaining({
        description: "Abre Astraura → Ajustes para ver las recomendaciones.",
      }),
    );
  });

  it("no avisa cuando la firma ya fue vista", async () => {
    mockHasNewScoutFindings.mockReturnValue(false);

    render(<ModelScoutNotifier />);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockDetectCapabilities).toHaveBeenCalled();
    expect(mockScoutSignature).toHaveBeenCalled();
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith("abc123");
    expect(mockMarkScoutSeen).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("no vuelve a avisar con la misma firma", async () => {
    localStorage.setItem("starseed.astraura.scout.sig.v1", "abc123");
    mockHasNewScoutFindings.mockReturnValue(false);

    render(<ModelScoutNotifier />);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockHasNewScoutFindings).not.toHaveBeenCalledWith("abc123");
  });

  it("actualiza la firma cuando cambia el hardware", async () => {
    localStorage.setItem("starseed.astraura.scout.sig.v1", "oldSig456");
    mockScoutSignature.mockReturnValue("newSig789");
    mockHasNewScoutFindings.mockReturnValue(true);

    render(<ModelScoutNotifier />);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockScoutSignature).toHaveBeenCalled();
    expect(mockHasNewScoutFindings).toHaveBeenCalledWith("newSig789");
    expect(mockMarkScoutSeen).toHaveBeenCalledWith("newSig789");
  });
});