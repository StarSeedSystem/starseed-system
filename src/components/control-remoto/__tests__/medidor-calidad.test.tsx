import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MedidorPresentacional, MedidorPuntoAparato } from "../medidor-calidad";
import type { MetricasCalidad } from "@/lib/control-remoto/calidad";

function metricasBase(overrides: Partial<MetricasCalidad> = {}): MetricasCalidad {
    return {
        fps: 24.5,
        rttMs: 42,
        kbps: 1_200,
        resolucion: { ancho: 1280, alto: 720 },
        codec: "vp8",
        calidad: 60,
        perdidaPct: 0,
        medio: "wifi-directo",
        lado: "controlador",
        cuadrosEnVentana: 73,
        acusesEnVentana: 12,
        ...overrides,
    };
}

describe("CTL1119B · MedidorPresentacional", () => {
    it("muestra fps, rtt, kbps, resolución y medio con colores verdes (≥20 fps)", () => {
        render(<MedidorPresentacional metricas={metricasBase({ fps: 24.5 })} />);
        const el = screen.getByTestId("medidor-calidad");
        expect(el).toHaveClass("bg-emerald-500/20");
        expect(el).toHaveClass("text-emerald-300");
        expect(el).toHaveClass("border-emerald-400/30");
        expect(el).toHaveTextContent("24,5 fps");
        expect(el).toHaveTextContent("42 ms");
        expect(el).toHaveTextContent("1,2 Mbps");
        expect(el).toHaveTextContent("1280×720");
        expect(el).toHaveTextContent("wifi-directo");
    });

    it("color ámbar para 10–19 fps", () => {
        render(<MedidorPresentacional metricas={metricasBase({ fps: 15.3 })} />);
        const el = screen.getByTestId("medidor-calidad");
        expect(el).toHaveClass("bg-amber-400/20");
        expect(el).toHaveClass("text-amber-200");
        expect(el).toHaveClass("border-amber-400/30");
        expect(el).toHaveTextContent("15,3 fps");
    });

    it("color rojo para <10 fps", () => {
        render(<MedidorPresentacional metricas={metricasBase({ fps: 2.7 })} />);
        const el = screen.getByTestId("medidor-calidad");
        expect(el).toHaveClass("bg-red-500/20");
        expect(el).toHaveClass("text-red-300");
        expect(el).toHaveClass("border-red-400/30");
        expect(el).toHaveTextContent("2,7 fps");
    });

    it("muestra guiones cuando no hay datos", () => {
        render(<MedidorPresentacional metricas={metricasBase({ fps: 0, rttMs: 0, kbps: 0, resolucion: null, medio: "sin-determinar" })} />);
        const el = screen.getByTestId("medidor-calidad");
        expect(el).toHaveTextContent("— fps");
        expect(el).toHaveTextContent("— ms");
        expect(el).toHaveTextContent("— Mbps");
        expect(el).toHaveTextContent("—");
        expect(el).toHaveTextContent("desconocido");
    });

    it("tiene role=status y aria-live=polite", () => {
        render(<MedidorPresentacional metricas={metricasBase()} />);
        const el = screen.getByTestId("medidor-calidad");
        expect(el).toHaveAttribute("role", "status");
        expect(el).toHaveAttribute("aria-live", "polite");
    });

    it("renderiza ranura si se pasa", () => {
        render(<MedidorPresentacional metricas={metricasBase()} ranura={<span data-testid="extra">extra</span>} />);
        expect(screen.getByTestId("extra")).toBeInTheDocument();
    });

    it("aplica className adicional", () => {
        render(<MedidorPresentacional metricas={metricasBase()} className="mi-clase" />);
        expect(screen.getByTestId("medidor-calidad")).toHaveClass("mi-clase");
    });
});

describe("CTL1119B · MedidorPuntoAparato", () => {
    it("muestra solo fps y medio en formato compacto", () => {
        render(<MedidorPuntoAparato metricas={metricasBase({ fps: 18.2, medio: "red-local" })} />);
        const el = screen.getByTestId("medidor-punto-aparato");
        expect(el).toHaveClass("bg-amber-400/20");
        expect(el).toHaveClass("text-amber-200");
        expect(el).toHaveClass("border-amber-400/30");
        expect(el).toHaveTextContent("18,2 fps");
        expect(el).toHaveTextContent("red-local");
        expect(el).not.toHaveTextContent("ms");
        expect(el).not.toHaveTextContent("Mbps");
    });

    it("color verde para ≥20 fps", () => {
        render(<MedidorPuntoAparato metricas={metricasBase({ fps: 25 })} />);
        const el = screen.getByTestId("medidor-punto-aparato");
        expect(el).toHaveClass("bg-emerald-500/20");
    });

    it("color rojo para <10 fps", () => {
        render(<MedidorPuntoAparato metricas={metricasBase({ fps: 5 })} />);
        const el = screen.getByTestId("medidor-punto-aparato");
        expect(el).toHaveClass("bg-red-500/20");
    });

    it("tiene role=status y aria-live=polite", () => {
        render(<MedidorPuntoAparato metricas={metricasBase()} />);
        const el = screen.getByTestId("medidor-punto-aparato");
        expect(el).toHaveAttribute("role", "status");
        expect(el).toHaveAttribute("aria-live", "polite");
    });

    it("aplica className adicional", () => {
        render(<MedidorPuntoAparato metricas={metricasBase()} className="otra-clase" />);
        expect(screen.getByTestId("medidor-punto-aparato")).toHaveClass("otra-clase");
    });
});