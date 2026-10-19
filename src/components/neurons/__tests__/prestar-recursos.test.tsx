import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PrestarRecursosPanel } from "@/components/neurons/prestar-recursos";

// Hoist the mock function
const detectCapabilitiesMock = vi.hoisted(() => vi.fn());

// Mock the module
vi.mock("@/lib/neurons/neurons", () => ({
  detectCapabilities: detectCapabilitiesMock,
}));

describe("PrestarRecursosPanel", () => {
  afterEach(() => {
    cleanup();
    detectCapabilitiesMock.mockReset();
  });

  it("renders the panel with default toggles checked", async () => {
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
    expect(computacionButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    const almacenamientoButton = screen.getByRole("button", {
      name: /prestar espacio/i,
    });
    expect(almacenamientoButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    const cuentaButton = screen.getByRole("button", {
      name: /mi cuenta \(todas mis neuronas\)/i,
    });
    expect(cuentaButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);
  });

  it("toggles the computacion button", async () => {
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

    expect(computacionButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    fireEvent.click(computacionButton);
    expect(computacionButton).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);
    expect(computacionButton).toHaveClass(/bg-white\/\[0\.04\]/);

    fireEvent.click(computacionButton);
    expect(computacionButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);
  });

  it("allows adding an app to the list", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const appsToggle = screen.getByRole("button", {
      name: /apps que otras neuronas pueden abrir desde aquí/i,
    });
    expect(appsToggle).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    const input = screen.getByPlaceholderText(/nombre de la app/i);
    const addButton = screen.getByRole("button", { name: /añadir/i });

    fireEvent.change(input, { target: { value: "test-app" } });
    fireEvent.click(addButton);

    expect(screen.getByText(/test-app/i)).toBeInTheDocument();

    const removeButton = screen.getByRole("button", { name: /eliminar test-app/i });
    fireEvent.click(removeButton);
    expect(screen.queryByText(/test-app/i)).not.toBeInTheDocument();
  });

  it("clears apps list when toggling off", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const input = screen.getByPlaceholderText(/nombre de la app/i);
    const addButton = screen.getByRole("button", { name: /añadir/i });

    fireEvent.change(input, { target: { value: "app-1" } });
    fireEvent.click(addButton);
    fireEvent.change(input, { target: { value: "app-2" } });
    fireEvent.click(addButton);

    expect(screen.getByText(/app-1/i)).toBeInTheDocument();
    expect(screen.getByText(/app-2/i)).toBeInTheDocument();

    const appsToggle = screen.getByRole("button", {
      name: /apps que otras neuronas pueden abrir desde aquí/i,
    });
    fireEvent.click(appsToggle);

    expect(screen.queryByText(/app-1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/app-2/i)).not.toBeInTheDocument();
  });

  it("allows changing bandwidth limit", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const bandwidthInput = screen.getByLabelText(/ancho de banda máximo \(kb\/s\)/i);
    expect(bandwidthInput).toHaveValue(0);

    fireEvent.change(bandwidthInput, { target: { value: "500" } });
    expect(bandwidthInput).toHaveValue(500);
  });

  it("allows toggling groups and public scopes", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const gruposButton = screen.getByRole("button", {
      name: /mis grupos/i,
    });
    const publicoButton = screen.getByRole("button", {
      name: /público \(vecinos de la malla\)/i,
    });

    expect(gruposButton).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);
    expect(publicoButton).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    fireEvent.click(gruposButton);
    expect(gruposButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    fireEvent.click(publicoButton);
    expect(publicoButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);
  });

  it("allows changing resource limits", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const cpuInput = screen.getByLabelText(/cpu máximo \(%\)/i);
    const ramInput = screen.getByLabelText(/ram máximo \(mb\)/i);
    const discoInput = screen.getByLabelText(/disco máximo \(mb\)/i);

    expect(cpuInput).toHaveValue(50);
    expect(ramInput).toHaveValue(1024);
    expect(discoInput).toHaveValue(2048);

    fireEvent.change(cpuInput, { target: { value: "75" } });
    fireEvent.change(ramInput, { target: { value: "2048" } });
    fireEvent.change(discoInput, { target: { value: "4096" } });

    expect(cpuInput).toHaveValue(75);
    expect(ramInput).toHaveValue(2048);
    expect(discoInput).toHaveValue(4096);
  });

  it("toggles solo cargando option", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    const soloCargandoButton = screen.getByRole("button", {
      name: /solo prestar mientras carga/i,
    });

    expect(soloCargandoButton).not.toHaveClass(/bg-cyan-500\/\[0\.06\]/);

    fireEvent.click(soloCargandoButton);
    expect(soloCargandoButton).toHaveClass(/bg-cyan-500\/\[0\.06\]/);
  });

  it("displays the aviso about privacy", async () => {
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

  it("shows explanations for each option", async () => {
    detectCapabilitiesMock.mockResolvedValueOnce({
      nodoId: "test-node",
      medio: "navegador",
      ramLibreMb: 2048,
      cpu: 50,
      installedApp: true,
    });

    render(<PrestarRecursosPanel />);
    await screen.findByText(/Prestar recursos/i);

    expect(screen.getByText(/permite que tus otras neuronas envíen tareas de cómputo/i)).toBeInTheDocument();
    expect(screen.getByText(/ofrece parte del almacenamiento libre/i)).toBeInTheDocument();
    expect(screen.getByText(/elige qué apps instaladas en esta neurona/i)).toBeInTheDocument();
    expect(screen.getByText(/límite de subida que esta neurona dedicará/i)).toBeInTheDocument();
    expect(screen.getByText(/tus otras neuronas \(mismo cuenta\) pueden usar/i)).toBeInTheDocument();
    expect(screen.getByText(/neuronas de los miembros de tus grupos/i)).toBeInTheDocument();
    expect(screen.getByText(/cualquier neurona de la red mesh/i)).toBeInTheDocument();
    expect(screen.getByText(/porcentaje máximo de cpu que se prestará/i)).toBeInTheDocument();
    expect(screen.getByText(/máximo de ram que se ofrecerá/i)).toBeInTheDocument();
    expect(screen.getByText(/espacio máximo en disco para volúmenes/i)).toBeInTheDocument();
    expect(screen.getByText(/solo presta recursos cuando el dispositivo está enchufado/i)).toBeInTheDocument();
  });
});