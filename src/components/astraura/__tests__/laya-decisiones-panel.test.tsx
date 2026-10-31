import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LayaDecisionesPanel } from "@/components/astraura/laya-decisiones-panel";

afterEach(cleanup);

describe("LayaDecisionesPanel", () => {
    it("renders panel header and decision when decisiones provided", () => {
        const decisiones = [
            { id: "1", punto: "¿Publicar?", respuesta: "publicar", confianza: 0.95, donde: "CPU", ms: 42 },
        ];
        const habilidades = {
            toSpec: true,
            toTickets: true,
            triage: true,
        };

        render(
            <LayaDecisionesPanel decisiones={decisiones} habilidades={habilidades} />
        );

        const header = screen.getByText("Decisiones de Laya");
        expect(header).toBeTruthy();

        const decisionP = screen.getByText(/¿Publicar/);
        expect(decisionP).toBeTruthy();

        const respuesta = screen.getByText(/publicar/);
        expect(respuesta).toBeTruthy();

        const confianzaP = screen.getByText(/confianza/);
        expect(confianzaP).toBeTruthy();

        const donde = screen.getByText("CPU");
        expect(donde).toBeTruthy();

        const ms = screen.getByText("42 ms");
        expect(ms).toBeTruthy();
    });

    it("renders three habilidad switches all enabled by default", () => {
        render(
            <LayaDecisionesPanel />
        );

        const buttons = screen.getAllByRole("button", {
            name: /toSpec|toTickets|triage/,
        });
        expect(buttons).toHaveLength(3);

        constemeraldBg = document.querySelectorAll('[class*="emerald-500/20"]');
        expect(emeraldBg).toHaveLength(3);
    });

    it("renders without crashing when no decisiones provided", () => {
        render(
            <LayaDecisionesPanel />
        );

        const header = screen.getByText("Decisiones de Laya");
        expect(header).toBeTruthy();
    });
});