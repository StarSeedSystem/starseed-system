import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelConversacion } from "../panel-conversacion";
import type { ParIdiomas } from "@/lib/traductor/tipos";
import type { ResultadoServicioTraductor } from "@/lib/traductor/servicio";

const par: ParIdiomas = { origen: "es", destino: "en" };

const servicioQue = (responde: () => Promise<ResultadoServicioTraductor>) => ({
    traducir: vi.fn(responde),
});

describe("PanelConversacion", () => {
    it("renderiza los dos lados de la pantalla", () => {
        const servicio = servicioQue(async () => ({ texto: "Hello", origenDetectado: "es", motor: "paquete-local", local: true, ms: 3 }));
        render(<PanelConversacion servicio={servicio} voz={null} par={par} />);

        expect(screen.getAllByText("Persona 1")[0]).toBeInTheDocument();
        expect(screen.getAllByText("Persona 2")[0]).toBeInTheDocument();
        expect(screen.getByText("Sin turnos del lado izquierdo")).toBeInTheDocument();
        expect(screen.getByText("Sin turnos del lado derecho")).toBeInTheDocument();
    });

    it("muestra el estado de conversación general", () => {
        const servicio = servicioQue(async () => ({ texto: "Hello", origenDetectado: "es", motor: "paquete-local", local: true, ms: 3 }));
        render(<PanelConversacion servicio={servicio} voz={null} par={par} />);

        expect(screen.getByText("Total turnos")).toBeInTheDocument();
    });
});