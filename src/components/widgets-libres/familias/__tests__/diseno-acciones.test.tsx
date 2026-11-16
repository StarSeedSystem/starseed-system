import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DisenoAcciones } from "../diseno-acciones";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

vi.mock("@/lib/widgets/astraura/disenos", async (importOriginal) => {
    const mod = await importOriginal<typeof importOriginal>();
    return {
        ...mod,
        PropsDiseno: {} as PropsDiseno,
    };
});

const { AccionMock, esTactilMock, escalaTipoMock, useDispositivoMock, useClaseForzadaMock, haceCuantoMock } = vi.hoisted(() => ({
    AccionMock: vi.fn(({ children, onClick, color, className }: {
        children: React.ReactNode;
        onClick?: () => void;
        color?: string;
        className?: string;
    }) => {
        const ariaLabel = children ? children.toString() : "";
        return (
            <button
                type="button"
                onClick={onClick}
                className={className ?? "accion-mockeada"}
                style={{ color }}
                aria-label={ariaLabel}
                data-testid="accion"
            >
                {children}
            </button>
        );
    }),
    esTactilMock: vi.fn(() => false),
    escalaTipoMock: vi.fn(() => 1),
    useDispositivoMock: vi.fn(() => "escritorio" as const),
    useClaseForzadaMock: vi.fn(() => null),
    haceCuantoMock: vi.fn((ts: number, ahora = Date.now()) => `hace ${Math.round((ahora - ts) / 60000)} min`),
}));

vi.mock("@/components/widgets-libres/familias/inicio-piezas", () => ({
    Accion: (props: any) => <AccionMock {...props} />,
    esTactil: () => esTactilMock(),
    escalaTipo: () => escalaTipoMock(),
    useClaseForzada: () => useClaseForzadaMock(),
    useDispositivo: () => useDispositivoMock(),
    haceCuanto: () => haceCuantoMock(),
}));

vi.mock("@/lib/widgets/forma/tamanos", () => ({
    dispositivoActual: () => "escritorio",
}));

vi.mock("@/components/widgets-libres/familias/comun", () => ({
    disenoDe: (clase: string) => ({ base: clase === "micro" ? "micro" : clase === "s" ? "s" : "m", horizontal: false }),
    Rotulo: ({ children, color }: { children: React.ReactNode; color?: string }) => (
        <span style={{ color }} data-testid="rotulo">{children}</span>
    ),
    recortarPalabras: (t: string, max: number) => t.length > max ? t.slice(0, max) + "…" : t,
}));

vi.mock("@/components/dashboard/kit/pila-ajustable", () => ({
    PilaAjustable: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="pila-ajustable">{children}</div>
    ),
}));

vi.mock("lucide-react", () => ({
    MessageCircle: () => <svg data-testid="icono-message-circle" />,
    Sparkles: () => <svg data-testid="icono-sparkles" />,
}));

const crearProps = (extras: Partial<PropsDiseno> = {}): PropsDiseno => ({
    estado: "calma",
    tam: 300,
    ultima: null,
    hilo: [],
    ahora: Date.now(),
    tactil: false,
    voz: false,
    preguntar: <div data-testid="preguntar">Preguntar</div>,
    botonVoz: null,
    sugerencias: ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"],
    onAbrirChat: vi.fn(),
    onSugerencia: vi.fn(),
    ...extras,
});

