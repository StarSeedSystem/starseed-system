import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import { _reiniciarFuentesParaPruebas } from "../fuente-compartida";
import type { BandejaMensajes } from "../mensajes-datos";

preparaDom();

const estado = vi.hoisted(() => ({ bandeja: null as BandejaMensajes | null, uid: "yo" as string | null, enviados: [] as string[] }));

vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => ({ uid: estado.uid, ready: true }) }));
vi.mock("@/lib/messages/dm", () => ({
    markRead: vi.fn(async () => undefined),
    sendMessage: vi.fn(async (_id: string, m: { body: string }) => { estado.enviados.push(m.body); return { id: "m-nuevo" }; }),
}));
vi.mock("@/lib/mensajeria/ajustes-store", () => ({
    useAjustesMensajeria: () => ({
        listo: true,
        ajustes: { privacidad: { mostrarEnLinea: "todos" } },
        efectivos: (id: string) => ({ archivado: id === "h-archivado", silenciado: false, apodo: null }),
    }),
}));
vi.mock("@/lib/contactos/store", () => ({ useContactos: () => ({ contactos: [], porUserId: () => undefined }) }));
vi.mock("../mensajes-datos", async (importOriginal) => {
    const real = await importOriginal<typeof import("../mensajes-datos")>();
    return { ...real, cargarBandeja: async () => ({ datos: estado.bandeja }) };
});

import { MessagesWidget } from "../../messages-widget";

const ahora = Date.now();
function bandeja(): BandejaMensajes {
    return {
        uid: "yo",
        perfiles: { luz: { nombre: "Luz Marina", handle: "luz", avatar: null } },
        vistos: { luz: ahora - 30_000 },
        hilos: [
            {
                id: "h1", tipo: "dm", titulo: null, avatar: null, miembros: ["yo", "luz"], companero: "luz",
                ultimo: { texto: "¿Vienes al huerto el sábado?", remitente: "luz", tipo: "user", adjunto: null, ms: ahora - 60_000 },
                recientes: [{ texto: "¿Vienes al huerto el sábado?", remitente: "luz", tipo: "user", adjunto: null, ms: ahora - 60_000 }],
                noLeidos: 2, noLeidosMas: false, ms: ahora - 60_000,
            },
            {
                id: "h-archivado", tipo: "dm", titulo: "Hilo archivado", avatar: null, miembros: ["yo", "x"], companero: "x",
                ultimo: null, recientes: [], noLeidos: 5, noLeidosMas: false, ms: ahora - 120_000,
            },
        ],
    };
}

beforeEach(() => {
    _reiniciarFuentesParaPruebas();
    estado.uid = "yo";
    estado.enviados = [];
});
afterEach(() => cleanup());

describe("Mensajes · bandeja real por tamaño", () => {
    it("vacío honesto con la acción que lo llena", async () => {
        estado.bandeja = { uid: "yo", hilos: [], perfiles: {}, vistos: {} };
        render(<EnMarco clase="m"><MessagesWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio"));
        expect(screen.getByText("Tu bandeja está tranquila")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Nuevo mensaje" })).toHaveAttribute("href", "/messages");
    });

    it("sin sesión invita a entrar", async () => {
        estado.uid = null;
        render(<EnMarco clase="m"><MessagesWidget /></EnMarco>);
        expect(await screen.findByText("Entra en tu cuenta")).toBeInTheDocument();
        expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-sesion", "no");
    });

    it("s: quién espera, sin enseñar lo archivado", async () => {
        estado.bandeja = bandeja();
        render(<EnMarco clase="s"><MessagesWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "listo"));
        expect(screen.getByText("Luz Marina")).toBeInTheDocument();
        expect(screen.queryByText("Hilo archivado")).toBeNull();
        expect(screen.getByRole("link", { name: /2 sin leer/ })).toHaveAttribute("href", "/messages?to=luz");
    });

    it("m: la bandeja con no leídos y enlace al chat", async () => {
        estado.bandeja = bandeja();
        render(<EnMarco clase="m"><MessagesWidget /></EnMarco>);
        const enlace = await screen.findByRole("link", { name: "Abrir conversación con Luz Marina" });
        expect(enlace).toHaveAttribute("href", "/messages?to=luz");
        expect(screen.getByLabelText("2 sin leer")).toBeInTheDocument();
    });

    it("l: responde en línea con la acción real", async () => {
        estado.bandeja = bandeja();
        render(<EnMarco clase="l"><MessagesWidget /></EnMarco>);
        fireEvent.click(await screen.findByRole("button", { name: "Responder a Luz Marina" }));
        const campo = screen.getByLabelText("Mensaje para Luz Marina");
        fireEvent.change(campo, { target: { value: "¡Allí estaré!" } });
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(estado.enviados).toEqual(["¡Allí estaré!"]));
        await waitFor(() => expect(screen.getByText("Tú: ¡Allí estaré!")).toBeInTheDocument());
    });

    it("micro: el número de no leídos (sin contar lo archivado)", async () => {
        estado.bandeja = bandeja();
        render(<EnMarco clase="micro"><MessagesWidget /></EnMarco>);
        expect(await screen.findByRole("link", { name: /^2 mensajes sin leer/ })).toBeInTheDocument();
    });
});
