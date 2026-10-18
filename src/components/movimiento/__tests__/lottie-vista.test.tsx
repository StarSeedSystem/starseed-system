import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LottieVista } from "../lottie-vista";

describe("LottieVista", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debe renderizarse sin errores", () => {
    expect(
      render(<LottieVista src="/animacion.lottie" />)
    ).toBeTruthy();
  });
});