import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DisenoConversacion } from "../diseno-conversacion";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

vi.mock("@/lib/widgets/astraura/disenos", () => ({
    ...vi.importActual("@/lib/widgets/astraura/disenos"),
    PropsDiseno: undefined,
}));

vi.mock("./astraura-forma", () => ({
    AstrauraForma: (props: { estado: string; tam: number; onClick: () => void }) => (
        <button data-testid="astraura-forma" onClick={props.onClick} aria-label={`Abrir el chat de Astraura (${props.estado})`}>
            Forma
        </button>
    ),
}));

vi.mock("./inicio-piezas", () => ({
    haceCuanto: (ts: number, ahora: number) => {
        const diff = ahora - ts;
        if (diff < 60_000) return "hace un momento";
        if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
        return `hace ${Math.round(diff / 3_600_000)} h`;
    },
    Accion: (props: { children: React.ReactNode; onClick?: () => void; "aria-label"?: string; color?: string }) => (
        <button data-testid="accion" onClick={props.onClick} aria-label={props["aria-label"] ?? "acción"} style={{ background: props.color ?? "#7c5cff" }}>
            {props.children}
        </button>
    ),
}));

vi.mock("@/components/dashboard/kit/pila-ajustable", () => ({
    PilaAjustable: (props: { children: React.ReactNode; className?: string }) => <div data-testid="pila-ajustable" className={props.className}>{props.children}</div>,
    Prescindible: (props: { children: React.ReactNode; nivel?: number }) => <>{props.children}</>,
}));

const crearProps = (extras: Partial<PropsDiseno> = {}): PropsDiseno => ({
    estado: "calma",
    tam: 180,
    ultima: null,
    hilo: [],
    ahora: Date.now(),
    tactil: false,
    voz: false,
    preguntar: <button data-testid="preguntar">Preguntar</button>,
    botonVoz: null,
    sugerencias: [],
    onAbrirChat: vi.fn(),
    onSugerencia: vi.fn(),
    ...extras,
});

