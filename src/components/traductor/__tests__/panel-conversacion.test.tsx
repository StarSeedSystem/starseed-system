import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelConversacion, estadoDeLado, formatearMs, type PanelConversacionProps } from "../panel-conversacion";
import type { TurnoCompleto } from "@/lib/traductor/conversacion";

const turnos: TurnoCompleto[] = [
    { quien: "A", texto: "Hola, ¿qué tal?", traduccion: "Hi, how are you?", msReconocer: 820, msTraducir: 140, msHablar: 950 },
    { quien: "B", texto: "Muy bien, gracias", traduccion: "Very well, thanks", msReconocer: 610, msTraducir: 120, msHablar: 0 },
];

function base(extra: Partial<PanelConversacionProps> = {}): PanelConversacionProps {
    return {
        estado: { fase: "inactivo" },
        turnos,
        idiomaA: "Español",
        idiomaB: "Inglés",
        reconocimientoA: true,
        reconocimientoB: true,
        vozA: true,
        vozB: true,
        audioSaleDelAparato: false,
        onPulsarHablar: vi.fn(),
        onEscribir: vi.fn(),
        ...extra,
    };
}

function montar(extra: Partial<PanelConversacionProps> = {}): PanelConversacionProps {
    const props = base(extra);
    render(<PanelConversacion {...props} />);
    return props;
}

describe("formatearMs y estadoDeLado", () => {
    it("muestra los milisegundos reales y marca la ausencia de dato", () => {
        expect(formatearMs(820)).toBe("820 ms");
        expect(formatearMs(0)).toBe("0 ms");
        expect(formatearMs(-1)).toBe("—");
        expect(formatearMs(Number.NaN)).toBe("—");
    });

    it("describe la fase por lado", () => {
        expect(estadoDeLado({ fase: "inactivo" }, "A")).toBe("Listo");
        const estado = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "hola" } as const;
        expect(estadoDeLado(estado, "A")).toBe("Escuchando: hola");
        expect(estadoDeLado(estado, "B")).toBe("En espera");
    });
});

describe("PanelConversacion", () => {
    it("muestra el turno de cada lado con su texto original, su traducción y sus latencias", () => {
        montar();
        expect(screen.getByText("Hola, ¿qué tal?")).toBeInTheDocument();
        expect(screen.getByText("Hi, how are you?")).toBeInTheDocument();
        expect(screen.getByText("Muy bien, gracias")).toBeInTheDocument();
        expect(screen.getByText("Very well, thanks")).toBeInTheDocument();
        expect(screen.getByText(/Reconocido 820 ms · Traducido 140 ms · Hablado 950 ms/)).toBeInTheDocument();
        expect(screen.getByText(/Reconocido 610 ms · Traducido 120 ms · Hablado 0 ms/)).toBeInTheDocument();
    });

    it("desactiva el micrófono sin reconocimiento y ofrece escribir en ese lado", async () => {
        const props = montar({ reconocimientoA: false });
        const ladoA = within(screen.getByRole("region", { name: /Lado A/ }));
        const micA = ladoA.getByRole("button", { name: /micrófono no disponible en español/i });
        expect(micA).toBeDisabled();
        expect(ladoA.getByText(/sin reconocimiento de voz para este idioma/i)).toBeInTheDocument();
        await userEvent.click(ladoA.getByRole("button", { name: /escribir el turno/i }));
        expect(props.onEscribir).toHaveBeenCalledWith("A");
        expect(screen.getByRole("button", { name: /hablar en inglés/i })).toBeEnabled();
    });

    it("ofrece escribir cuando falta la voz de salida", () => {
        montar({ vozB: false });
        const ladoB = within(screen.getByRole("region", { name: /Lado B/ }));
        expect(ladoB.getByText(/sin voz de salida para este idioma/i)).toBeInTheDocument();
        expect(ladoB.getByRole("button", { name: /escribir el turno/i })).toBeInTheDocument();
    });

    it("avisa de que la traducción no es simultánea y de dónde sale el audio", () => {
        montar();
        const aviso = screen.getByRole("note");
        expect(aviso).toHaveTextContent(/no es simultánea/i);
        expect(aviso).toHaveTextContent(/se sintetiza en este aparato/i);
    });

    it("declara cuando el audio sale del aparato", () => {
        montar({ audioSaleDelAparato: true });
        expect(screen.getByRole("note")).toHaveTextContent(/se sintetiza fuera de este aparato/i);
    });

    it("pide el turno del lado que pulsa su micrófono disponible", async () => {
        const props = montar();
        await userEvent.click(screen.getByRole("button", { name: /hablar en inglés/i }));
        expect(props.onPulsarHablar).toHaveBeenCalledWith("B");
    });
});
