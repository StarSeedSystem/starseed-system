import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { DestinoInstalacion } from "@/lib/instalaciones/destinos";

const m = vi.hoisted(() => ({ lista: [] as DestinoInstalacion[], marcar: vi.fn() }));
vi.mock("@/lib/instalaciones/instalaciones-store", () => ({
    useInstalaciones: () => m.lista,
    marcarDestino: m.marcar,
}));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "yo" }));

import { DondeEstaInstalada } from "../donde-esta-instalada";

const base = { appNombre: "Audiomorphic", creada: 1, actualizada: 1 };

afterEach(() => {
    cleanup();
    m.marcar.mockReset();
});

describe("Dónde está instalada (ficha de la Biblioteca)", () => {
    it("enumera cada sitio con su estado y no enseña los cancelados", () => {
        m.lista = [
            { ...base, id: "a", appId: "audiomorphic", tipo: "web", estado: "instalada" },
            { ...base, id: "b", appId: "audiomorphic", tipo: "neurona", neuronaId: "yo", neuronaNombre: "Mac", estado: "descargada" },
            { ...base, id: "c", appId: "audiomorphic", tipo: "neurona", neuronaId: "otra", neuronaNombre: "Móvil", estado: "cancelada" },
            { ...base, id: "d", appId: "omnifrecuencias", tipo: "web", estado: "instalada" },
        ];
        render(<DondeEstaInstalada appId="audiomorphic" />);
        expect(screen.getByText(/En la web \(servidores StarSeed\)/)).toBeInTheDocument();
        expect(screen.getByText(/Este dispositivo \(Mac\)/)).toBeInTheDocument();
        expect(screen.queryByText(/Móvil/)).not.toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("quitar pide confirmación y marca el sitio como cancelado", () => {
        m.lista = [{ ...base, id: "a", appId: "audiomorphic", tipo: "web", estado: "instalada" }];
        render(<DondeEstaInstalada appId="audiomorphic" />);
        fireEvent.click(screen.getByRole("button", { name: /Quitar de En la web/ }));
        expect(m.marcar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
        expect(m.marcar).toHaveBeenCalledWith("a", "cancelada");
    });

    it("sin sitios no pinta nada", () => {
        m.lista = [];
        const { container } = render(<DondeEstaInstalada appId="audiomorphic" />);
        expect(container).toBeEmptyDOMElement();
    });
});
