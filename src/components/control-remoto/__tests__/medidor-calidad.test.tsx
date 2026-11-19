import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MedidorCalidad } from "../medidor-calidad";
import type { CalidadCalculada } from "@/lib/control-remoto/calidad";

const calidadBase: CalidadCalculada = {
    fps: 15.5,
    rttMs: 42,
    kbps: 1250,
    resolucion: { ancho: 1280, alto: 720 },
    nivelCalidad: 1,
    codec: "jpeg",
    perdidasPct: 0.5,
    medio: "red-local",
    lado: "controlador",
    timestamp: 10000,
};

describe("medidor-calidad · componente", () => {
    it("renderiza modo completo con todos los datos", () => {
        render(<MedidorCalidad calidad={calidadBase} lado="controlador" color="#dd3cd2" nombre="Mac" />);
        expect(screen.getByTestId("medidor-calidad")).toBeInTheDocument();
        expect(screen.getByText("15.5")).toBeInTheDocument();
        expect(screen.getByText("42 ms")).toBeInTheDocument();
        expect(screen.getByText("1.3 Mbps")).toBeInTheDocument(); // 1250 kbps = 1.3 Mbps
        expect(screen.getByText("Red local")).toBeInTheDocument();
        expect(screen.getByText("1280×720")).toBeInTheDocument();
        expect(screen.getByText("Q:")).toBeInTheDocument();
        expect(screen.getByText("(JPEG)")).toBeInTheDocument();
        expect(screen.getByText("0.5%")).toBeInTheDocument();
        expect(screen.getByTestId("punto-color")).toHaveAttribute("data-color", "#dd3cd2");
    });

    it("renderiza modo compacto solo con fps y medio", () => {
        render(<MedidorCalidad calidad={calidadBase} lado="aparato" color="#112233" compacto etiqueta="Enviados:" />);
        expect(screen.getByTestId("medidor-calidad-compacto")).toBeInTheDocument();
        expect(screen.getByText("15.5")).toBeInTheDocument();
        expect(screen.getByText("fps")).toBeInTheDocument();
        expect(screen.getByText("Red local")).toBeInTheDocument();
        expect(screen.queryByText("RTT:")).not.toBeInTheDocument();
        expect(screen.queryByText("Velocidad:")).not.toBeInTheDocument();
    });

    it("muestra colores según calidad de fps", () => {
        const { rerender } = render(<MedidorCalidad calidad={{ ...calidadBase, fps: 25 }} lado="controlador" />);
        expect(screen.getByText("25.0")).toHaveClass("text-emerald-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, fps: 12 }} lado="controlador" />);
        expect(screen.getByText("12.0")).toHaveClass("text-amber-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, fps: 3 }} lado="controlador" />);
        expect(screen.getByText("3.0")).toHaveClass("text-orange-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, fps: 0 }} lado="controlador" />);
        expect(screen.getByText("0.0")).toHaveClass("text-white/40");
    });

    it("muestra colores según RTT", () => {
        const { rerender } = render(<MedidorCalidad calidad={{ ...calidadBase, rttMs: 30 }} lado="controlador" />);
        expect(screen.getByText("30 ms")).toHaveClass("text-emerald-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, rttMs: 80 }} lado="controlador" />);
        expect(screen.getByText("80 ms")).toHaveClass("text-amber-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, rttMs: 150 }} lado="controlador" />);
        expect(screen.getByText("150 ms")).toHaveClass("text-orange-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, rttMs: 300 }} lado="controlador" />);
        expect(screen.getByText("300 ms")).toHaveClass("text-red-300");
    });

    it("muestra colores según pérdidas", () => {
        const { rerender } = render(<MedidorCalidad calidad={{ ...calidadBase, perdidasPct: 0 }} lado="controlador" />);
        expect(screen.queryByText("0.0%")).not.toBeInTheDocument(); // no se muestra si es 0

        rerender(<MedidorCalidad calidad={{ ...calidadBase, perdidasPct: 0.5 }} lado="controlador" />);
        expect(screen.getByText("0.5%")).toHaveClass("text-amber-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, perdidasPct: 3 }} lado="controlador" />);
        expect(screen.getByText("3.0%")).toHaveClass("text-orange-300");

        rerender(<MedidorCalidad calidad={{ ...calidadBase, perdidasPct: 10 }} lado="controlador" />);
        expect(screen.getByText("10.0%")).toHaveClass("text-red-300");
    });

    it("formatea kbps > 1000 como Mbps", () => {
        render(<MedidorCalidad calidad={{ ...calidadBase, kbps: 2500 }} lado="controlador" />);
        expect(screen.getByText("2.5 Mbps")).toBeInTheDocument();
    });

    it("maneja calidad null sin errores", () => {
        render(<MedidorCalidad calidad={null} lado="controlador" />);
        expect(screen.getByTestId("medidor-calidad")).toBeInTheDocument();
        expect(screen.getByText("0.0")).toBeInTheDocument();
        expect(screen.getByText("0 ms")).toBeInTheDocument();
        expect(screen.getByText("0 kbps")).toBeInTheDocument();
        expect(screen.getByText("Desconocido")).toBeInTheDocument();
    });
});