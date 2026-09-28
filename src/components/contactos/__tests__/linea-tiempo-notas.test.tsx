// @vitest-environment jsdom
/**
 * linea-tiempo-notas.test.tsx — la línea de tiempo agrupa por mes (más reciente arriba),
 * añade notas con tipo y fecha vía `useNotasContacto().agregar` (almacén mockeado), filtra
 * por tipo, confirma los borrados y, en modo compacto, enseña solo las 3 últimas.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { NotaContacto } from "@/lib/contactos/tipos";

const est = vi.hoisted(() => ({ notas: [] as NotaContacto[], listo: true, error: null as string | null }));
const agregarMock = vi.fn();
const editarMock = vi.fn();
const eliminarMock = vi.fn();

vi.mock("@/lib/contactos/store", () => ({
    useNotasContacto: () => ({
        listo: est.listo,
        notas: est.notas,
        error: est.error,
        agregar: (n: unknown) => agregarMock(n),
        editar: (id: string, c: unknown) => editarMock(id, c),
        eliminar: (id: string) => eliminarMock(id),
    }),
}));

import { LineaTiempoNotas } from "@/components/contactos/linea-tiempo-notas";

function nota(id: string, fecha: string, extra: Partial<NotaContacto> = {}): NotaContacto {
    return { id, fecha, tipo: "nota", texto: `Texto ${id}`, etiquetas: [], creado: fecha, actualizado: fecha, borrado: null, ...extra };
}

beforeEach(() => {
    est.listo = true;
    est.error = null;
    // Ya ordenadas de la más reciente a la más antigua, como las entrega el almacén.
    est.notas = [
        nota("n1", "2026-09-20T12:00:00.000Z", { tipo: "encuentro", texto: "Café en la plaza", etiquetas: ["huerto"] }),
        nota("n2", "2026-09-03T12:00:00.000Z", { tipo: "llamada", texto: "Llamada de cumpleaños" }),
        nota("n3", "2026-08-15T12:00:00.000Z", { tipo: "regalo", texto: "Le regalé un libro de mapas" }),
    ];
    agregarMock.mockReset();
    editarMock.mockReset();
    eliminarMock.mockReset();
});
afterEach(() => cleanup());

describe("LineaTiempoNotas", () => {
    test("agrupa por mes, más reciente arriba, con el aviso de privacidad", () => {
        render(<LineaTiempoNotas contactoId="c1" />);
        expect(screen.getByText("Solo tú ves estas notas")).toBeInTheDocument();
        const meses = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent ?? "");
        expect(meses[0]).toMatch(/^Septiembre de 2026/);
        expect(meses[1]).toMatch(/^Agosto de 2026/);
        expect(meses).toHaveLength(2);
        expect(screen.getAllByTestId("nota-contacto")).toHaveLength(3);
        expect(screen.getByText("Café en la plaza")).toBeInTheDocument();
        expect(screen.getByText("huerto")).toBeInTheDocument();
    });

    test("añade una nota con su tipo, fecha y etiquetas", () => {
        render(<LineaTiempoNotas contactoId="c1" />);
        fireEvent.click(screen.getByRole("radio", { name: /Hito/ }));
        fireEvent.change(screen.getByLabelText("Texto de la nota"), { target: { value: "  Se mudó al valle  " } });
        fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-07-04" } });
        const etiquetas = screen.getByLabelText("Etiquetas");
        fireEvent.change(etiquetas, { target: { value: "mudanza" } });
        fireEvent.keyDown(etiquetas, { key: "Enter" });
        fireEvent.click(screen.getByRole("button", { name: /Añadir a la línea de tiempo/ }));

        expect(agregarMock).toHaveBeenCalledTimes(1);
        const n = agregarMock.mock.calls[0][0];
        expect(n).toMatchObject({ texto: "Se mudó al valle", tipo: "hito", etiquetas: ["mudanza"] });
        const fecha = new Date(n.fecha);
        expect(fecha.getFullYear()).toBe(2026);
        expect(fecha.getMonth()).toBe(6);
        expect(fecha.getDate()).toBe(4);
    });

    test("el botón de añadir espera a que haya texto", () => {
        render(<LineaTiempoNotas contactoId="c1" />);
        expect(screen.getByRole("button", { name: /Añadir a la línea de tiempo/ })).toBeDisabled();
    });

    test("filtra por tipo y pide confirmación antes de borrar", async () => {
        render(<LineaTiempoNotas contactoId="c1" />);
        fireEvent.click(screen.getByRole("button", { name: "Llamada · 1" }));
        // Las que salen se animan antes de desaparecer del DOM.
        await waitFor(() => expect(screen.getAllByTestId("nota-contacto")).toHaveLength(1));
        const visibles = screen.getAllByTestId("nota-contacto");
        expect(within(visibles[0]).getByText("Llamada de cumpleaños")).toBeInTheDocument();

        fireEvent.click(within(visibles[0]).getByRole("button", { name: "Eliminar nota" }));
        expect(eliminarMock).not.toHaveBeenCalled();
        fireEvent.click(within(visibles[0]).getByRole("button", { name: "Eliminar" }));
        expect(eliminarMock).toHaveBeenCalledWith("n2");
    });

    test("edita en línea conservando la fecha si no se cambia el día", () => {
        render(<LineaTiempoNotas contactoId="c1" />);
        const primera = screen.getAllByTestId("nota-contacto")[0];
        fireEvent.click(within(primera).getByRole("button", { name: "Editar nota" }));
        fireEvent.change(within(primera).getByLabelText("Texto de la nota"), { target: { value: "Café largo en la plaza" } });
        fireEvent.click(within(primera).getByRole("button", { name: /Guardar cambios/ }));
        expect(editarMock).toHaveBeenCalledWith("n1", expect.objectContaining({ texto: "Café largo en la plaza", fecha: "2026-09-20T12:00:00.000Z" }));
    });

    test("compacta: solo las 3 últimas y un enlace a verlas todas", () => {
        est.notas = [
            ...est.notas,
            nota("n4", "2026-06-01T12:00:00.000Z"),
            nota("n5", "2026-05-01T12:00:00.000Z"),
        ];
        render(<LineaTiempoNotas contactoId="c-9" compacta />);
        expect(screen.getAllByTestId("nota-contacto")).toHaveLength(3);
        const enlace = screen.getByRole("link", { name: /Ver todas/ });
        expect(enlace).toHaveAttribute("href", "/contactos?c=c-9");
        expect(enlace).toHaveTextContent("(5)");
        // En compacto el compositor empieza plegado.
        expect(screen.queryByLabelText("Texto de la nota")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Añadir nota/ }));
        expect(screen.getByLabelText("Texto de la nota")).toBeInTheDocument();
    });

    test("sin notas enseña una invitación, y un error de sincronía se avisa sin romper nada", () => {
        est.notas = [];
        est.error = "sin red";
        render(<LineaTiempoNotas contactoId="c1" />);
        expect(screen.getByText("Su historia contigo empieza aquí")).toBeInTheDocument();
        expect(screen.getByText(/No se pudo sincronizar con la nube \(sin red\)/)).toBeInTheDocument();
    });
});