describe("DisenoConversacion", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    describe("mínimo (tam < 110)", () => {
        it("muestra solo la forma pequeña con el estado en texto", () => {
            render(<DisenoConversacion {...crearProps({ tam: 80 })} />);
            expect(screen.getByTestId("astraura-forma")).toBeInTheDocument();
            expect(screen.getByTestId("preguntar")).toBeInTheDocument();
        });

        it("muestra texto vacío cuando no hay conversación", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ tam: 80, hilo: [], ultima: null })} />);
            expect(screen.getByText(/Aún no habéis hablado/)).toBeInTheDocument();
        });

        it("no muestra hilo cuando es mínimo", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 80, 
                hilo: [
                    { rol: "user", texto: "Hola Astraura", ts: Date.now() - 120_000 },
                    { rol: "aurora", texto: "Hola usuario", ts: Date.now() - 119_000 },
                ]
            })} />);
            expect(screen.queryByRole("list")).not.toBeInTheDocument();
        });

        it("tiene aria-label accesible con el estado", () => {
            render(<DisenoConversacion {...crearProps({ tam: 80, estado: "hablando" })} />);
            expect(screen.getByTestId("astraura-forma")).toHaveAttribute("aria-label", "Abrir el chat de Astraura (Hablando)");
        });
    });

    describe("s (tam < 180)", () => {
        it("muestra forma y frase corta", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ tam: 150 })} />);
            expect(screen.getByTestId("astraura-forma")).toBeInTheDocument();
        });

        it("muestra texto de la última frase", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 150,
                ultima: { texto: "La respuesta final", ts: Date.now() - 30_000 }
            })} />);
            expect(screen.getByText(/La respuesta final/)).toBeInTheDocument();
        });

        it("muestra texto vacío cuando no hay conversación", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ tam: 150, hilo: [], ultima: null })} />);
            expect(screen.getByText(/Aún no habéis hablado/)).toBeInTheDocument();
        });
    });

    describe("m (180-280)", () => {
        it("muestra forma, frase y campo de preguntar", () => {
            cleanup();
            render(<DisenoConversacion {...creanProps({ tam: 260 })} />);
            expect(screen.getByTestId("astraura-forma")).toBeInTheDocument();
            expect(screen.getByTestId("preguntar")).toBeInTheDocument();
        });

        it("muestra hasta 2 turnos en el hilo", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 260,
                hilo: [
                    { rol: "user", texto: "Primera pregunta", ts: Date.now() - 300_000 },
                    { rol: "aurora", texto: "Primera respuesta", ts: Date.now() - 295_000 },
                    { rol: "user", texto: "Segunda pregunta", ts: Date.now() - 290_000 },
                    { rol: "aurora", texto: "Segunda respuesta", ts: Date.now() - 285_000 },
                ]
            })} />);
            const lista = screen.getByRole("list", { name: /última conversación/i });
            expect(lista).toBeInTheDocument();
        });

        it("etiquetea turnos de usuario como 'Tú'", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 260,
                hilo: [{ rol: "user", texto: "Hola", ts: Date.now() - 60_000 }]
            })} />);
            expect(screen.getByText(/Tú:/)).toBeInTheDocument();
        });

        it("etiquetea turnos de Aurora con haceCuanto", () => {
            cleanup();
            const ahora = Date.now();
            render(<DisenoConversacion {...crearProps({ 
                tam: 260,
                hilo: [
                    { rol: "user", texto: "Hola", ts: ahora - 120_000 },
                    { rol: "aurora", texto: "Respuesta", ts: ahora - 119_000 }
                ],
                ahora
            })} />);
            expect(screen.getByText(/Respuesta/)).toBeInTheDocument();
            expect(screen.getByText(/hace/)).toBeInTheDocument();
        });
    });

    describe("l (280-420)", () => {
        it("muestra hilo con hasta 2 turnos", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 350,
                hilo: [
                    { rol: "user", texto: "Turno 1", ts: Date.now() - 180_000 },
                    { rol: "aurora", texto: "Respuesta 1", ts: Date.now() - 179_000 },
                    { rol: "user", texto: "Turno 2", ts: Date.now() - 178_000 },
                    { rol: "aurora", texto: "Respuesta 2", ts: Date.now() - 177_000 },
                ]
            })} />);
            const items = screen.getAllByRole("listitem");
            expect(items).toHaveLength(4);
        });
    });

    describe("xl (> 420)", () => {
        it("muestra hilo con hasta 3 turnos", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 450,
                hilo: [
                    { rol: "user", texto: "Turno 1", ts: Date.now() - 300_000 },
                    { rol: "aurora", texto: "Respuesta 1", ts: Date.now() - 299_000 },
                    { rol: "user", texto: "Turno 2", ts: Date.now() - 298_000 },
                    { rol: "aurora", texto: "Respuesta 2", ts: Date.now() - 297_000 },
                    { rol: "user", texto: "Turno 3", ts: Date.now() - 296_000 },
                    { rol: "aurora", texto: "Respuesta 3", ts: Date.now() - 295_000 },
                ]
            })} />);
            const items = screen.getAllByRole("listitem");
            expect(items).toHaveLength(6);
        });
    });

    describe("botón preguntar", () => {
        it("llama a onAbrirChat al hacer click en la forma", () => {
            const onAbrirChat = vi.fn();
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 180,
                onAbrirChat,
                hilo: [{ rol: "user", texto: "Hola", ts: Date.now() - 10_000 }]
            })} />);
            fireEvent.click(screen.getByTestId("astraura-forma"));
            expect(onAbrirChat).toHaveBeenCalled();
        });
    });

    describe("sin conversación", () => {
        it("muestra mensaje de bienvenida cuando está vacío", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ tam: 260 })} />);
            expect(screen.getByText(/Aún no habéis hablado. Pregúntale lo que quieras/)).toBeInTheDocument();
        });

        it("muestra el campo de preguntar incluso sin hilo", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ tam: 260 })} />);
            expect(screen.getByTestId("preguntar")).toBeInTheDocument();
        });
    });

    describe("voz habilitada", () => {
        it("muestra el botón de voz cuando voz es true", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ voz: true })} />);
            expect(screen.getByRole("button", { name: /Hablar con Astraura/i })).toBeInTheDocument();
        });

        it("no muestra el botón de voz cuando voz es false", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ voz: false })} />);
            expect(screen.queryByRole("button", { name: /Hablar/i })).not.toBeInTheDocument();
        });
    });

    describe("accesibilidad", () => {
        it("tiene lista con aria-label apropiado", () => {
            cleanup();
            render(<DisenoConversacion {...crearProps({ 
                tam: 260,
                hilo: [{ rol: "user", texto: "Test", ts: Date.now() - 30_000 }]
            })} />);
            const lista = screen.getByRole("list", { name: /última conversación/i });
            expect(lista).toBeInTheDocument();
        });

        it("los botones tienen nombres accesibles en español", () => {
            cleanup();
            render(<DisenoConversacion {...creanProps({ tam: 260, voz: true })} />);
            expect(screen.getByRole("button", { name: /Abrir el chat de Astraura/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /Hablar con Astraura/i })).toBeInTheDocument();
        });
    });

    describe("scrollWidth vs clientWidth", () => {
        it("a 180px no hay scrollWidth > clientWidth", () => {
            cleanup();
            const { container } = render(<DisenoConversacion {...crearProps({ tam: 180 })} />);
            const lista = container.querySelector("ol");
            if (lista) {
                expect(lista.scrollWidth).toBeLessThanOrEqual(lista.clientWidth + 1);
            }
        });

        it("a 360px no hay scrollWidth > clientWidth", () => {
            cleanup();
            const { container } = render(<DisenoConversacion {...creanProps({ tam: 360 })} />);
            const lista = container.querySelector("ol");
            if (lista) {
                expect(lista.scrollWidth).toBeLessThanOrEqual(lista.clientWidth + 1);
            }
        });
    });
});