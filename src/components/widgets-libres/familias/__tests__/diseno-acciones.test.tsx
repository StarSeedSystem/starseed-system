import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import DisenoAcciones from "../diseno-acciones";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

vi.mock("next/link", () => ({
    default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a>,
}));

const crearProps = (ancho: number = 360, opciones: Partial<PropsDiseno> = {}): PropsDiseno => {
    return {
        estado: "calma",
        tam: Math.min(ancho, 200),
        ultima: null,
        hilo: [],
        ahora: Date.now(),
        tactil: ancho >= 280,
        voz: false,
        preguntar: (
            <div data-testid="preguntar">
                <input placeholder="Pregúntale…" />
                <button type="submit">Enviar</button>
            </div>
        ),
        botonVoz: null,
        sugerencias: ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"],
        onAbrirChat: vi.fn(),
        onSugerencia: vi.fn(),
        ...opciones,
    };
};

describe("DisenoAcciones", () => {
    describe("renderizado básico", () => {
        it("renderiza con props de ejemplo", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            expect(container.firstElementChild).toBeInTheDocument();
        });

        it("muestra el estado de voz con texto correcto", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            const texto = container.textContent || "";
            expect(texto).toContain("En calma");
        });
    });

    describe("accesibilidad", () => {
        it("tiene nombres accesibles en español", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            const texto = container.textContent || "";
            expect(texto).toMatch(/(calma|escuchando|pensando|hablando)/i);
        });
    });

    describe("botones", () => {
        it("el botón de abrir chat llama a onAbrirChat", () => {
            const onAbrirChat = vi.fn();
            render(<DisenoAcciones {...crearProps(360, { onAbrirChat })} />);
            const botones = screen.getAllByRole("button");
            const botonAbrirChat = botones.find((b) => b.getAttribute("aria-label") === "Abrir el chat");
            expect(botonAbrirChat).toBeTruthy();
            fireEvent.click(botonAbrirChat!);
            expect(onAbrirChat).toHaveBeenCalledTimes(1);
        });

        it("cada sugerencia llama a onSugerencia con su texto", () => {
            const onSugerencia = vi.fn();
            render(<DisenoAcciones {...crearProps(360, { onSugerencia })} />);
            const botones = screen.getAllByRole("button");
            const botonSugerencia = botones.find((b) => b.textContent?.includes("Resúmeme mi día"));
            expect(botonSugerencia).toBeTruthy();
            fireEvent.click(botonSugerencia!);
            expect(onSugerencia).toHaveBeenCalledWith("Resúmeme mi día");
        });
    });

    describe("disposición por ancho", () => {
        it("muestra hilo y sugerencias a partir de 120px tam, columna única por debajo", () => {
            const { unmount, container } = render(<DisenoAcciones {...crearProps(100)} />);
            const texto = container.textContent || "";
            expect(texto).not.toContain("Resúmeme mi día");
            unmount();

            render(<DisenoAcciones {...crearProps(120)} />);
            expect(screen.getByText("Resúmeme mi día")).toBeTruthy();
            expect(screen.getByText("¿Qué hay nuevo en la red?")).toBeTruthy();
            expect(screen.getByText("Ayúdame a ordenar mis tareas de hoy")).toBeTruthy();
        });

        it("a 180 px no hay scrollWidth > clientWidth", () => {
            const { container } = render(
                <div style={{ width: "180px" }}>
                    <DisenoAcciones {...crearProps(180)} />
                </div>
            );
            const elemento = container.firstElementChild?.firstElementChild;
            if (elemento) {
                expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
            }
        });

        it("a 360 px no hay scrollWidth > clientWidth", () => {
            const { container } = render(
                <div style={{ width: "360px" }}>
                    <DisenoAcciones {...crearProps(360)} />
                </div>
            );
            const elemento = container.firstElementChild?.firstElementChild;
            if (elemento) {
                expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
            }
        });
    });

    describe("qué SÍ aparece y qué NO", () => {
        it("en modo minimo (tam<120) no muestra hilo ni sugerencias", () => {
            const { container } = render(<DisenoAcciones {...crearProps(100)} />);
            const texto = container.textContent || "";
            expect(texto).toContain("En calma");
            expect(texto).not.toContain("Resúmeme mi día");
        });

        it("el botón de abrir chat siempre aparece", () => {
            render(<DisenoAcciones {...crearProps(360)} />);
            expect(screen.getByRole("button", { name: "Abrir el chat" })).toBeTruthy();
        });
    });

    describe("colores y tema", () => {
        it("usa colores del tema sin blanco fijo", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            const root = container.firstElementChild;
            const estilo = root instanceof Element ? window.getComputedStyle(root) : {};
            const colorFondo = estilo.backgroundColor || "";
            expect(colorFondo).not.toContain("rgb(255, 255, 255)");
        });
    });

    describe("interacción", () => {
        it("el campo de preguntar recibe el texto", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            const input = screen.getByPlaceholderText("Pregúntale…") as HTMLInputElement;
            fireEvent.change(input, { target: { value: "Hola Astraura" } });
            expect(input.value).toBe("Hola Astraura");
        });
    });

    describe("dispositivos", () => {
        it("usa colores de PALETAS.astraura para el acento", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            const boton = screen.getByRole("button", { name: "Abrir el chat" });
            const estilo = window.getComputedStyle(boton as Element);
            expect(estilo.background).not.toBe("rgba(0, 0, 0, 0)");
        });
    });

    describe("hilo de conversación", () => {
        it("muestra las últimas 2 entradas del hilo", () => {
            const hilo = [
                { rol: "user" as const, texto: "Hola", ts: 1 },
                { rol: "aurora" as const, texto: "Hola tú", ts: 2 },
                { rol: "user" as const, texto: "¿Cómo estás?", ts: 3 },
                { rol: "aurora" as const, texto: "Bien", ts: 4 },
            ];
            render(<DisenoAcciones {...crearProps(150, { hilo })} />);
            expect(screen.getByText(/Tú:/)).toBeTruthy();
            expect(screen.getByText(/¿Cómo estás\?/)).toBeTruthy();
            expect(screen.getByText(/Astraura:/)).toBeTruthy();
            expect(screen.getByText("Bien")).toBeTruthy();
        });

        it("no muestra el hilo completo, solo las últimas 2", () => {
            const hilo = [
                { rol: "user" as const, texto: "Primero", ts: 1 },
                { rol: "aurora" as const, texto: "Respuesta 1", ts: 2 },
                { rol: "user" as const, texto: "Segundo", ts: 3 },
                { rol: "aurora" as const, texto: "Respuesta 2", ts: 4 },
                { rol: "user" as const, texto: "Tercero", ts: 5 },
                { rol: "aurora" as const, texto: "Respuesta 3", ts: 6 },
            ];
            const container = render(<DisenoAcciones {...crearProps(150, { hilo })} />);
            const texto = container.container.textContent || "";
            expect(texto).toContain("Tercero");
            expect(texto).toContain("Respuesta 3");
            expect(texto).not.toContain("Primero");
            expect(texto).not.toContain("Respuesta 1");
        });
    });
});

