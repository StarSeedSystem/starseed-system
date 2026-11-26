import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VentanasAparatos } from "../ventanas-aparatos";
import type { PropsVentanaControl } from "../tipos";
import type { AparatoConPermiso } from "../ventanas-aparatos";

const TODAS = ["atras", "inicio", "recientes", "notificaciones", "ajustes-rapidos", "bloquear", "captura", "menu-energia"];

function crearAparato(id: string, nombre: string, extra: Partial<{
    capacidades: PropsVentanaControl["capacidades"];
    pantalla: PropsVentanaControl["pantalla"];
    estado: PropsVentanaControl["estado"];
    nivel: PropsVentanaControl["nivel"];
    conPermiso: boolean;
    motivo: PropsVentanaControl["motivo"];
}> = {}): AparatoConPermiso & { env: ReturnType<typeof vi.fn> } {
    const env = vi.fn();
    const capacidades = extra.capacidades ?? { gestos: true, maxDedos: 10, teclas: TODAS, volumen: true, brillo: true, texto: true };
    const pantalla = extra.pantalla ?? { ancho: 1000, alto: 2000, giro: 0 };
    const estado = extra.estado ?? "en-vivo";
    const nivel = extra.nivel ?? "controlar";
    const conPermiso = extra.conPermiso ?? true;
    const p: PropsVentanaControl = {
        nombre,
        modo: "pagina",
        estado,
        flujo: null,
        pantalla,
        nivel,
        capacidades,
        aparato: { bateria: 0.8, cargando: false, red: { wifi: true, datos: false, bluetooth: true } },
        latenciaMs: 42,
        fps: 30,
        alEnviar: env,
        alCerrar: vi.fn(),
        color: "#007FFF",
        miColor: "#DC143C",
    };
    return { id, nombre, conPermiso, ...p, env };
}

beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 20) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON() {} });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("CTL1126F · ventanas-aparatos: selección, pestañas y espejo", () => {
    it("muestra la lista de aparatos de la neurona y permite seleccionar uno", () => {
        const a1 = crearAparato("aparato-1", "Teléfono");
        const a2 = crearAparato("aparato-2", "Tableta");
        render(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-1" alCambiarAparato={vi.fn()} modoEspejo={false} alCambiarModoEspejo={vi.fn()} />);
        expect(screen.getByRole("tab", { name: "Teléfono", selected: true })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Tableta", selected: false })).toBeTruthy();
    });

    it("cambia de aparato al hacer clic en otra pestaña", () => {
        const a1 = crearAparato("aparato-1", "Teléfono");
        const a2 = crearAparato("aparato-2", "Tableta");
        const alCambiar = vi.fn();
        render(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-1" alCambiarAparato={alCambiar} modoEspejo={false} alCambiarModoEspejo={vi.fn()} />);
        fireEvent.click(screen.getByRole("tab", { name: "Tableta" }));
        expect(alCambiar).toHaveBeenCalledWith("aparato-2");
    });

    it("activa y desactiva el modo espejo", () => {
        const a1 = crearAparato("aparato-1", "Teléfono");
        const a2 = crearAparato("aparato-2", "Tableta");
        const alCambiarModo = vi.fn();
        render(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-1" alCambiarAparato={vi.fn()} modoEspejo={false} alCambiarModoEspejo={alCambiarModo} />);
        const botonEspejo = screen.getByRole("button", { name: /activar modo espejo/i });
        fireEvent.click(botonEspejo);
        expect(alCambiarModo).toHaveBeenCalledWith(true);
    });

    it("en modo espejo, los controles se envían a todos los aparatos con permiso", () => {
        const a1 = crearAparato("aparato-1", "Teléfono", { conPermiso: true });
        const a2 = crearAparato("aparato-2", "Tableta", { conPermiso: true });
        const alEnviarEspejo = vi.fn();
        render(<VentanasAparatos
            aparatos={[a1, a2]}
            aparatoActivo="aparato-1"
            alCambiarAparato={vi.fn()}
            modoEspejo={true}
            alCambiarModoEspejo={vi.fn()}
            alEnviarEspejo={alEnviarEspejo}
        />);
        fireEvent.click(screen.getByRole("button", { name: "Inicio" }));
        expect(alEnviarEspejo).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ aparatoId: "aparato-1", entrada: { tipo: "tecla", cual: "inicio" } }),
            expect.objectContaining({ aparatoId: "aparato-2", entrada: { tipo: "tecla", cual: "inicio" } }),
        ]));
    });

    it("en modo espejo, salta los aparatos sin permiso y lo reporta", () => {
        const a1 = crearAparato("aparato-1", "Teléfono", { conPermiso: true });
        const a2 = crearAparato("aparato-2", "Tableta", { conPermiso: false, estado: "pausa-local", motivo: "sin permiso" });
        const alEnviarEspejo = vi.fn();
        const alSaltado = vi.fn();
        render(<VentanasAparatos
            aparatos={[a1, a2]}
            aparatoActivo="aparato-1"
            alCambiarAparato={vi.fn()}
            modoEspejo={true}
            alCambiarModoEspejo={vi.fn()}
            alEnviarEspejo={alEnviarEspejo}
            alAparatoSaltado={alSaltado}
        />);
        fireEvent.click(screen.getByRole("button", { name: "Inicio" }));
        expect(alEnviarEspejo).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ aparatoId: "aparato-1", entrada: { tipo: "tecla", cual: "inicio" } }),
        ]));
        expect(alSaltado).toHaveBeenCalledWith("aparato-2", "sin permiso");
    });

    it("cada aparato conserva su propio indicador de 'te están controlando'", () => {
        const a1 = crearAparato("aparato-1", "Teléfono", { estado: "en-vivo", nivel: "controlar" });
        const a2 = crearAparato("aparato-2", "Tableta", { estado: "pausa-local", nivel: "ver" });
        const { rerender } = render(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-1" alCambiarAparato={vi.fn()} modoEspejo={false} alCambiarModoEspejo={vi.fn()} />);
        expect(screen.getByTestId("ventana-control-chip").textContent).toContain("En vivo");
        rerender(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-2" alCambiarAparato={vi.fn()} modoEspejo={false} alCambiarModoEspejo={vi.fn()} />);
        expect(screen.getByTestId("ventana-control-chip").textContent).toContain("En pausa");
        expect(screen.getByTestId("ventana-control-mensaje").textContent).toContain("están usando Tableta");
    });

    it("renderiza una VentanaControl por cada aparato en su pestaña", () => {
        const a1 = crearAparato("aparato-1", "Teléfono");
        const a2 = crearAparato("aparato-2", "Tableta");
        const { rerender } = render(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-1" alCambiarAparato={vi.fn()} modoEspejo={false} alCambiarModoEspejo={vi.fn()} />);
        expect(screen.getByTestId("ventana-control-Teléfono")).toBeTruthy();
        expect(screen.queryByTestId("ventana-control-Tableta")).toBeFalsy();
        rerender(<VentanasAparatos aparatos={[a1, a2]} aparatoActivo="aparato-2" alCambiarAparato={vi.fn()} modoEspejo={false} alCambiarModoEspejo={vi.fn()} />);
        expect(screen.getByTestId("ventana-control-Tableta")).toBeTruthy();
        expect(screen.queryByTestId("ventana-control-Teléfono")).toBeFalsy();
    });
});