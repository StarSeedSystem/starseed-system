import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));

import { EnMarco, MEDIDAS } from "../../gen5/_catalogo/prueba-marco";
import { EnergyMapWidget } from "../energy-map-widget";
import { CLAVE_NACIMIENTO, ciclos, enRueda, fechaValida, pctCiclo, trazoLuna } from "../energy-map-partes";
import { planetPositions } from "@/lib/astro";

function pintar(clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}><EnergyMapWidget /></EnMarco>);
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Mapa de Energía", () => {
    it.each(TODAS)("(%s) el cielo real de ahora y el biorritmo vacío sin fecha", (clase) => {
        pintar(clase);
        const sol = planetPositions(new Date()).find((p) => p.body === "Sol")!.sign.name;
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(new RegExp(`Sol en ${sol}, Luna en .* iluminada\\).*Biorritmo vacío: sin fecha de nacimiento`));
    });

    it("con tu fecha (solo en este dispositivo) calcula el biorritmo", () => {
        pintar("xl");
        fireEvent.click(screen.getByRole("button", { name: /Añadir tu fecha de nacimiento/ }));
        const campo = screen.getByLabelText("Nacimiento");
        fireEvent.change(campo, { target: { value: "2999-01-01" } });
        expect((screen.getByRole("button", { name: /Guardar/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(campo, { target: { value: "1988-03-14" } });
        fireEvent.submit(screen.getByRole("form", { name: "Tu fecha de nacimiento" }));
        expect(localStorage.getItem(CLAVE_NACIMIENTO)).toBe("1988-03-14");
        const hoy = ciclos("1988-03-14", new Date(), 0).hoy;
        expect(screen.getByRole("region").getAttribute("aria-label")).toContain(`Biorritmo: físico ${pctCiclo(hoy.physical)} %`);
        expect(screen.getByRole("list", { name: "Biorritmo de hoy" })).toBeTruthy();
    });

    it("una fecha guardada inválida no se usa", () => {
        localStorage.setItem(CLAVE_NACIMIENTO, "ayer");
        pintar("l");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/Biorritmo vacío/);
    });
});

describe("Mapa de Energía · lógica", () => {
    it("sitúa Aries a la izquierda y Cáncer abajo, como en una carta", () => {
        const a = enRueda(0, 10, 50), c = enRueda(90, 10, 50), l = enRueda(180, 10, 50);
        expect(a.x).toBeCloseTo(40); expect(a.y).toBeCloseTo(50);
        expect(c.x).toBeCloseTo(50); expect(c.y).toBeCloseTo(60);
        expect(l.x).toBeCloseTo(60);
    });
    it("dibuja la Luna iluminada del lado correcto", () => {
        expect(trazoLuna(50, 50, 10, 0.3, true)).toMatch(/^M50 40A10 10 0 1 1 50 60A4\.00 10 0 1 0 50 40Z$/);
        expect(trazoLuna(50, 50, 10, 0.8, false)).toMatch(/A10 10 0 1 0 50 60A6\.00 10 0 1 0 50 40Z$/);
    });
    it("valida la fecha de nacimiento y calcula los ciclos", () => {
        expect(fechaValida("1988-03-14")).toBe(true);
        expect(fechaValida("1899-12-31")).toBe(false);
        expect(fechaValida("3000-01-01")).toBe(false);
        expect(fechaValida("14/03/1988")).toBe(false);
        const { hoy, curva } = ciclos("2000-01-01", new Date("2000-01-01T12:00:00Z"));
        expect(hoy.physical).toBeCloseTo(0);
        expect(curva).toHaveLength(29);
        expect(pctCiclo(1)).toBe(100);
        expect(pctCiclo(-1)).toBe(0);
    });
});
