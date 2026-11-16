import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelConversacion } from "../panel-conversacion";
import type { EstadoConversacion } from "@/lib/traductor/conversacion";

function relojMock(value: number) { return () => value; }

describe("PanelConversacion", () => {
    it("muestra estado inactivo con mic deshabilitado", () => {
        const estado: EstadoConversacion = { fase: "inactivo" };
        render(<PanelConversacion estado={estado} reloj={relojMock(0)} audioSaleDelAparato={false} />);
        expect(screen.getByTestId("estado-inactivo")).toBeInTheDocument();
        const mic = screen.getAllByRole("button", { name: /listen/i })[0];
        expect(mic).toBeDisabled();
    });

    it("muestra estado escuchando con tiempo y mic activo", () => {
        const estado: EstadoConversacion = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "hola" };
        render(<PanelConversacion estado={estado} reloj={relojMock(150)} audioSaleDelAparato={true} />);
        const estadoEl = screen.getByTestId("estado-escuchando");
        expect(estadoEl).toHaveTextContent("Escuchando…");
        expect(estadoEl).toHaveTextContent(/150/);
        const mic = screen.getAllByRole("button", { name: /listen/i })[0];
        expect(mic).not.toBeDisabled();
    });

    it("muestra estado traduciendo con tiempo", () => {
        const estado: EstadoConversacion = { fase: "traduciendo", quien: "A", inicioMs: 0, textoOriginal: "hola", inicioTraduccionMs: 100 };
        render(<PanelConversacion estado={estado} reloj={relojMock(200)} audioSaleDelAparato={false} />);
        const estadoEl = screen.getByTestId("estado-traduciendo");
        expect(estadoEl).toHaveTextContent("Traduciendo…");
        expect(estadoEl).toHaveTextContent(/100/);
        const traduccionEl = screen.getByText("Original: hola");
        expect(traduccionEl).toBeInTheDocument();
    });

    it("muestra estado hablando con texto, traducción y tiempos", () => {
        const estado: EstadoConversacion = {
            fase: "hablando",
            quien: "A",
            inicioMs: 0,
            texto: "hola",
            traduccion: "hello",
            inicioTraduccionMs: 100,
            inicioHablaMs: 200,
        };
        render(<PanelConversacion estado={estado} reloj={relojMock(350)} audioSaleDelAparato={true} />);
        const estadoEl = screen.getByTestId("estado-hablando");
        expect(estadoEl).toHaveTextContent("Hablando…");
        expect(estadoEl).toHaveTextContent(/150/);
        expect(screen.getByText("Texto: hola")).toBeInTheDocument();
        expect(screen.getByText("Traducción: hello")).toBeInTheDocument();
    });

    it("muestra el aviso de audio y la advertencia de simultaneidad", () => {
        const estado: EstadoConversacion = { fase: "inactivo" };
        render(<PanelConversacion estado={estado} reloj={relojMock(0)} audioSaleDelAparato={false} />);
        expect(screen.getByTestId("warning-translator")).toHaveTextContent("La traducción en tiempo real no es simultánea");
        expect(screen.getByTestId("audio-status")).toHaveTextContent("Audio sale del aparato: No");
    });
});
