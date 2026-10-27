"use client";

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import PanelReticula from "../panel-reticula";

const mockEstadoBase = {
  promedioTemperatura: 25.5,
  esVitreo: false,
  esFundido: false,
  esSubenfriado: false,
  estado: "vacio" as const,
  puentePromedio: 2.5,
  neuronasActivas: 8,
  neuronasMax: 12,
  hashReticula: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
  puentes: [],
  coordPorNeurona: {
    "neuron-1": 85,
    "neuron-2": 92,
    "neuron-3": 78,
    "neuron-4": 95,
    "neuron-5": 88
  },
  mismoEnNMDeM: "42 de 50 neuronas",
  mensajeVacio: "aún no llegó ninguna señal de otra neurona"
};

const mockEstadoVitreo = {
  promedioTemperatura: 15.2,
  esVitreo: true,
  esFundido: false,
  esSubenfriado: false,
  estado: "vitreo" as const,
  puentePromedio: 3.1,
  neuronasActivas: 10,
  neuronasMax: 12,
  puentes: [
    { neurona: "A", destino: "B", medio: "WiFi", calidad: 95, coste: 1 },
    { neurona: "B", destino: "C", medio: "BLE", calidad: 87, coste: 2 }
  ],
  coordPorNeurona: {
    "neuron-1": 92,
    "neuron-2": 88
  },
  mismoEnNMDeM: "38 de 40 neuronas",
  hashReticula: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd1234",
  mensajeVacio: "aún no llegó ninguna señal de otra neurona"
};

const mockEstadoFundido = {
  promedioTemperatura: 45.8,
  esVitreo: false,
  esFundido: true,
  esSubenfriado: false,
  estado: "fundido" as const,
  puentePromedio: 4.2,
  neuronasActivas: 12,
  neuronasMax: 12,
  puentes: [
    { neurona: "X", destino: "Y", medio: "LoRa", calidad: 72, coste: 5 },
    { neurona: "Y", destino: "Z", medio: "WiFi", calidad: 68, coste: 1 },
    { neurona: "Z", destino: "W", medio: "BLE", calidad: 81, coste: 3 }
  ],
  coordPorNeurona: {
    "neuron-1": 65,
    "neuron-2": 71,
    "neuron-3": 59
  },
  mismoEnNMDeM: "45 de 50 neuronas",
  hashReticula: "0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd234567890",
  mensajeVacio: "aún no llegó ninguna señal de otra neurona"
};

const mockEstadoVitreo = {
  promedioTemperatura: 15.2,
  esVitreo: true,
  esFundido: false,
  esSubenfriado: false,
  estado: "vitreo" as const,
  puentePromedio: 3.1,
  neuronasActivas: 10,
  neuronasMax: 12,
  puentes: [
    { neurona: "A", destino: "B", medio: "WiFi", calidad: 95, coste: 1 },
    { neurona: "B", destino: "C", medio: "BLE", calidad: 87, coste: 2 }
  ],
  coordPorNeurona: {
    "neuron-1": 92,
    "neuron-2": 88
  },
  mismoEnNMDeM: "38 de 40 neuronas",
  hashReticula: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd1234",
  mensajeVacio: "aún no llegó ninguna señal de otra neurona"
};

const mockEstadoFundido = {
  promedioTemperatura: 45.8,
  esVitreo: false,
  esFundido: true,
  esSubenfriado: false,
  estado: "fundido" as const,
  puentePromedio: 4.2,
  neuronasActivas: 12,
  neuronasMax: 12,
  puentes: [
    { neurona: "X", destino: "Y", medio: "LoRa", calidad: 72, coste: 5 },
    { neurona: "Y", destino: "Z", medio: "WiFi", calidad: 68, coste: 1 },
    { neurona: "Z", destino: "W", medio: "BLE", calidad: 81, coste: 3 }
  ],
  coordPorNeurona: {
    "neuron-1": 65,
    "neuron-2": 71,
    "neuron-3": 59
  },
  mismoEnNMDeM: "45 de 50 neuronas",
  hashReticula: "0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd234567890",
  mensajeVacio: "aún no llegó ninguna señal de otra neurona"
};

describe("PanelReticula", () => {
  it("debe renderizar el estado vacío con mensaje honesto", () => {
    const { container } = render(<PanelReticula estado={mockEstadoBase} />);
    
    expect(container).toContainElement(screen.getByText("Sólido amorfo en tiempo real"));
    expect(container).toContainElement(screen.getByText("aún no llegó ninguna señal de otra neurona"));
    expect(container).toContainElement(screen.getByText("42 de 50 neuronas"));
  });

  it("debe mostrar el estado vítreo correctamente", () => {
    const { container } = render(<PanelReticula estado={mockEstadoVitreo} />);
    
    expect(container).toContainElement(screen.getByText("Vítreo: estable y congelada"));
    expect(container).toContainElement(screen.getByText("15.2°C"));
    expect(container).toContainElement(screen.getByText("38 de 40 neuronas"));
    expect(container).toContainElement(screen.getByText("A ↔ B"));
    expect(container).toContainElement(screen.getByText("WiFi"));
    expect(container).toContainElement(screen.getByText("95%"));
  });

  it("debe mostrar el estado fundido correctamente", () => {
    const { container } = render(<PanelReticula estado={mockEstadoFundido} />);
    
    expect(container).toContainElement(screen.getByText("Fundido: las señales cambian y la red se recoloca"));
    expect(container).toContainElement(screen.getByText("45.8°C"));
    expect(container).toContainElement(screen.getByText("45 de 50 neuronas"));
    expect(container).toContainElement(screen.getByText("X ↔ Y"));
    expect(container).toContainElement(screen.getByText("LoRa"));
    expect(container).toContainElement(screen.getByText("72%"));
  });

  it("debe mostrar la coordenación en el gráfico cuando hay datos", () => {
    const { container } = render(<PanelReticula estado={mockEstadoVitreo} />);
    
    const coordTitles = screen.getAllByText("Coordinación por neurona");
    expect(coordTitles.length).toBeGreaterThan(0);
    expect(container).toContainElement(screen.getByText("10/12 activas"));
  });

  it("debe mostrar los detalles de los puentes con calidad y coste", () => {
    const { container } = render(<PanelReticula estado={mockEstadoVitreo} />);
    
    expect(container).toContainElement(screen.getByText("A ↔ B"));
    expect(container).toContainElement(screen.getByText("B ↔ C"));
    expect(container).toContainElement(screen.getByText("WiFi"));
    expect(container).toContainElement(screen.getByText("95%"));
    expect(container).toContainElement(screen.getByText("LoRa"));
    expect(container).toContainElement(screen.getByText("87%"));
  });

  it("debe aplicar colores correctos por estado", () => {
    const { container: containerVitreo } = render(<PanelReticula estado={mockEstadoVitreo} />);
    const panelVitreo = containerVitreo.querySelector(".border-blue-200");
    expect(panelVitreo).toBeInTheDocument();

    const { container: containerFundido } = render(<PanelReticula estado={mockEstadoFundido} />);
    const panelFundido = containerFundido.querySelector(".border-red-200");
    expect(panelFundido).toBeInTheDocument();
  });

  it("debe mostrar alerta vacía cuando no hay puentes", () => {
    const { container } = render(<PanelReticula estado={mockEstadoBase} />);
    
    const alertIcon = container.querySelector("svg.text-gray-500");
    expect(alertIcon).toBeInTheDocument();
  });
});
