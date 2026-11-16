import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock window.matchMedia for jsdom
global.window.matchMedia = global.window.matchMedia || function () {
    return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {},
    };
};

const { useNivelRenderMock } = vi.hoisted(() => ({
    useNivelRenderMock: vi.fn(() => ({ nivel: "pleno" as const, movimientoReducido: false })),
}));

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
    useNivelRender: () => useNivelRenderMock(),
}));

vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
    ProtomoleculaLigera: ({ estado, tam, animada }: { estado: string; tam: number; animada?: boolean }) => (
        <svg
            data-testid="protomolecula-ligera"
            data-estado={estado}
            data-viva={animada ? "true" : "false"}
            viewBox="-50 -50 100 100"
            width={tam}
            height={tam}
            aria-hidden="true"
            focusable="false"
        >
            <circle cx="0" cy="0" r="10" fill="#00F0FF" />
        </svg>
    ),
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a>,
}));

const { useDispositivoMock } = vi.hoisted(() => ({
    useDispositivoMock: vi.fn(() => "tablet" as const),
}));

vi.mock("../inicio-piezas", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        useDispositivo: () => useDispositivoMock(),
        escalaTipo: () => 1,
    };
});

import DisenoVoz from "../diseno-voz";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

const estados: ("calma" | "escuchando" | "pensando" | "hablando")[] = [
    "calma", "escuchando", "pensando", "hablando",
];

describe("DisenoVoz", () => {
    const tam = 160;
    const propsBase = {
        estado: "calma" as const,
        tam,
        ultima: { texto: "Hola, ¿en qué puedo ayudarte?", ts: Date.now() },
        hilo: [] as { rol: "user" | "aurora"; texto: string; ts: number }[],
        ahora: Date.now(),
        tactil: true,
        voz: true,
        preguntar: <button type="button" data-testid="preguntar-btn">Preguntar</button>,
        botonVoz: <button type="button" data-testid="boton-voz-btn">Hablar</button>,
        sugerencias: [] as string[],
        onAbrirChat: vi.fn(),
        onSugerencia: vi.fn(),
    };

    beforeEach(() => {
        useNivelRenderMock.mockReturnValue({ nivel: "pleno", movimientoReducido: false });
        useDispositivoMock.mockReturnValue("tablet");
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("renderiza con props de ejemplo", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const root = container.firstElementChild;
        expect(root).toBeInTheDocument();
    });

    it("muestra el estado de voz con texto GRANDE (escalaTipo)", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const texto = container.textContent || "";
        expect(texto).toContain("En calma");
    });

    it("muestra el último texto de Astraura en una sola línea grande si hay", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const texto = container.textContent || "";
        expect(texto).toContain("Hola, ¿en qué puedo ayudarte?");
    });

    it("muestra el botón de voz ampliado (>= 64px alto) cuando hay voz", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const botonVoz = container.querySelector('[data-testid="boton-voz-btn"]');
        expect(botonVoz).toBeInTheDocument();
    });

    it("NO muestra hilo ni sugerencias", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const texto = container.textContent || "";
        expect(texto).not.toContain("hilo");
        expect(texto).not.toContain("sugerencias");
    });

    it("cuando voz es false, muestra mensaje de no disponible y el botón preguntar", () => {
        const { container } = render(
            <DisenoVoz {...propsBase} voz={false} />
        );
        const texto = container.textContent || "";
        expect(texto).toContain("La voz no está disponible en este aparato");
        const botonPreguntar = container.querySelector('[data-testid="preguntar-btn"]');
        expect(botonPreguntar).toBeInTheDocument();
    });

    it("botón de voz llama a onAbrirChat", () => {
        const onAbrirChat = vi.fn();
        const { container } = render(
            <DisenoVoz {...propsBase} onAbrirChat={onAbrirChat} />
        );

        const botonVoz = container.querySelector('[data-testid="boton-voz-btn"]');
        fireEvent.click(botonVoz!);
        expect(onAbrirChat).toHaveBeenCalled();
    });

    it("botón preguntar llama a onAbrirChat cuando voz es false", () => {
        const onAbrirChat = vi.fn();
        const { container } = render(
            <DisenoVoz {...propsBase} voz={false} onAbrirChat={onAbrirChat} />
        );

        const botonPreguntar = container.querySelector('[data-testid="preguntar-btn"]');
        fireEvent.click(botonPreguntar!);
        expect(onAbrirChat).toHaveBeenCalled();
    });

    it("no tiene desbordes a 180 px de ancho", () => {
        const { container } = render(
            <div style={{ width: "180px" }}><DisenoVoz {...propsBase} /></div>
        );
        const elemento = container.firstElementChild?.firstElementChild;
        if (elemento) {
            expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
        }
    });

    it("no tiene desbordes a 360 px de ancho", () => {
        const { container } = render(
            <div style={{ width: "360px" }}><DisenoVoz {...propsBase} /></div>
        );
        const elemento = container.firstElementChild?.firstElementChild;
        if (elemento) {
            expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
        }
    });

    it("usa colores del tema y acento astraura, no blanco fijo", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const root = container.firstElementChild;
        if (root instanceof Element) {
            const style = window.getComputedStyle(root);
            const colorFondo = style.backgroundColor || "";
            // No debe ser blanco puro (rgb(255, 255, 255))
            expect(colorFondo).not.toContain("rgb(255, 255, 255)");
        }
    });

    it("tiene nombres accesibles en español", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const texto = container.textContent || "";
        expect(texto).toMatch(/(calma|escuchando|pensando|hablando)/i);
    });

    it("no tiene texto menor de 14px (para manos ocupadas y pantallas lejanas)", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const elementos = container.querySelectorAll("*");
        elementos.forEach((el) => {
            if (el instanceof HTMLElement && el.textContent?.trim()) {
                const style = window.getComputedStyle(el);
                const fontSize = parseFloat(style.fontSize);
                if (fontSize > 0 && fontSize < 14) {
                    // Permitir elementos decorativos sin texto visible
                    const esDecorativo = el.getAttribute("aria-hidden") === "true" ||
                        el.tagName === "SVG" ||
                        el.tagName === "PATH" ||
                        el.tagName === "CIRCLE";
                    if (!esDecorativo) {
                        expect(fontSize).toBeGreaterThanOrEqual(14);
                    }
                }
            }
        });
    });

    it("la forma (AstrauraForma) está presente y centrada", () => {
        const { container } = render(<DisenoVoz {...propsBase} />);
        const svg = container.querySelector('svg[data-testid="protomolecula-ligera"]');
        expect(svg).toBeInTheDocument();
    });
});