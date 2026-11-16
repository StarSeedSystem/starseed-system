import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PanelConversacion, crearMaquinaFalsa } from "../panel-conversacion";
import type { EstadoConversacion, TurnoCompleto, EventoConversacion, Hablante } from "@/lib/traductor/conversacion";
import type { EstadoPar } from "@/lib/traductor/tipos";

function crearMaquinaTest() {
    const turnos: TurnoCompleto[] = [];
    let estadoActual: EstadoConversacion = { fase: "inactivo" };
    const listeners: ((estado: EstadoConversacion) => void)[] = [];

    const notificar = (nuevo: EstadoConversacion) => {
        estadoActual = nuevo;
        listeners.forEach((l) => l(nuevo));
    };

    const maquina = {
        get estado() { return estadoActual; },
        set estado(n: EstadoConversacion) { notificar(n); },
        enviarEvento: vi.fn((evento: EventoConversacion) => {
            if (evento.tipo === "pulsarHablar") {
                notificar({ fase: "escuchando", quien: evento.quien, inicioMs: Date.now(), parcial: "" });
            } else if (evento.tipo === "resultadoFinal") {
                const quien = estadoActual.fase === "escuchando" ? estadoActual.quien : "A";
                const ahora = Date.now();
                notificar({ fase: "traduciendo", quien, inicioMs: ahora - 100, textoOriginal: evento.texto, inicioTraduccionMs: ahora });
                setTimeout(() => {
                    notificar({
                        fase: "hablando",
                        quien,
                        inicioMs: ahora - 200,
                        texto: evento.texto,
                        traduccion: "translated " + evento.texto,
                        inicioTraduccionMs: ahora - 100,
                        inicioHablaMs: ahora,
                    });
                    turnos.push({
                        quien,
                        texto: evento.texto,
                        traduccion: "translated " + evento.texto,
                        msReconocer: 100,
                        msTraducir: 50,
                        msHablar: 200,
                    });
                    setTimeout(() => {
                        notificar({ fase: "inactivo" });
                    }, 10);
                }, 10);
            } else if (evento.tipo === "resultadoParcial") {
                if (estadoActual.fase === "escuchando") {
                    notificar({ ...estadoActual, parcial: evento.texto });
                }
            }
        }),
        reiniciar: vi.fn(() => { estadoActual = { fase: "inactivo" }; notificar(estadoActual); }),
        hayReconocimiento: vi.fn(() => true),
        hayVoz: vi.fn(() => true),
        audioSaleDelAparato: vi.fn(() => true),
        suscribir: (fn: (estado: EstadoConversacion) => void) => {
            listeners.push(fn);
            return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
        },
        _turnos: turnos,
    };

    return maquina;
}

const parDefecto = { origen: "es", destino: "en" };
const estadoDeParMock = vi.fn((): EstadoPar => "sin-internet");

