// @vitest-environment jsdom
/**
 * CapasPorEntidad (Ola 1003 · §19). Las listas de personalidades/agentes se
 * leen de verdad desde localStorage (semilla bajo starseed.aurora.personalities.v1);
 * los ajustes de capas persisten bajo starseed.astraura.capas-entidad.v1.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PERSONALIDADES_KEY = "starseed.aurora.personalities.v1";

function leerPersonalidadesSembradas(): { id: string; name: string }[] {
    try {
        const raw = window.localStorage.getItem(PERSONALIDADES_KEY);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((p): p is { id: string; name: string } => !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string")
            .map((p) => ({ id: p.id, name: typeof p.name === "string" ? p.name : p.id }));
    } catch {
        return [];
    }
}

vi.mock("@/lib/aurora/personalities", () => ({
    listPersonalityProfiles: () => leerPersonalidadesSembradas(),
}));
vi.mock("@/lib/agents/store", () => ({ listAgents: () => [] }));

import { CLAVE_CAPAS_ENTIDAD, CAMPOS_CAPA, leerAjustesCapasEntidad } from "@/lib/astraura/capas-entidad";
import { CapasPorEntidad } from "@/components/astraura/capas/capas-por-entidad";

beforeAll(() => {
    // Radix mide con ResizeObserver, que jsdom no trae.
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("CapasPorEntidad", () => {
    it("con el almacén vacío muestra el texto amable", () => {
        render(<CapasPorEntidad />);
        expect(screen.getByText(/Aún no hay personalidades ni agentes propios/)).toBeTruthy();
    });

    it("con una personalidad sembrada aparecen las 6 capas y «Apagada» guarda el override", () => {
        window.localStorage.setItem(PERSONALIDADES_KEY, JSON.stringify([{ id: "p1", name: "Luz" }]));
        render(<CapasPorEntidad />);

        expect(CAMPOS_CAPA).toHaveLength(6);
        for (const campo of CAMPOS_CAPA) {
            expect(screen.getByTestId(`campo-${campo}`)).toBeTruthy();
        }

        const fila = within(screen.getByTestId("campo-contextoPersonal"));
        fireEvent.click(fila.getByRole("button", { name: "Apagada" }));

        const crudo = window.localStorage.getItem(CLAVE_CAPAS_ENTIDAD);
        expect(crudo).toBeTruthy();
        const guardado = leerAjustesCapasEntidad(JSON.parse(crudo ?? "null"));
        expect(guardado.personalidades.p1?.contextoPersonal).toBe(false);
    });
});
