// @vitest-environment jsdom
/**
 * boton-anadir-contacto.test.tsx — mockea `@/lib/contactos/store` y
 * `@/context/account-context` (nunca la nube real) para probar los tres
 * estados: sin contacto (popover → crear con "privada" por defecto), ya es
 * contacto (pastilla) y propio perfil (oculto).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Radix Popover mide el ancla con `ResizeObserver` (vía @radix-ui/react-use-size);
// jsdom no lo define. Stub mínimo, solo para este archivo.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const cuentaActual = { id: "visitante-1" as string | null };
vi.mock("@/context/account-context", () => ({
    useAccount: () => ({ user: cuentaActual.id ? { id: cuentaActual.id } : null }),
}));

const crearMock = vi.fn();
const cambiarVisibilidadMock = vi.fn(async (..._args: unknown[]) => null as string | null);
const eliminarMock = vi.fn();
const porUserIdMock = vi.fn();

function apiBase() {
    return {
        listo: true,
        sinSesion: false,
        contactos: [] as unknown[],
        categorias: [] as unknown[], // vacío a propósito: sin Select de categoría en el popover
        listas: [] as unknown[],
        error: null as string | null,
        porId: () => undefined,
        porUserId: (uid: string) => porUserIdMock(uid),
        crear: (entrada: unknown) => crearMock(entrada),
        actualizar: vi.fn(),
        eliminar: (id: string) => eliminarMock(id),
        alternarFavorito: vi.fn(),
        cambiarVisibilidad: (...args: unknown[]) => cambiarVisibilidadMock(...args),
        crearCategoria: vi.fn(),
        editarCategoria: vi.fn(),
        eliminarCategoria: vi.fn(),
        crearLista: vi.fn(),
        editarLista: vi.fn(),
        eliminarLista: vi.fn(),
        importar: vi.fn(),
    };
}
let contactosApi = apiBase();

vi.mock("@/lib/contactos/store", () => ({
    useContactos: () => contactosApi,
}));

import { BotonAnadirContacto } from "../boton-anadir-contacto";

describe("BotonAnadirContacto", () => {
    beforeEach(() => {
        cuentaActual.id = "visitante-1";
        contactosApi = apiBase();
        crearMock.mockReset();
        crearMock.mockImplementation((entrada: Record<string, unknown>) => ({ id: "nuevo-1", ...entrada }));
        cambiarVisibilidadMock.mockClear();
        eliminarMock.mockReset();
        porUserIdMock.mockReset();
        porUserIdMock.mockReturnValue(undefined);
    });

    afterEach(() => cleanup());

    test("sin contacto: el popover crea con relación 'amistad' y visibilidad privada por defecto", async () => {
        render(<BotonAnadirContacto userId="persona-1" username="ana" nombre="Ana" bio="Hola" variante="completo" />);

        expect(screen.queryByText("En tus contactos")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /añadir a contactos/i }));

        const botonGuardar = await screen.findByRole("button", { name: /^añadir$/i });
        fireEvent.click(botonGuardar);

        await waitFor(() => expect(crearMock).toHaveBeenCalledTimes(1));
        const entrada = crearMock.mock.calls[0][0] as Record<string, unknown>;
        expect(entrada.userId).toBe("persona-1");
        expect(entrada.username).toBe("ana");
        expect(entrada.nombre).toBe("Ana");
        expect(entrada.relacion).toBe("amistad");
        expect(entrada.origen).toBe("starseed");
        expect(entrada.categorias).toEqual([]);

        // Privada es el default: nunca se llama a cambiarVisibilidad para publicarlo.
        expect(cambiarVisibilidadMock).not.toHaveBeenCalled();
    });

    test("sin contacto: eligiendo 'Pública' antes de Añadir sí publica el contacto nuevo", async () => {
        render(<BotonAnadirContacto userId="persona-1" username="ana" nombre="Ana" variante="completo" />);
        fireEvent.click(screen.getByRole("button", { name: /añadir a contactos/i }));

        fireEvent.click(await screen.findByRole("radio", { name: /pública/i }));
        fireEvent.click(screen.getByRole("button", { name: /^añadir$/i }));

        await waitFor(() => expect(crearMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(cambiarVisibilidadMock).toHaveBeenCalledWith("nuevo-1", "publica"));
    });

    test("ya es contacto: pastilla teal «En tus contactos», sin el botón de añadir", () => {
        porUserIdMock.mockReturnValue({
            id: "c1",
            userId: "persona-1",
            username: "ana",
            nombre: "Ana",
            relacion: "amistad",
            visibilidad: "privada",
            telefonos: [],
            correos: [],
            enlaces: [],
            categorias: [],
            listas: [],
            favorito: false,
            origen: "starseed",
            creado: "2026-01-01T00:00:00.000Z",
            actualizado: "2026-01-01T00:00:00.000Z",
            borrado: null,
        });

        render(<BotonAnadirContacto userId="persona-1" username="ana" nombre="Ana" variante="completo" />);

        expect(screen.getByText("En tus contactos")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /añadir a contactos/i })).not.toBeInTheDocument();
    });

    test("propio perfil: no renderiza nada (ni siquiera cargando)", () => {
        cuentaActual.id = "persona-1";
        const { container } = render(<BotonAnadirContacto userId="persona-1" username="ana" nombre="Ana" />);
        expect(container).toBeEmptyDOMElement();
    });

    test("sin sesión: enlaza a /login en vez de abrir el popover", () => {
        cuentaActual.id = null;
        contactosApi = { ...apiBase(), sinSesion: true };
        render(<BotonAnadirContacto userId="persona-1" username="ana" nombre="Ana" variante="completo" />);
        const enlace = screen.getByRole("link", { name: /inicia sesión/i });
        expect(enlace).toHaveAttribute("href", "/login");
        expect(crearMock).not.toHaveBeenCalled();
    });
});
