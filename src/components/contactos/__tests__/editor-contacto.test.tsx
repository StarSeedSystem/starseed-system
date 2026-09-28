// @vitest-environment jsdom
/**
 * editor-contacto.test.tsx — el editor crea y edita contactos a través de `useContactos`
 * (almacén mockeado: nunca la nube real), valida con mensajes amables y no deja publicar a
 * quien no tiene cuenta StarSeed.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { Contacto } from "@/lib/contactos/tipos";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));
vi.mock("@/lib/social/os-profiles", () => ({
    searchUsers: vi.fn(async () => []),
    fetchProfileByUsername: vi.fn(async () => null),
}));

const est = vi.hoisted(() => ({
    existente: undefined as Contacto | undefined,
}));

const crearMock = vi.fn();
const actualizarMock = vi.fn();
const cambiarVisibilidadMock = vi.fn(async () => null as string | null);

function contactoBase(extra: Partial<Contacto> = {}): Contacto {
    return {
        id: "c-1",
        userId: null,
        username: null,
        perfil: null,
        nombre: "Lucía Estrella",
        relacion: "amistad",
        telefonos: [],
        correos: [],
        enlaces: [],
        categorias: [],
        listas: [],
        favorito: false,
        visibilidad: "privada",
        origen: "manual",
        creado: "2026-09-01T10:00:00.000Z",
        actualizado: "2026-09-01T10:00:00.000Z",
        borrado: null,
        ...extra,
    };
}

vi.mock("@/lib/contactos/store", () => ({
    useContactos: () => ({
        listo: true,
        sinSesion: false,
        contactos: est.existente ? [est.existente] : [],
        categorias: [],
        listas: [],
        error: null,
        porId: (id: string) => (est.existente?.id === id ? est.existente : undefined),
        porUserId: () => undefined,
        crear: (entrada: unknown) => crearMock(entrada),
        actualizar: (id: string, cambios: unknown) => actualizarMock(id, cambios),
        eliminar: vi.fn(),
        alternarFavorito: vi.fn(),
        cambiarVisibilidad: (...a: unknown[]) => cambiarVisibilidadMock(...(a as [])),
        crearCategoria: vi.fn((nombre: string) => ({ id: `cat-${nombre}`, nombre, color: "#14B8A6" })),
        editarCategoria: vi.fn(),
        eliminarCategoria: vi.fn(),
        crearLista: vi.fn((nombre: string) => ({ id: `lista-${nombre}`, nombre, color: "#39FF14" })),
        editarLista: vi.fn(),
        eliminarLista: vi.fn(),
        importar: vi.fn(() => ({ nuevos: 0, fusionados: 0 })),
    }),
}));

import { EditorContacto } from "@/components/contactos/editor-contacto";

beforeEach(() => {
    est.existente = undefined;
    crearMock.mockReset();
    crearMock.mockImplementation((entrada: Partial<Contacto>) => contactoBase({ ...entrada, id: "nuevo-1" }));
    actualizarMock.mockReset();
    cambiarVisibilidadMock.mockClear();
});
afterEach(() => cleanup());

describe("EditorContacto", () => {
    test("crea un contacto con useContactos().crear y avisa con onGuardado", async () => {
        const onOpenChange = vi.fn();
        const onGuardado = vi.fn();
        render(<EditorContacto open onOpenChange={onOpenChange} onGuardado={onGuardado} />);

        const dialogo = screen.getByTestId("editor-contacto");
        expect(within(dialogo).getByText("Nuevo contacto")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "  Lucía Estrella  " } });
        fireEvent.change(screen.getByLabelText("Apodo"), { target: { value: "Lu" } });
        fireEvent.click(screen.getByRole("radio", { name: /Familia/ }));
        fireEvent.change(screen.getByLabelText("Matiz de la relación"), { target: { value: "prima" } });

        fireEvent.click(screen.getByRole("button", { name: /Añadir teléfono/ }));
        fireEvent.change(screen.getByLabelText("Teléfono 1"), { target: { value: "+34 600 111 222" } });
        fireEvent.click(screen.getByRole("button", { name: /Añadir correo/ }));
        fireEvent.change(screen.getByLabelText("Correo 1"), { target: { value: "lucia@estrella.org" } });

        fireEvent.click(screen.getByRole("button", { name: /Crear contacto/ }));

        await waitFor(() => expect(crearMock).toHaveBeenCalledTimes(1));
        const entrada = crearMock.mock.calls[0][0];
        expect(entrada).toMatchObject({
            nombre: "Lucía Estrella",
            apodo: "Lu",
            relacion: "familia",
            relacionDetalle: "prima",
            visibilidad: "privada",
            origen: "manual",
        });
        expect(entrada.telefonos).toEqual([expect.objectContaining({ etiqueta: "móvil", valor: "+34 600 111 222" })]);
        expect(entrada.correos).toEqual([expect.objectContaining({ etiqueta: "casa", valor: "lucia@estrella.org" })]);
        // Sin cuenta StarSeed no se intenta publicar nada.
        expect(cambiarVisibilidadMock).not.toHaveBeenCalled();
        await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(expect.objectContaining({ id: "nuevo-1" })));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test("valida con mensajes amables y no guarda si falta el nombre o un correo es inválido", async () => {
        render(<EditorContacto open onOpenChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: /Añadir correo/ }));
        fireEvent.change(screen.getByLabelText("Correo 1"), { target: { value: "no-es-un-correo" } });
        fireEvent.click(screen.getByRole("button", { name: /Crear contacto/ }));

        expect(await screen.findByText("Ponle un nombre para poder guardarlo.")).toBeInTheDocument();
        expect(screen.getByText(/Ese correo no parece válido/)).toBeInTheDocument();
        expect(screen.getByText("Revisa los 2 campos marcados.")).toBeInTheDocument();
        expect(screen.getByLabelText(/^Nombre/)).toHaveAttribute("aria-invalid", "true");
        expect(crearMock).not.toHaveBeenCalled();
    });

    test("la visibilidad pública está bloqueada sin cuenta StarSeed, con el motivo", () => {
        render(<EditorContacto open onOpenChange={vi.fn()} />);
        const interruptor = screen.getByRole("switch", { name: "Contacto público" });
        expect(interruptor).toBeDisabled();
        expect(screen.getByText(/Solo los contactos con cuenta StarSeed pueden ser públicos/)).toBeInTheDocument();
    });

    test("edita un contacto existente con actualizar()", async () => {
        est.existente = contactoBase({ telefonos: [{ id: "t1", etiqueta: "trabajo", valor: "912 345 678" }] });
        const onGuardado = vi.fn();
        render(<EditorContacto open onOpenChange={vi.fn()} contactoId="c-1" onGuardado={onGuardado} />);

        expect(screen.getByText("Editar contacto")).toBeInTheDocument();
        const nombre = screen.getByLabelText(/^Nombre/) as HTMLInputElement;
        expect(nombre.value).toBe("Lucía Estrella");
        fireEvent.change(nombre, { target: { value: "Lucía E." } });
        fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

        await waitFor(() => expect(actualizarMock).toHaveBeenCalledTimes(1));
        expect(actualizarMock.mock.calls[0][0]).toBe("c-1");
        expect(actualizarMock.mock.calls[0][1]).toMatchObject({
            nombre: "Lucía E.",
            telefonos: [expect.objectContaining({ id: "t1", etiqueta: "trabajo", valor: "912 345 678" })],
        });
        expect(crearMock).not.toHaveBeenCalled();
        await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(expect.objectContaining({ id: "c-1", nombre: "Lucía E." })));
    });
});
