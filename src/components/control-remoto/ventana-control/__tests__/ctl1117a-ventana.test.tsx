/**
 * CTL1117A · dentro de la ventana de control: cada orden rechazada se dice en palabras (S9), la hora máxima se ve
 * (S3, con «Reabrir» al terminar) y los deslizadores mandan como mucho 4 órdenes por segundo más el valor final (S5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VentanaControl, olvidarLugarVentana } from "../ventana-control";
import type { EntradaControl, PropsVentanaControl } from "../tipos";
import { palabrasMotivo } from "@/lib/control-remoto/palabras";

function props(extra: Partial<PropsVentanaControl> = {}): { p: PropsVentanaControl; env: EntradaControl[] } {
    const env: EntradaControl[] = [];
    const p: PropsVentanaControl = {
        nombre: "Tableta de Alex",
        modo: "pagina",
        estado: "en-vivo",
        flujo: {} as MediaStream,
        pantalla: { ancho: 1000, alto: 2000, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 10, teclas: ["atras", "inicio"], volumen: false, brillo: true, texto: false },
        aparato: { brillo: 0.6 },
        alEnviar: (e) => env.push(e),
        alCerrar: vi.fn(),
        ...extra,
    };
    return { p, env };
}

beforeEach(() => {
    olvidarLugarVentana();
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 20) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("S9 · la frase de cada orden rechazada, dentro de la ventana", () => {
    it("regla G: «La tableta tiene delante una ventana protegida… Pulsa Inicio»", () => {
        const { p } = props({ motivo: palabrasMotivo("regla-g") });
        render(<VentanaControl {...p} />);
        expect(screen.getByTestId("ventana-control-aviso")).toHaveTextContent(/ventana protegida/i);
        expect(screen.getByTestId("ventana-control-aviso")).toHaveTextContent(/Pulsa Inicio/);
    });

    it("cada motivo del encargo tiene su frase en español, sin el código crudo", () => {
        for (const m of ["regla-g", "pausa-local", "limite", "firma", "sesion-caducada", "sin-sesion", "sin-indicador-nativo", "no-autorizado", "permiso-apagado", "repetida", "parada-nativa"]) {
            const f = palabrasMotivo(m);
            expect(f, m).toBeTruthy();
            expect(f, m).not.toMatch(/^Motivo:/);
            expect(f!.length, m).toBeGreaterThan(25);
        }
    });

    it("sin motivo no se pinta ningún aviso", () => {
        const { p } = props();
        render(<VentanaControl {...p} />);
        expect(screen.queryByTestId("ventana-control-aviso")).toBeNull();
    });
});

describe("S3 · la hora máxima se ve y se puede reabrir", () => {
    it("los últimos 5 minutos enseñan la cuenta atrás", () => {
        const { p } = props({ caduca: Date.now() + 90_000 });
        render(<VentanaControl {...p} />);
        expect(screen.getByTestId("ventana-control-cuenta")).toHaveTextContent("1:30");
        act(() => void vi.advanceTimersByTime(10_000));
        expect(screen.getByTestId("ventana-control-cuenta")).toHaveTextContent("1:20");
    });

    it("lejos de la hora máxima no hay cuenta atrás", () => {
        const { p } = props({ caduca: Date.now() + 40 * 60_000 });
        render(<VentanaControl {...p} />);
        expect(screen.queryByTestId("ventana-control-cuenta")).toBeNull();
    });

    it("cerrada por «sesion-caducada» ofrece «Reabrir» con un clic", () => {
        const alReabrir = vi.fn();
        const { p } = props({ estado: "cerrada", motivo: palabrasMotivo("sesion-caducada"), alReabrir });
        render(<VentanaControl {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
        expect(alReabrir).toHaveBeenCalledTimes(1);
    });
});

describe("S5 · deslizadores", () => {
    it("arrastrar manda como mucho 4 órdenes por segundo y soltar manda el valor final", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        const d = screen.getByRole("slider", { name: "Brillo" });
        for (let i = 1; i <= 40; i++) {
            fireEvent.change(d, { target: { value: String(i / 100) } });
            act(() => void vi.advanceTimersByTime(25)); // 40 cambios en 1 s
        }
        const durante = env.filter((e) => e.tipo === "brillo").length;
        expect(durante).toBeLessThanOrEqual(5);
        expect(durante).toBeGreaterThanOrEqual(3);
        fireEvent.pointerUp(d, { pointerId: 1 });
        const ultimo = env.filter((e) => e.tipo === "brillo").at(-1);
        expect(ultimo).toMatchObject({ tipo: "brillo", nivel: 0.4 });
    });
});
