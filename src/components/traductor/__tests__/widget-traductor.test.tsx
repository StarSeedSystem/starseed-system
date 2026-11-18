import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { WidgetTraductor } from "../widget-traductor";
import type { IdMotor } from "@/lib/traductor/privacidad";

describe("WidgetTraductor", () => {
    const ajustesBase = {
        idiomasFijados: ["es", "en"] as [string, string],
        motorPreferido: "automatico" as const,
        tamanoLetra: "M" as const,
        historialCorto: true,
    };

    const renderWidget = (ui: React.ReactElement) =>
        render(<AppearanceProvider>{ui}</AppearanceProvider>);

    const defaultProps = {
        ajustes: ajustesBase,
        onAjustes: vi.fn(),
        origen: "",
        onEscribir: vi.fn(),
        resultado: "",
        motorInfo: null,
        avisoPendiente: null,
        onTraducir: vi.fn(),
        onReintentar: vi.fn(),
        onIntercambiar: vi.fn(),
        onCopiar: vi.fn(),
        onLeer: vi.fn(),
        onAceptarAviso: vi.fn(),
        onCambiarMotor: vi.fn(),
        cargando: false,
        error: null,
        vozDisponible: true,
        motivoVoz: null,
        copiado: false,
    };

    it("renderiza la caja de texto original y botón de traducir", () => {
        renderWidget(<WidgetTraductor {...defaultProps} />);

        expect(screen.getByPlaceholderText(/texto a traducir/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /traducir/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /intercambiar/i })).toBeInTheDocument();
    });

    it("muestra el contador de caracteres", () => {
        renderWidget(<WidgetTraductor {...defaultProps} origen="Hola" />);

        expect(screen.getByText("4 / 5000")).toBeInTheDocument();
    });

    it("muestra el par de idiomas", () => {
        renderWidget(<WidgetTraductor {...defaultProps} />);

        expect(screen.getByText("es → en")).toBeInTheDocument();
    });

    it("llama a onIntercambiar al pulsar el botón de intercambio", () => {
        renderWidget(<WidgetTraductor {...defaultProps} />);

        fireEvent.click(screen.getByRole("button", { name: /intercambiar/i }));

        expect(defaultProps.onIntercambiar).toHaveBeenCalled();
    });

    it("llama a onTraducir al pulsar el botón de traducir", () => {
        renderWidget(<WidgetTraductor {...defaultProps} origen="Hola" />);

        fireEvent.click(screen.getByRole("button", { name: /traducir/i }));

        expect(defaultProps.onTraducir).toHaveBeenCalled();
    });

    it("deshabilita el botón de traducir si el texto está vacío", () => {
        renderWidget(<WidgetTraductor {...defaultProps} origen="" />);

        const boton = screen.getByRole("button", { name: /traducir/i });
        expect(boton).toBeDisabled();
    });

    it("muestra estado de cargando y deshabilita el botón", () => {
        renderWidget(<WidgetTraductor {...defaultProps} origen="Hola" cargando />);

        expect(screen.getByRole("button", { name: /traduciendo/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /traduciendo/i })).toBeDisabled();
    });

    it("muestra el resultado de la traducción", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" />);

        expect(screen.getByText("Hello")).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/la traducción aparecerá aquí/i)).toBeInTheDocument();
    });

    it("muestra botón de copiar cuando hay resultado", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" />);

        expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
    });

    it("llama a onCopiar al pulsar el botón de copiar", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" />);

        fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

        expect(defaultProps.onCopiar).toHaveBeenCalled();
    });

    it("muestra botón de leer en voz alta cuando hay resultado y voz disponible", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" vozDisponible />);

        expect(screen.getByRole("button", { name: /leer en voz alta/i })).toBeInTheDocument();
    });

    it("deshabilita el botón de leer en voz alta cuando no hay voz disponible", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" vozDisponible={false} />);

        expect(screen.getByRole("button", { name: /leer en voz alta/i })).toBeDisabled();
    });

    it("llama a onLeer al pulsar el botón de leer", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" />);

        fireEvent.click(screen.getByRole("button", { name: /leer en voz alta/i }));

        expect(defaultProps.onLeer).toHaveBeenCalled();
    });

    it("muestra información del motor usado", () => {
        renderWidget(<WidgetTraductor {...defaultProps} motorInfo={{ motor: "paquete-local", local: true }} />);

        expect(screen.getByText(/motor: paquete-local/i)).toBeInTheDocument();
        expect(screen.getByText(/en tu aparato/i)).toBeInTheDocument();
    });

    it("muestra error cuando se proporciona", () => {
        const error = new Error("Fallo de red");
        renderWidget(<WidgetTraductor {...defaultProps} error={error} />);

        expect(screen.getByText("Fallo de red")).toBeInTheDocument();
    });

    it("muestra aviso de privacidad cuando hay avisoPendiente", () => {
        renderWidget(<WidgetTraductor {...defaultProps} avisoPendiente="libretranslate" />);

        expect(screen.getByText(/libretranslate/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /continuar con este motor/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /usar solo en mi aparato/i })).toBeInTheDocument();
    });

    it("llama a onAceptarAviso al aceptar el aviso de privacidad", () => {
        renderWidget(<WidgetTraductor {...defaultProps} avisoPendiente="libretranslate" />);

        fireEvent.click(screen.getByRole("button", { name: /continuar con este motor/i }));

        expect(defaultProps.onAceptarAviso).toHaveBeenCalledWith("libretranslate");
    });

    it("llama a onCambiarMotor al cambiar de motor en el aviso", () => {
        renderWidget(<WidgetTraductor {...defaultProps} avisoPendiente="libretranslate" />);

        fireEvent.click(screen.getByRole("button", { name: /usar solo en mi aparato/i }));

        expect(defaultProps.onCambiarMotor).toHaveBeenCalled();
    });

    it("muestra motivo de voz cuando hay", () => {
        renderWidget(<WidgetTraductor {...defaultProps} motivoVoz="La voz no está disponible" />);

        expect(screen.getByText("La voz no está disponible")).toBeInTheDocument();
    });

    it("llama a onEscribir al escribir en la caja de origen", () => {
        renderWidget(<WidgetTraductor {...defaultProps} />);

        fireEvent.change(screen.getByPlaceholderText(/texto a traducir/i), { target: { value: "Hola" } });

        expect(defaultProps.onEscribir).toHaveBeenCalledWith("Hola");
    });

    it("muestra estado copiado cuando copiado es true", () => {
        renderWidget(<WidgetTraductor {...defaultProps} resultado="Hello" copiado />);

        expect(screen.getByRole("button", { name: /copiado/i })).toBeInTheDocument();
    });
});