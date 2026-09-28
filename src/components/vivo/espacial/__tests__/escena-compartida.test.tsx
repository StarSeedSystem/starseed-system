/**
 * Escena 3D compartida · interfaz: estados claros (cargando, error, lectura, sala de llamada),
 * dock con etiquetas completas, panel «Añadir» vertical que llama a la sesión, y la tarjeta XR
 * honesta cuando el dispositivo no admite VR/AR. El lienzo 3D (three/R3F) va simulado.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EstadoAvatares, EstadoSesionEscena, SesionEscena } from "@/lib/vivo/espacial/sesion";
import { crearObjeto, docVacio, sanearObjeto } from "@/lib/vivo/espacial/modelo";
import { aplicarObjetos } from "@/lib/vivo/espacial/fusion";

const h = vi.hoisted(() => ({
    estado: null as unknown as EstadoSesionEscena,
    avatares: { yo: null, otros: [] } as EstadoAvatares,
    sesion: null as unknown as SesionEscena,
    lienzoProps: null as Record<string, unknown> | null,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...resto}>
            {children}
        </a>
    ),
}));
vi.mock("next/dynamic", () => ({
    default: () =>
        function LienzoSimulado(props: Record<string, unknown>) {
            h.lienzoProps = props;
            return <div data-testid="lienzo-3d" />;
        },
}));
vi.mock("../use-sesion-escena", () => ({
    useSesionEscena: () => ({ sesion: h.sesion, estado: h.estado, avatares: h.avatares }),
}));

import { EscenaCompartida } from "../escena-compartida";

function estado(extra: Partial<EstadoSesionEscena> = {}): EstadoSesionEscena {
    return {
        fase: "lista",
        error: null,
        titulo: "Maqueta del huerto",
        doc: docVacio(),
        puedeEditar: true,
        persistente: true,
        conectado: true,
        guardado: "guardado",
        aviso: null,
        sinConfirmar: 0,
        ...extra,
    };
}

function sesionFalsa(): SesionEscena {
    return {
        anadir: vi.fn(() => null),
        actualizar: vi.fn(() => true),
        borrar: vi.fn(() => true),
        duplicar: vi.fn(() => null),
        cambiarAmbiente: vi.fn(() => true),
        previsualizar: vi.fn(),
        emitirPose: vi.fn(),
        cambiarModo: vi.fn(),
        visibilidad: vi.fn(),
        guardarYa: vi.fn(async () => undefined),
        guardarCopia: vi.fn(async () => ({ id: "11111111-1111-1111-1111-111111111111" })),
        cerrar: vi.fn(),
    } as unknown as SesionEscena;
}

const FUENTE = { tipo: "espacio" as const, id: "11111111-2222-3333-4444-555555555555" };

beforeEach(() => {
    h.sesion = sesionFalsa();
    h.estado = estado();
    h.avatares = {
        yo: { clave: "yo:1", uid: null, nombre: "Alex", color: "#7C5CFF", modo: "3d", editor: true, desde: 1 },
        otros: [{ clave: "ana:2", uid: null, nombre: "Ana", color: "#10B981", modo: "vr", editor: true, desde: 2 }],
    };
    h.lienzoProps = null;
});
afterEach(cleanup);

describe("EscenaCompartida", () => {
    test("mientras carga lo dice y no monta el lienzo", () => {
        h.estado = estado({ fase: "cargando", titulo: "" });
        render(<EscenaCompartida fuente={FUENTE} />);
        expect(screen.getByText("Abriendo la escena…")).toBeInTheDocument();
        expect(screen.queryByTestId("lienzo-3d")).toBeNull();
    });

    test("un error se explica en español con salida", () => {
        h.estado = estado({ fase: "error", error: "No se encuentra esta escena, o no tienes acceso a ella." });
        render(<EscenaCompartida fuente={FUENTE} volver={{ ruta: "/escena", etiqueta: "Volver a mis escenas" }} />);
        expect(screen.getByRole("alert")).toHaveTextContent("No se encuentra esta escena");
        expect(screen.getAllByRole("link", { name: /Volver a mis escenas/ })[0]).toHaveAttribute("href", "/escena");
    });

    test("lista: título, estado de guardado, personas y dock con etiquetas completas", () => {
        render(<EscenaCompartida fuente={FUENTE} />);
        expect(screen.getByRole("heading", { name: "Maqueta del huerto" })).toBeInTheDocument();
        expect(screen.getByText("Guardado")).toBeInTheDocument();
        expect(screen.getByTestId("lienzo-3d")).toBeInTheDocument();
        for (const etiqueta of ["Añadir", "Escena", "Personas"]) {
            expect(screen.getByRole("button", { name: etiqueta })).toBeInTheDocument();
        }
        expect(screen.getByRole("button", { name: "Personas dentro: 2" })).toBeInTheDocument();
        expect(h.lienzoProps?.puedeEditar).toBe(true);
    });

    test("«Añadir» abre un menú vertical y crea el objeto en la sesión", () => {
        render(<EscenaCompartida fuente={FUENTE} />);
        fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
        expect(screen.getByText("Formas")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Esfera/ }));
        expect(h.sesion.anadir).toHaveBeenCalledWith("esfera", expect.objectContaining({ color: expect.stringMatching(/^#/) }));
    });

    test("«Escena» lista los objetos (acceso por teclado) y elegir uno abre su inspector", () => {
        const faro = sanearObjeto(crearObjeto("luz", { nombre: "Faro" }, { actualizado: 1, por: "a", id: "o_faro" }))!;
        h.estado = estado({ doc: aplicarObjetos(docVacio(), [faro]).doc });
        render(<EscenaCompartida fuente={FUENTE} />);
        fireEvent.click(screen.getByRole("button", { name: "Escena" }));
        expect(screen.getByText("Objetos (1)")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Faro/ }));
        expect(screen.getByRole("heading", { name: "Luz" })).toBeInTheDocument();
        expect(screen.getByLabelText("Nombre")).toHaveValue("Faro");
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("heading", { name: "Luz" })).toBeNull();
    });

    test("imagen: rechaza direcciones que no son https antes de tocar la sesión", () => {
        render(<EscenaCompartida fuente={FUENTE} />);
        fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
        fireEvent.click(screen.getByRole("button", { name: /Imagen/ }));
        fireEvent.change(screen.getByLabelText("Dirección https"), { target: { value: "http://ejemplo.org/a.png" } });
        fireEvent.click(screen.getByRole("button", { name: "Añadir a la escena" }));
        expect(screen.getByRole("alert")).toHaveTextContent("https://");
        expect(h.sesion.anadir).not.toHaveBeenCalled();
    });

    test("solo lectura: lo dice y no ofrece añadir", () => {
        h.estado = estado({ puedeEditar: false, guardado: "lectura" });
        render(<EscenaCompartida fuente={FUENTE} />);
        expect(screen.getByText("Solo lectura")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
        expect(screen.getByText(/modo lectura/)).toBeInTheDocument();
        expect(screen.queryByText("Formas")).toBeNull();
    });

    test("sala de llamada: se presenta como efímera y permite guardar una copia", async () => {
        h.estado = estado({ persistente: false, guardado: "efimera", titulo: "Sala de la llamada" });
        render(<EscenaCompartida fuente={{ tipo: "llamada", sesionId: "abcdefgh1234" }} enfoqueXR />);
        expect(screen.getByText("Sala de la llamada", { selector: "span" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Personas" }));
        expect(screen.getByText(/viven mientras haya alguien dentro/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Guardar una copia/ }));
        expect(await screen.findByRole("link", { name: "Abrir la copia guardada" })).toHaveAttribute(
            "href",
            "/escena/11111111-1111-1111-1111-111111111111",
        );
    });

    test("la tarjeta XR es honesta mientras comprueba y cuando el dispositivo no puede", async () => {
        const { act } = await import("react");
        render(<EscenaCompartida fuente={FUENTE} enfoqueXR modoPedido="vr" />);
        expect(screen.getByText("Comprobando realidad virtual y aumentada…")).toBeInTheDocument();
        const onXR = h.lienzoProps?.onXR as (e: unknown) => void;
        act(() => onXR({ vr: false, ar: false, activa: false, modo: null, error: null, entrar: vi.fn(), salir: vi.fn() }));
        expect(screen.getByText(/no está disponible/)).toBeInTheDocument();
        expect(screen.getByText(/misma sala que los demás/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Entrar en VR" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Seguir en 3D" }));
        expect(screen.queryByText(/no está disponible/)).toBeNull();
    });

    test("con VR disponible ofrece entrar y el botón llama a la sesión XR", async () => {
        const { act } = await import("react");
        const entrar = vi.fn(async () => undefined);
        render(<EscenaCompartida fuente={FUENTE} enfoqueXR modoPedido="vr" />);
        const onXR = h.lienzoProps?.onXR as (e: unknown) => void;
        act(() => onXR({ vr: true, ar: false, activa: false, modo: null, error: null, entrar, salir: vi.fn() }));
        const botones = screen.getAllByRole("button", { name: "Entrar en VR" });
        fireEvent.click(botones[0]);
        expect(entrar).toHaveBeenCalledWith("immersive-vr");
    });
});
