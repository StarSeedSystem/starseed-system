// @vitest-environment jsdom
/**
 * contactos-perfil.test.tsx — la rejilla de VISITA (lista pública) con
 * `listarContactosPublicos` mockeado: nunca toca Supabase real. La libreta
 * privada (`useContactos`) se mockea "cargando" para que las tarjetas monten
 * <BotonAnadirContacto> en su estado más simple (sin Popover/DropdownMenu).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/context/account-context", () => ({ useAccount: () => ({ user: null }) }));

vi.mock("@/lib/contactos/store", () => ({
    useContactos: () => ({
        listo: false, // hidratando: BotonAnadirContacto pinta un span inerte, sin Radix.
        sinSesion: false,
        contactos: [],
        categorias: [],
        listas: [],
        error: null,
        porId: () => undefined,
        porUserId: () => undefined,
        crear: vi.fn(),
        actualizar: vi.fn(),
        eliminar: vi.fn(),
        alternarFavorito: vi.fn(),
        cambiarVisibilidad: vi.fn(async () => null),
        crearCategoria: vi.fn(),
        editarCategoria: vi.fn(),
        eliminarCategoria: vi.fn(),
        crearLista: vi.fn(),
        editarLista: vi.fn(),
        eliminarLista: vi.fn(),
        importar: vi.fn(),
    }),
}));

const listarMock = vi.fn();
vi.mock("@/lib/contactos/publicos", () => ({
    listarContactosPublicos: (...args: unknown[]) => listarMock(...args),
}));

import { ContactosPerfil } from "../contactos-perfil";

function fila(over: { contactoUserId: string; displayName: string; username: string; etiqueta?: string | null }) {
    return {
        contactoUserId: over.contactoUserId,
        etiqueta: over.etiqueta ?? null,
        perfil: { userId: over.contactoUserId, displayName: over.displayName, username: over.username, bio: "" },
    };
}

describe("ContactosPerfil — visitas (lista pública)", () => {
    beforeEach(() => listarMock.mockReset());
    afterEach(() => cleanup());

    test("pinta la rejilla pública con contador y buscador, y pide la lista del dueño correcto", async () => {
        listarMock.mockResolvedValue({
            filas: [
                fila({ contactoUserId: "u1", displayName: "Uno", username: "uno", etiqueta: "Amistad" }),
                fila({ contactoUserId: "u2", displayName: "Dos", username: "dos" }),
            ],
            error: null,
        });

        render(<ContactosPerfil ownerUserId="owner-1" esPropio={false} />);

        await waitFor(() => expect(screen.getByText("Uno")).toBeInTheDocument());
        expect(screen.getByText("Dos")).toBeInTheDocument();
        expect(screen.getByText("@uno")).toBeInTheDocument();
        expect(screen.getByText("Amistad")).toBeInTheDocument();
        expect(screen.getByText("2 contactos")).toBeInTheDocument();
        expect(listarMock).toHaveBeenCalledWith("owner-1");
    });

    test("estado vacío honesto cuando el dueño no comparte contactos públicos", async () => {
        listarMock.mockResolvedValue({ filas: [], error: null });
        render(<ContactosPerfil ownerUserId="owner-1" esPropio={false} />);
        await waitFor(() =>
            expect(screen.getByText(/Aún no comparte contactos públicos/i)).toBeInTheDocument(),
        );
    });

    test("cuando la tabla pública aún no existe, muestra el aviso amable en vez de lanzar", async () => {
        listarMock.mockResolvedValue({
            filas: [],
            error: "La lista pública aún no está disponible en este servidor.",
        });
        render(<ContactosPerfil ownerUserId="owner-1" esPropio={false} />);
        await waitFor(() =>
            expect(screen.getByText(/lista pública aún no está disponible/i)).toBeInTheDocument(),
        );
    });
});
