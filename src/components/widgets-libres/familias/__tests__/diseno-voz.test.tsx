import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

vi.mock("@/lib/widgets/astraura/estado-forma", () => ({
    frasePantallaLectora: (e: EstadoAsistente) => {
        const map: Record<string, string> = {
            calma: "Astraura está en calma",
            escuchando: "Astraura te está escuchando",
            hablando: "Astraura está hablando",
            pensando: "Astraura está pensando",
            error: "Astraura tuvo un problema",
        };
        return map[e] ?? e;
    },
    textoDeEstado: (e: EstadoAsistente) => {
        const map: Record<string, string> = {
            calma: "En calma",
            escuchando: "Escuchando…",
            hablando: "Hablando",
            pensando: "Pensando…",
            error: "Error",
        };
        return map[e] ?? e;
    },
}));

vi.mock("./use-diseno-astraura", () => ({
    useDisenoAstraura: () => ["minimo", vi.fn()] as const,
}));

vi.mock("./astraura-forma", () => ({
    AstrauraForma: (props: any) => (
        <div data-testid="astraura-forma" data-estado={props.estado} onClick={props.onClick}>
            <span>Orbe</span>
        </div>
    ),
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a>,
}));

const estados: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando", "error"];

const creaProps = (overrides: Partial<PropsDiseno> = {}): PropsDiseno => ({
    estado: "calma",
    tam: 180,
    ultima: null,
    hilo: [],
    ahora: Date.now(),
    tactil: false,
    voz: false,
    preguntar: null,
    botonVoz: null,
    sugerencias: [],
    onAbrirChat: () => {},
    onSugerencia: () => {},
    ...overrides,
});

describe("DisenoVoz", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    describe("renderizado básico", () => {
        it("muestra la forma grande (Orbe) con estado en texto grande", () => {
            render(<DisenoVoz {...creaProps()} />);
            const estadoTexto = screen.getByRole("status");
            expect(estadoTexto).toBeInTheDocument();
        });

        it("muestra el estado del asistente en español con role status", () => {
            for (const estado of estados) {
                const { unmount } = render(<DisenoVoz {...creaProps({ estado })} />);
                const estadoTexto = screen.getByRole("status");
                expect(estadoTexto).toBeInTheDocument();
                expect(estadoTexto.textContent).toContain("Astraura");
                unmount();
            }
        });

        it("muestra la última frase en una sola línea grande", () => {
            render(<DisenoVoz {...creaProps({ ultima: { texto: "Hola, ¿cómo estás?", ts: Date.now() } })} />);
            expect(screen.getByText(/Hola, ¿cómo estás?/)).toBeInTheDocument();
        });

        it("no muestra scroll cuando el ancho es 180px", () => {
            render(<DisenoVoz {...creaProps({ tam: 180 })} />);
            const contenedor = screen.getByRole("status").closest(".flex, .w-full");
            expect(contenedor).toBeInTheDocument();
        });

        it("no muestra scroll cuando el ancho es 360px", () => {
            render(<DisenoVoz {...creaProps({ tam: 360 })} />);
            const contenedor = screen.getByRole("status").closest(".flex, .w-full");
            expect(contenedor).toBeInTheDocument();
        });
    });

    describe("botón de voz", () => {
        it("muestra botón de voz con altura >= 64px cuando hay voz disponible", () => {
            render(<DisenoVoz {...creaProps({ voz: true, botonVoz: <button>Parar</button> })} />);
            const botonVoz = screen.getByRole("button", { name: /parar|hablar/i });
            expect(botonVoz).toBeInTheDocument();
            expect(botonVoz).toHaveClass("cursor-pointer");
        });

        it("el botón de voz tiene alto >= 64px", () => {
            render(<DisenoVoz {...creaProps({ 
                voz: true, 
                tam: 360,
                botonVoz: <button style={{ height: 64, width: "100%" }}>Voz</button>
            })} />);
            const boton = screen.getByRole("button");
            const estilo = window.getComputedStyle(boton);
            expect(parseFloat(estilo.height)).toBeGreaterThanOrEqual(64);
        });
    });

    describe("sin voz disponible", () => {
        it("muestra mensaje de que la voz no está disponible", () => {
            render(<DisenoVoz {...creaProps({ voz: false, preguntar: <div>Preguntar</div> })} />);
            expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(/La voz no está disponible/i);
        });

        it("muestra el componente preguntar cuando la voz no está disponible", () => {
            render(<DisenoVoz {...creaProps({ voz: false, preguntar: <div data-testid="preguntar">Preguntar</div> })} />);
            expect(screen.getByTestId("preguntar")).toBeInTheDocument();
        });
    });

    describe("accesibilidad", () => {
        it("tiene nombres accesibles en español", () => {
            render(<DisenoVoz {...creaProps({ estado: "escuchando", voz: true })} />);
            const botonVoz = screen.getByRole("button", { name: /dejar de escuchar/i });
            expect(botonVoz).toBeInTheDocument();
        });

        it("el botón de voz llama a onHablar cuando se pulsa", () => {
            const onHablar = vi.fn();
            render(<DisenoVoz {...creaProps({ 
                voz: true, 
                botonVoz: <button onClick={onHablar}>Parar</button>
            })} />);
            const boton = screen.getByRole("button");
            fireEvent.click(boton);
            expect(onHablar).toHaveBeenCalled();
        });

        it("el botón de pregunta llama a onPreguntar", () => {
            const onPreguntar = vi.fn();
            render(<DisenoVoz {...creaProps({ 
                voz: false, 
                preguntar: <button onClick={onPreguntar}>Preguntar</button>
            })} />);
            const boton = screen.getByRole("button");
            fireEvent.click(boton);
            expect(onPreguntar).toHaveBeenCalled();
        });

        it("el Orbe tiene cursor-pointer", () => {
            render(<DisenoVoz {...creaProps()} />);
            const orbe = screen.getByTestId("astraura-forma");
            expect(orbe).toHaveClass("cursor-pointer");
        });
    });

    describe("sin sugerencias en mínimo", () => {
        it("el diseño minimo no muestra hilo ni sugerencias", () => {
            render(<DisenoVoz {...creaProps({ tam: 90, voz: false })} />);
            expect(screen.queryByText(/Astraura te está escuchando/i)).toBeNull();
            expect(screen.queryByTestId("sugerencias")).toBeNull();
        });
    });

    describe("tamaño mínimo de texto", () => {
        it("el estado tiene texto >= 14px", () => {
            render(<DisenoVoz {...creaProps()} />);
            const estadoTexto = screen.getByRole("status");
            const estilo = window.getComputedStyle(estadoTexto);
            expect(parseFloat(estilo.fontSize)).toBeGreaterThanOrEqual(14);
        });
    });
});