/**
 * CTL1117M · la ventana de control cuando el aparato controlado es un Mac: se anuncia con la marca «escritorio» entre las
 * teclas de `control_capacidades`. «Recientes» es Mission Control, no hay selector de fuentes de Android y lo que se
 * teclea sobre la pantalla llega como texto (sin atajos del navegador, y no desde los cuadros de la propia ventana).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VentanaControl, olvidarLugarVentana, esEscritorio, textoDeTecla } from "../ventana-control";
import type { EntradaControl, PropsVentanaControl } from "../tipos";
import { PALABRAS_FALTA, BOTON_FALTA } from "@/lib/control-remoto/palabras";
import { AJUSTES_QUE_FALTAN } from "@/lib/control-remoto/nativo";

function props(extra: Partial<PropsVentanaControl> = {}): { p: PropsVentanaControl; env: EntradaControl[] } {
    const env: EntradaControl[] = [];
    const p: PropsVentanaControl = {
        nombre: "Mac de Alex",
        modo: "pagina",
        estado: "en-vivo",
        flujo: {} as MediaStream,
        pantalla: { ancho: 2880, alto: 1800, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 2, teclas: ["recientes", "bloquear", "volumen-subir", "volumen-bajar", "silencio", "escritorio"], volumen: false, brillo: false, texto: true },
        aparato: null,
        alEnviar: (e) => env.push(e),
        alCerrar: vi.fn(),
        alCambiarFuente: vi.fn(),
        ...extra,
    };
    return { p, env };
}

beforeEach(() => {
    olvidarLugarVentana();
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("CTL1117M · un Mac como aparato controlado", () => {
    it("la marca «escritorio» solo la dice un escritorio", () => {
        expect(esEscritorio(["recientes", "escritorio"])).toBe(true);
        expect(esEscritorio(["atras", "inicio"])).toBe(false);
    });

    it("«Recientes» se llama Mission Control y manda la misma tecla; hay volumen y silencio", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "Mission Control" }));
        fireEvent.click(screen.getByRole("button", { name: "Silencio" }));
        expect(env).toEqual([
            { tipo: "tecla", cual: "recientes" },
            { tipo: "tecla", cual: "silencio" },
        ]);
        expect(screen.queryByRole("button", { name: "Recientes" })).toBeNull();
    });

    it("en un Android «Recientes» sigue llamándose Recientes", () => {
        const { p } = props({ capacidades: { gestos: true, maxDedos: 10, teclas: ["atras", "recientes"], volumen: false, brillo: false, texto: false } });
        render(<VentanaControl {...p} />);
        expect(screen.getByRole("button", { name: "Recientes" })).toBeInTheDocument();
    });

    it("no ofrece el selector de fuentes de Android", () => {
        const { p } = props();
        render(<VentanaControl {...p} />);
        expect(screen.queryByRole("radiogroup")).toBeNull();
    });

    it("lo que se teclea sobre la pantalla llega como texto; los atajos y los cuadros de la ventana no", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        const region = screen.getByTestId("ventana-control");
        fireEvent.keyDown(region, { key: "a" });
        fireEvent.keyDown(region, { key: "Enter" });
        fireEvent.keyDown(region, { key: "Backspace" });
        fireEvent.keyDown(region, { key: "c", metaKey: true });
        fireEvent.keyDown(region, { key: "Tab" });
        fireEvent.keyDown(region, { key: "Escape" });
        fireEvent.keyDown(screen.getByLabelText("Texto para escribir en el aparato"), { key: "x" });
        expect(env).toEqual([
            { tipo: "texto", texto: "a" },
            { tipo: "texto", texto: "\n" },
            { tipo: "texto", texto: "\b" },
        ]);
    });

    it("sin permiso de texto (falta «Accesibilidad») no se manda nada", () => {
        const { p, env } = props({ capacidades: { gestos: false, maxDedos: 0, teclas: ["escritorio"], volumen: false, brillo: false, texto: false } });
        render(<VentanaControl {...p} />);
        fireEvent.keyDown(screen.getByTestId("ventana-control"), { key: "a" });
        expect(env).toEqual([]);
    });

    it("textoDeTecla: letras, signos, Intro y Borrar; nada de teclas largas ni de IME", () => {
        const k = (key: string, extra = {}) => textoDeTecla({ key, ctrlKey: false, metaKey: false, altKey: false, ...extra });
        expect(k("ñ")).toBe("ñ");
        expect(k("😀")).toBe("😀");
        expect(k("Shift")).toBeNull();
        expect(k("ArrowLeft")).toBeNull();
        expect(k("a", { isComposing: true })).toBeNull();
        expect(k("a", { ctrlKey: true })).toBeNull();
    });

    it("los dos permisos del Mac tienen palabras, botón y están entre los que se pueden abrir", () => {
        for (const f of ["grabacion-pantalla", "accesibilidad-mac"]) {
            expect(PALABRAS_FALTA[f], f).toMatch(/Mac/);
            expect(BOTON_FALTA[f], f).toBeTruthy();
            expect((AJUSTES_QUE_FALTAN as readonly string[]).includes(f), f).toBe(true);
        }
    });
});