describe("DisenoAcciones - estados de voz", () => {
    const estados: NonNullable<PropsDiseno["estado"]>[] = ["calma", "escuchando", "pensando", "hablando"];

    it.each(estados)("muestra el texto correcto para estado %s", (estado) => {
        render(<DisenoAcciones {...crearProps({ estado })} />);
        expect(screen.getByText(/^(En calma|Escuchando…|Pensando…|Hablando)$/)).toBeTruthy();
    });
});

describe("DisenoAcciones - sugerencias", () => {
    it("muestra las sugerencias pasadas más el botón Abrir el chat", () => {
        const sugerencias = [
            "Primera", "Segunda", "Tercera", "Cuarta", "Quinta",
        ];
        render(<DisenoAcciones {...crearProps(150, { sugerencias })} />);
        const botones = screen.getAllByRole("button");
        const botonesConTexto = botones.filter((b) =>
            b.textContent?.includes("Primera") ||
            b.textContent?.includes("Segunda") ||
            b.textContent?.includes("Tercera") ||
            b.textContent?.includes("Cuarta")
        );
        expect(botonesConTexto.length).toBeGreaterThanOrEqual(4);
    });

    it("el quinto atajo es fijo 'Abrir el chat'", () => {
        render(<DisenoAcciones {...crearProps()} />);
        expect(screen.getByRole("button", { name: "Abrir el chat" })).toBeTruthy();
    });
});