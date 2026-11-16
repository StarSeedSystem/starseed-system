import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import { AstrauraForma, type EstadoAsistente } from "../astraura-forma";
import { recortarPalabras } from "../comun";
import { haceCuanto } from "../inicio-piezas";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { DisenoConversacion } from "../diseno-conversacion";

let ahoraRef = Date.now();
vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
    useNivelRender: () => "pleno",
    leerSenalesDispositivo: () => ({ nucleos: 8, memoriaGB: 16, movimientoReducido: false, ahorroDatos: false, bateriaBaja: false, enXR: false }),
}));

const preguntaMock = vi.fn();
const sugerenciaMock = vi.fn();
const abrirChatMock = vi.fn();
const botonVozMock = () => <button data-testid="boton-voz" onClick={abrirChatMock} aria-label="Hablar">Hablar</button>;

function baseProps(overrides: Partial<PropsDiseno> = {}): PropsDiseno {
    return {
        estado: "calma",
        tam: 120,
        ultima: null,
        hilo: [],
        ahora: ahoraRef,
        tactil: false,
        voz: true,
        preguntar: <div data-testid="preguntar" onClick={preguntaMock}>Preguntar</div>,
        botonVoz: botonVozMock(),
        sugerencias: ["Resúmeme mi día", "¿Qué hay nuevo?"],
        onAbrirChat: abrirChatMock,
        onSugerencia: sugerenciaMock,
        ...overrides,
    };
}

function monta(props: Partial<PropsDiseno> = {}) {
    return render(<DisenoConversacion {...baseProps(props)} />);
}

beforeEach(() => {
    vi.clearAllMocks();
    ahoraRef = Date.now();
    localStorage.clear();
});
afterEach(() => cleanup());

describe("DisenoConversacion", () => {
    it("sin hilo: muestra el mensaje de vacío y el botón de preguntar", () => {
        monta({ hilo: [], ultima: null });
        expect(screen.getByText("Aún no habéis hablado. Pregúntale lo que quieras.")).toBeInTheDocument();
        expect(screen.getByTestId("preguntar")).toBeInTheDocument();
    });

    it("con hilo: muestra hasta 3 turnos con roles y tiempo en el último de Astraura", () => {
        const hilo = [
            { rol: "user" as const, texto: "Hola, ¿cómo estás?", ts: ahoraRef - 120_000 },
            { rol: "aurora" as const, texto: "Todo bien, ¿en qué te ayudo?", ts: ahoraRef - 60_000 },
            { rol: "user" as const, texto: "Cuéntame algo", ts: ahoraRef - 30_000 },
            { rol: "aurora" as const, texto: "La red está tranquila hoy.", ts: ahoraRef - 10_000 },
        ];
        monta({ hilo, ultima: { texto: hilo[3].texto, ts: hilo[3].ts } });
        const items = screen.getAllByRole("listitem");
        expect(items.length).toBeLessThanOrEqual(3);
        expect(screen.getByText(/Tú: Hola/)).toBeInTheDocument();
        expect(screen.getByText(/Todo bien/)).toBeInTheDocument();
        const ultimoAstraura = items[items.length - 1];
        expect(ultimoAstraura).toHaveAttribute("title", "La red está tranquila hoy.");
        expect(ultimoAstraura.textContent).toMatch(/hace \d+ (min|h|días)/);
    });

    it("el botón de voz llama a onAbrirChat", () => {
        monta({ voz: true });
        fireEvent.click(screen.getByTestId("boton-voz"));
        expect(abrirChatMock).toHaveBeenCalled();
    });

    it("el campo de preguntar llama a onSugerencia al hacer clic en sugerencia", () => {
        monta({ sugerencias: ["Resúmeme mi día"] });
        fireEvent.click(screen.getByText("Resúmeme mi día"));
        expect(sugerenciaMock).toHaveBeenCalledWith("Resúmeme mi día");
    });

    it("a 180px y 360px de ancho no hay desbordamiento horizontal", () => {
        const wrapper180 = document.createElement("div");
        wrapper180.style.width = "180px";
        document.body.appendChild(wrapper180);
        const { container: c180, unmount: u180 } = render(<DisenoConversacion {...baseProps()} />, { container: wrapper180 });
        const widget180 = c180.querySelector("[data-diseno]") as HTMLElement;
        expect(widget180?.scrollWidth).toBeLessThanOrEqual((widget180?.clientWidth ?? 0) + 1);
        u180();
        wrapper180.remove();

        const wrapper360 = document.createElement("div");
        wrapper360.style.width = "360px";
        document.body.appendChild(wrapper360);
        const { container: c360, unmount: u360 } = render(<DisenoConversacion {...baseProps()} />, { container: wrapper360 });
        const widget360 = c360.querySelector("[data-diseno]") as HTMLElement;
        expect(widget360?.scrollWidth).toBeLessThanOrEqual((widget360?.clientWidth ?? 0) + 1);
        u360();
        wrapper360.remove();
    });

    it("los nombres accesibles están en español", () => {
        monta({ hilo: [{ rol: "user", texto: "Hola", ts: ahoraRef }] });
        expect(screen.getByRole("list", { name: /última conversación/i })).toBeInTheDocument();
    });

    it("usa PilaAjustable y Prescindible para recortar turnos viejos", () => {
        const hiloLargo = Array.from({ length: 6 }, (_, i) => ({
            rol: i % 2 === 0 ? "user" as const : "aurora" as const,
            texto: `Mensaje ${i + 1}`,
            ts: ahoraRef - (6 - i) * 60_000,
        }));
        monta({ hilo: hiloLargo, ultima: { texto: hiloLargo[5].texto, ts: hiloLargo[5].ts } });
        expect(screen.queryByText("Mensaje 1")).not.toBeInTheDocument();
        expect(screen.getByText("Mensaje 6")).toBeInTheDocument();
    });
});

describe("utilidades puras", () => {
    it("recortarPalabras no corta palabras y añade elipsis", () => {
        expect(recortarPalabras("Hola mundo", 20)).toBe("Hola mundo");
        expect(recortarPalabras("Hola mundo cruel", 10)).toBe("Hola…");
    });

    it("haceCuanto devuelve formatos relativos en español", () => {
        const base = 1_000_000_000_000;
        expect(haceCuanto(base - 30_000, base)).toBe("ahora");
        expect(haceCuanto(base - 90_000, base)).toBe("hace 2 min");
        expect(haceCuanto(base - 2 * 3_600_000, base)).toBe("hace 2 h");
        expect(haceCuanto(base - 2 * 86_400_000, base)).toBe("hace 2 días");
    });
});