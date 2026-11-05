import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

describe("UpdateBanner", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("no muestra nada si no hay evento de actualización", async () => {
    const { default: UpdateBanner } = await import("../update-banner");
    render(<UpdateBanner />);
    expect(screen.queryByText("Nueva versión lista")).not.toBeInTheDocument();
  });

  it("se muestra cuando recibe el evento starseed:update-ready", async () => {
    const { default: UpdateBanner } = await import("../update-banner");
    render(<UpdateBanner />);

    window.dispatchEvent(new CustomEvent("starseed:update-ready"));

    expect(await screen.findByText("Nueva versión lista")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("ofrece aplicar la actualización al pulsar el botón", async () => {
    const { default: UpdateBanner } = await import("../update-banner");
    const applySpy = vi.fn();
    (window as unknown as { STARSEED_APPLY_UPDATE: typeof applySpy }).STARSEED_APPLY_UPDATE = applySpy;

    render(<UpdateBanner />);
    window.dispatchEvent(new CustomEvent("starseed:update-ready"));

    const aplicarBtn = await screen.findByRole("button", { name: /aplicar/i });
    fireEvent.click(aplicarBtn);

    expect(applySpy).toHaveBeenCalledTimes(1);
  });

  it("pierde visible al pulsar «Ahora no»", async () => {
    const { default: UpdateBanner } = await import("../update-banner");
    render(<UpdateBanner />);

    window.dispatchEvent(new CustomEvent("starseed:update-ready"));

    await screen.findByText("Nueva versión lista");

    const cerrarBtn = screen.getByRole("button", { name: "Ahora no" });
    fireEvent.click(cerrarBtn);

    expect(screen.queryByText("Nueva versión lista")).not.toBeInTheDocument();
  });
});