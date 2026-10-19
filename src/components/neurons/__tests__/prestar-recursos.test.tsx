import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PrestarRecursosPanel } from "@/components/neurons/prestar-recursos";

describe("PrestarRecursosPanel", () => {
  beforeEach(() => {
    vi.mock("@/lib/neurons/neurons", () => ({
      detectCapabilities: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("renders the panel with default toggles checked", async () => {
    // We need to access the mock to set its implementation
    const detectCapabilitiesMock = require("@/lib/neurons/neurons").detectCapabilities;
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);

    // Wait for the capabilities to be fetched
    await screen.findByText(/Prestar recursos/i);

    // Check that the computacion toggle is checked by default
    const computacionButton = screen.getByRole("button", {
      name: /dejar que mis otras neuronas usen esta para calcular/i,
    });
    expect(computacionButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/); // active state

    // Check that the almacenamiento toggle is checked by default
    const almacenamientoButton = screen.getByRole("button", {
      name: /prestar espacio/i,
    });
    expect(almacenamientoButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);
  });

  it("toggles the computacion button", async () => {
    const detectCapabilitiesMock = require("@/lib/neurons/neurons").detectCapabilities;
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const computacionButton = screen.getByRole("button", {
      name: /dejar que mis otras neuronas usen esta para calcular/i,
    });

    // Initially checked
    expect(computacionButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    // Click to toggle off
    fireEvent.click(computacionButton);
    // Now unchecked
    expect(computacionButton).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);
    expect(computacionButton).toHaveClass(/bg-white\/\[0\.04\]/);

    // Click again to toggle on
    fireEvent.click(computacionButton);
    expect(computacionButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);
  });

  it("allows adding an app to the list", async () => {
    const detectCapabilitiesMock = require("@/lib/neurons/neurons").detectCapabilities;
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    // Click the apps toggle to enable it (if not already enabled by default)
    const appsToggle = screen.getByRole("button", {
      name: /apps que otras neuronas pueden abrir desde aquí/i,
    });
    // Initially, apps array is empty, so toggle is off
    expect(appsToggle).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);
    fireEvent.click(appsToggle);
    // Now toggle is on (but note: our toggle logic doesn't change state when turning on, only when turning off)
    // We'll just proceed to add an app.

    // Find the input and button
    const input = screen.getByPlaceholderText(/nombre de la app/i);
    const addButton = screen.getByRole("button", { name: /añadir/i });

    // Type an app name and press Enter
    fireEvent.change(input, { target: { value: "test-app" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Alternatively, click the button
    // fireEvent.click(addButton);

    // Check that the app appears in the list
    expect(screen.getByText(/test-app/i)).toBeInTheDocument();

    // Check that we can remove the app
    const removeButton = screen.getByRole("button", { name: /×/i, hidden: false });
    fireEvent.click(removeButton);
    expect(screen.queryByText(/test-app/i)).not.toBeInTheDocument();
  });

  it("displays the aviso about privacy", async () => {
    const detectCapabilitiesMock = require("@/lib/neurons/neurons").detectCapabilities;
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const avisoText = screen.getByText(
      /aviso: lo privado nunca sale de la cuenta/i
    );
    expect(avisoText).toBeInTheDocument();
  });
});