describe("DisenoAcciones", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AccionMock.mockClear();
        esTactilMock.mockReturnValue(false);
        escalaTipoMock.mockReturnValue(1);
        useDispositivoMock.mockReturnValue("escritorio" as const);
        useClaseForzadaMock.mockReturnValue(null);
    });

    afterEach(() => {
        cleanup();
    });

    describe("renderizado básico", () => {
        it("muestra el estado del asistente", () => {
            render(<DisenoAcciones {...crearProps()} />);
            expect(screen.getByText("En calma")).toBeTruthy();
        });

        it("muestra el estado escuchando", () => {
            render(<DisenoAcciones {...crearProps({ estado: "escuchando" })} />);
            expect(screen.getByText("Escuchando…")).toBeTruthy();
        });

        it("muestra el estado hablando", () => {
            render(<DisenoAcciones {...crearProps({ estado: "hablando" })} />);
            expect(screen.getByText("Hablando")).toBeTruthy();
        });

        it("muestra el estado pensando", () => {
            render(<DisenoAcciones {...crearProps({ estado: "pensando" })} />);
            expect(screen.getByText("Pensando…")).toBeTruthy();
        });

        it("muestra el estado error", () => {
            render(<DisenoAcciones {...crearProps({ estado: "error" })} />);
            expect(screen.getByText("Algo falló")).toBeTruthy();
        });
    });

    describe("sugerencias", () => {
        it("muestra el orbe y hasta 2 sugerencias en m", () => {
            render(<DisenoAcciones {...crearProps({ tam: 300 })} />);
            const acciones = screen.getAllByTestId("accion");
            expect(acciones).toHaveLength(3);
        });

        it("llama a onSugerencia cuando se hace click en una sugerencia", () => {
            const onSugerencia = vi.fn();
            render(<DisenoAcciones {...crearProps({ onSugerencia })} />);
            const acciones = screen.getAllByTestId("accion");
            fireEvent.click(acciones[1]);
            expect(onSugerencia).toHaveBeenCalledWith("Resúmeme mi día");
        });

        it("muestra el botón 'Abrir el chat' con el aria-label correcto", () => {
            render(<DisenoAcciones {...crearProps()} />);
            const botonChat = screen.getByRole("button", { name: "Abrir el chat de Astraura" });
            expect(botonChat).toBeTruthy();
        });

        it("llama a onAbrirChat cuando se hace click en el botón de chat", () => {
            const onAbrirChat = vi.fn();
            render(<DisenoAcciones {...crearProps({ onAbrirChat })} />);
            const botonChat = screen.getByRole("button", { name: "Abrir el chat de Astraura" });
            fireEvent.click(botonChat);
            expect(onAbrirChat).toHaveBeenCalled();
        });
    });

    describe("preguntar", () => {
        it("muestra el campo para preguntar debajo", () => {
            render(<DisenoAcciones {...crearProps()} />);
            const pregunta = screen.queryByTestId("preguntar");
            expect(pregunta).toBeTruthy();
        });

        it("no muestra el campo de pregunta en minim", () => {
            render(<DisenoAcciones {...crearProps({ tam: 60 })} />);
            const pregunta = screen.queryByTestId("preguntar");
            expect(pregunta).toBeNull();
        });
    });

    describe("disposición responsive", () => {
        it("usa 1 columna cuando el ancho es menor de 280px", () => {
            const { container } = render(<DisenoAcciones {...crearProps({ tam: 200 })} />);
            const grid = container.querySelector("[data-diseno]");
            expect(grid?.className).toContain("grid-cols-1");
        });

        it("usa 2 columnas cuando el ancho es mayor o igual a 280px", () => {
            const { container } = render(<DisenoAcciones {...crearProps({ tam: 300 })} />);
            const grid = container.querySelector("[data-diseno]");
            expect(grid?.className).toMatch(/grid-cols-2/);
        });
    });

    describe("mínimo válido", () => {
        it("no muestra el hilo ni sugerencias cuando el estado es calma y es minim", () => {
            render(<DisenoAcciones {...crearProps({ estado: "calma", tam: 60 })} />);
            expect(screen.queryByTestId("preguntar")).toBeNull();
            expect(screen.getAllByTestId("accion").length).toBe(1);
        });
    });

    describe("colores de tema", () => {
        it("usa colores del tema para los textos", () => {
            const { container } = render(<DisenoAcciones {...crearProps()} />);
            const textoEstado = screen.getByText("En calma");
            expect(textoEstado.className).toMatch(/text-muted-foreground|text-foreground/);
        });
    });

    describe("accesibilidad", () => {
        it("el botón de chat tiene aria-label descriptivo", () => {
            render(<DisenoAcciones {...crearProps({ estado: "calma" })} />);
            const botonChat = screen.getByRole("button", { name: /Abrir el chat de Astraura/ });
            expect(botonChat).toBeTruthy();
        });
    });
});