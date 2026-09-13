import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DirectorServicios } from "../director-servicios";
import { DirectorAgentesVivos, type ResumenAgentesVivos } from "../director-agentes-vivos";
import type { AgenteVivo, ResumenDirector } from "@/lib/mando/director-datos";

afterEach(() => {
    cleanup();
});

describe("DirectorServicios", () => {
    it("un director caído muestra «caído»", () => {
        const directores: ResumenDirector[] = [{ nombre: "vigilante", vivo: false }];
        render(<DirectorServicios directores={directores} />);
        expect(screen.getByTestId("director-vigilante")).toHaveTextContent("caído");
    });

    it("un director vivo muestra su pid y no «caído»", () => {
        const directores: ResumenDirector[] = [{ nombre: "mando", vivo: true, pid: 4242, ultimaSalida: 0 }];
        render(<DirectorServicios directores={directores} />);
        const tarjeta = screen.getByTestId("director-mando");
        expect(tarjeta).toHaveTextContent("pid 4242");
        expect(tarjeta).not.toHaveTextContent("caído");
    });

    it("un director ausente en la API queda como «sin datos»", () => {
        render(<DirectorServicios directores={[]} />);
        expect(screen.getByTestId("director-eco")).toHaveTextContent("sin datos");
        // Las 7 tarjetas conocidas están siempre presentes, aunque la API no traiga ninguna.
        expect(screen.getAllByText(/./).length).toBeGreaterThan(0);
        for (const nombre of ["vigilante", "director", "guardia", "eco", "ecoides", "telegram", "mando"]) {
            expect(screen.getByTestId(`director-${nombre}`)).toBeInTheDocument();
        }
    });
});

describe("DirectorAgentesVivos", () => {
    it("3 esperando aprobación ⇒ cabecera dice 0 vivos, 3 esperando aprobación, 0 colgados", () => {
        const lista: AgenteVivo[] = [
            { id: "P1", estado: "esperando_aprobacion", fase: "esperando aprobación", proveedor: "nim", kb: 12, minutos: 4 },
            { id: "P2", estado: "esperando_aprobacion", fase: "esperando aprobación", proveedor: "xkiro", kb: 8, minutos: 2 },
            { id: "P3", estado: "esperando_aprobacion", fase: "esperando aprobación", proveedor: "nim", kb: 20, minutos: 9 },
        ];
        const agentes: ResumenAgentesVivos = { vivos: 0, colgados: 0, esperandoAprobacion: 3, lista };
        render(<DirectorAgentesVivos agentes={agentes} />);
        expect(screen.getByText(/0 vivos/)).toBeInTheDocument();
        expect(screen.getByText(/3 esperando aprobación/)).toBeInTheDocument();
        expect(screen.getByText(/0 colgados/)).toBeInTheDocument();
        // Cada fila esperando aprobación ofrece Aprobar/Rechazar, nunca Soltar.
        expect(screen.getAllByRole("button", { name: /Aprobar/ })).toHaveLength(3);
        expect(screen.queryByRole("button", { name: /Soltar/ })).not.toBeInTheDocument();
    });

    it("un agente colgado enseña «colgado» y el botón Soltar (no Aprobar/Rechazar)", () => {
        const agentes: ResumenAgentesVivos = {
            vivos: 0, colgados: 1, esperandoAprobacion: 0,
            lista: [{ id: "P9", estado: "colgado", fase: "escribiendo", modelo: "nim/kimi-k3", proveedor: "nim", kb: 3, minutos: 12, intento: 2 }],
        };
        render(<DirectorAgentesVivos agentes={agentes} />);
        expect(screen.getByTestId("agente-P9")).toHaveTextContent("colgado");
        expect(screen.getByRole("button", { name: /Soltar/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Aprobar/ })).not.toBeInTheDocument();
    });

    it("sin agentes en el latido, el vacío es honesto", () => {
        render(<DirectorAgentesVivos agentes={{ vivos: 0, colgados: 0, esperandoAprobacion: 0, lista: [] }} />);
        expect(screen.getByText("ningún agente en el latido")).toBeInTheDocument();
    });
});