describe("PanelConversacion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        estadoDeParMock.mockReturnValue("sin-internet");
    });

    it("renderiza las dos mitades con sus idiomas", () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        expect(screen.getByTestId("mitad-a")).toBeInTheDocument();
        expect(screen.getByTestId("mitad-b")).toBeInTheDocument();
        expect(screen.getByText("Español")).toBeInTheDocument();
        expect(screen.getByText("English")).toBeInTheDocument();
    });

    it("muestra el aviso de traducción no simultánea", () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        expect(screen.getByTestId("aviso-no-simultaneo")).toBeInTheDocument();
        expect(screen.getByText(/traducción en tiempo real no es simultánea/i)).toBeInTheDocument();
    });

    it("deshabilita el micrófono cuando no hay reconocimiento", () => {
        const maquina = crearMaquinaFalsa({
            estado: { fase: "inactivo" },
            enviarEvento: vi.fn(),
            reiniciar: vi.fn(),
            hayReconocimiento: () => false,
            hayVoz: () => true,
            audioSaleDelAparato: () => true,
        });

        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const micA = screen.getByTestId("mic-a");
        expect(micA).toBeDisabled();
        expect(micA).toHaveAttribute("aria-disabled", "true");
    });

    it("renderiza turnos completados con sus milisegundos", async () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const btnHablarA = screen.getByTestId("btn-hablar-a");
        fireEvent.click(btnHablarA);

        // Simular resultado final de reconocimiento
        await waitFor(() => {
            expect(screen.getByTestId("estado-a")).toHaveTextContent("Escuchando…");
        });

        maquina.enviarEvento({ tipo: "resultadoFinal", texto: "hola mundo" });

        await waitFor(() => {
            expect(screen.getByTestId("original-a")).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByTestId("traducido-a")).toBeInTheDocument();
        });

        expect(screen.getByTestId("ms-reconocer-a")).toBeInTheDocument();
        expect(screen.getByTestId("ms-traducir-a")).toBeInTheDocument();
        expect(screen.getByTestId("ms-hablar-a")).toBeInTheDocument();
    });

    it("muestra estado 'escuchando' con texto parcial", async () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const btnHablarA = screen.getByTestId("btn-hablar-a");
        fireEvent.click(btnHablarA);

        await waitFor(() => {
            expect(screen.getByTestId("estado-a")).toHaveTextContent("Escuchando…");
        });

        // Simular resultado parcial
        maquina.enviarEvento({ tipo: "resultadoParcial", texto: "hola" });

        await waitFor(() => {
            expect(screen.getByTestId("parcial-a")).toBeInTheDocument();
        });

        expect(screen.getByText("hola")).toBeInTheDocument();
    });

    it("ofrece input de texto cuando no hay reconocimiento", () => {
        const maquina = crearMaquinaFalsa({
            estado: { fase: "inactivo" },
            enviarEvento: vi.fn(),
            reiniciar: vi.fn(),
            hayReconocimiento: (quien) => quien === "A" ? false : true,
            hayVoz: () => true,
            audioSaleDelAparato: () => true,
        });

        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        expect(screen.getByTestId("aviso-input-a")).toBeInTheDocument();
        expect(screen.getByTestId("input-a")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Escribe tu mensaje…")).toBeInTheDocument();
    });

    it("ofrece input de texto cuando no hay voz de salida", () => {
        const maquina = crearMaquinaFalsa({
            estado: { fase: "inactivo" },
            enviarEvento: vi.fn(),
            reiniciar: vi.fn(),
            hayReconocimiento: () => true,
            hayVoz: (quien) => quien === "A" ? false : true,
            audioSaleDelAparato: () => true,
        });

        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        expect(screen.getByTestId("aviso-input-a")).toBeInTheDocument();
        expect(screen.getByTestId("input-a")).toBeInTheDocument();
    });

    it("gira la mitad B cuando girarMitadB es true", () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} girarMitadB />);

        const mitadB = screen.getByTestId("mitad-b");
        expect(mitadB).toHaveStyle({ transformOrigin: "center" });
    });

    it("muestra indicador de audio que sale del aparato", () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const saleElements = screen.getAllByText("Sale");
        expect(saleElements.length).toBeGreaterThanOrEqual(1);
    });

    it("envía evento al pulsar micrófono cuando hay reconocimiento", () => {
        const maquina = crearMaquinaTest();
        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const btnHablarA = screen.getByTestId("btn-hablar-a");
        fireEvent.click(btnHablarA);

        expect(maquina.enviarEvento).toHaveBeenCalledWith(
            expect.objectContaining({ tipo: "pulsarHablar", quien: "A" })
        );
    });

    it("envía resultadoFinal al enviar texto escrito", () => {
        const maquina = crearMaquinaFalsa({
            estado: { fase: "inactivo" },
            enviarEvento: vi.fn(),
            reiniciar: vi.fn(),
            hayReconocimiento: (quien) => quien === "A" ? false : true,
            hayVoz: () => true,
            audioSaleDelAparato: () => true,
        });

        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const input = screen.getByTestId("input-a");
        fireEvent.change(input, { target: { value: "hola mundo" } });
        const btnEnviar = screen.getByTestId("enviar-a");
        fireEvent.click(btnEnviar);

        expect(maquina.enviarEvento).toHaveBeenCalledWith(
            expect.objectContaining({ tipo: "resultadoFinal", texto: "hola mundo" })
        );
    });

    it("no envía evento si el micrófono está deshabilitado", () => {
        const maquina = crearMaquinaFalsa({
            estado: { fase: "inactivo" },
            enviarEvento: vi.fn(),
            reiniciar: vi.fn(),
            hayReconocimiento: () => false,
            hayVoz: () => true,
            audioSaleDelAparato: () => true,
        });

        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        const micA = screen.getByTestId("mic-a");
        fireEvent.click(micA);

        expect(maquina.enviarEvento).not.toHaveBeenCalled();
    });

    it("muestra error cuando la máquina lo reporta", () => {
        const maquina = crearMaquinaFalsa({
            estado: { fase: "inactivo" },
            enviarEvento: vi.fn(),
            reiniciar: vi.fn(),
            hayReconocimiento: () => true,
            hayVoz: () => true,
            audioSaleDelAparato: () => true,
        });

        render(<PanelConversacion par={parDefecto} onCambiarPar={vi.fn()} estadoDePar={estadoDeParMock} maquina={maquina} />);

        expect(screen.queryByTestId("error-a")).not.toBeInTheDocument();
    });
});

describe("crearMaquinaFalsa", () => {
    it("crea una máquina con estado inicial inactivo", () => {
        const maquina = crearMaquinaFalsa();
        expect(maquina.estado.fase).toBe("inactivo");
    });

    it("permite suscribirse a cambios de estado", () => {
        const maquina = crearMaquinaFalsa();
        const cambios: EstadoConversacion[] = [];
        const desuscribir = maquina.suscribir((e) => cambios.push(e));

        maquina.estado = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "" };
        expect(cambios).toHaveLength(1);
        expect(cambios[0].fase).toBe("escuchando");

        desuscribir();
        maquina.estado = { fase: "inactivo" };
        expect(cambios).toHaveLength(1);
    });

    it("reiniciar vuelve al estado inactivo", () => {
        const maquina = crearMaquinaFalsa();
        maquina.estado = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "hola" };
        maquina.reiniciar();
        expect(maquina.estado.fase).toBe("inactivo");
    });

    it("permite configurar hayReconocimiento y hayVoz", () => {
        const maquina = crearMaquinaFalsa({
            hayReconocimiento: (quien) => quien === "A",
            hayVoz: (quien) => quien === "B",
        });

        expect(maquina.hayReconocimiento("A")).toBe(true);
        expect(maquina.hayReconocimiento("B")).toBe(false);
        expect(maquina.hayVoz("A")).toBe(false);
        expect(maquina.hayVoz("B")).toBe(true);
    });

    it("permite configurar audioSaleDelAparato", () => {
        const maquina = crearMaquinaFalsa({
            audioSaleDelAparato: (quien) => quien === "A",
        });

        expect(maquina.audioSaleDelAparato("A")).toBe(true);
        expect(maquina.audioSaleDelAparato("B")).toBe(false);
    });
});