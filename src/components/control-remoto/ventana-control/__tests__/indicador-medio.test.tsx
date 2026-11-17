// @vitest-environment jsdom
/** CTL1117B · el indicador y el selector del medio: lo que dice, lo apagado con motivo, el aviso de medio perdido y el teclado. */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { IndicadorMedio } from "../medio/indicador-medio";
import { opcionesDeMedio, SIN_DETERMINAR, type ContextoMedio } from "@/lib/control-remoto/medio";
import type { EstadoMedio } from "@/lib/control-remoto/medio-estado";

afterEach(cleanup);

const ctx: ContextoMedio = { candidatos: [{ enlaceId: "ble:1", medio: "bluetooth", etiqueta: "x", abierto: true, llega: true }], relevoPorNodo: false, hayTurn: null, wifiDirecto: null };
const estado = (extra: Partial<EstadoMedio> = {}): EstadoMedio => ({
    elegido: "auto", opciones: opcionesDeMedio(ctx), ordenes: { camino: "directo", medio: "bluetooth" }, entrada: null, pantalla: SIN_DETERMINAR, pantallaForzada: false, perdido: false, ...extra,
});

describe("IndicadorMedio", () => {
    it("dice el medio real de las órdenes y de la pantalla, y «sin determinar» si no se sabe", () => {
        render(<IndicadorMedio nombre="Tableta" estado={estado()} alElegir={() => undefined} />);
        expect(screen.getByTestId("medio-ordenes").textContent).toContain("Directo · Bluetooth");
        expect(screen.getByTestId("medio-pantalla").textContent).toContain("sin determinar");
    });
    it("el selector enseña las seis opciones, apaga las que no sirven con su motivo y elige con el clic", () => {
        const alElegir = vi.fn();
        render(<IndicadorMedio nombre="Tableta" estado={estado()} alElegir={alElegir} />);
        fireEvent.click(screen.getByRole("button", { name: /Medio: Automático/ }));
        expect(screen.getAllByRole("radio")).toHaveLength(6);
        const wd = screen.getByTestId("medio-opcion-wifi-directo");
        expect(wd.getAttribute("aria-disabled")).toBe("true");
        expect(wd.textContent).toMatch(/Wi‑Fi directo activo/);
        fireEvent.click(wd);
        expect(alElegir).not.toHaveBeenCalled();
        const bt = screen.getByTestId("medio-opcion-bluetooth");
        expect(bt.textContent).toMatch(/Aún no disponible para la pantalla/);
        fireEvent.click(bt);
        expect(alElegir).toHaveBeenCalledWith("bluetooth");
    });
    it("el teclado recorre las opciones encendidas con las flechas", () => {
        render(<IndicadorMedio nombre="Tableta" estado={estado()} alElegir={() => undefined} />);
        fireEvent.click(screen.getByRole("button", { name: /Medio:/ }));
        const auto = screen.getByTestId("medio-opcion-auto");
        auto.focus();
        fireEvent.keyDown(auto, { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByTestId("medio-opcion-bluetooth"));
    });
    it("con el medio perdido avisa y ofrece pasar a Automático (no cambia solo)", () => {
        const alElegir = vi.fn();
        render(<IndicadorMedio nombre="Tableta" estado={estado({ elegido: "bluetooth", perdido: true })} alElegir={alElegir} />);
        expect(screen.getByRole("alert").textContent).toMatch(/ya no está disponible/);
        expect(alElegir).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Pasar a Automático" }));
        expect(alElegir).toHaveBeenCalledWith("auto");
    });
});
