/** Portada de los programas: crear con plantilla, volver a los tuyos y saber los límites con honestidad. */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
    push: vi.fn(),
    crear: vi.fn(),
    listar: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/vivo/programa", () => ({ crearVivoPrograma: h.crear, listarMiosPrograma: h.listar }));

import { GaleriaPlantillas } from "../galeria-plantillas";
import { HubProgramas } from "../hub-programas";

beforeEach(() => {
    h.push.mockReset();
    h.crear.mockReset();
    h.listar.mockReset();
    h.listar.mockResolvedValue([]);
});
afterEach(cleanup);

describe("galería de plantillas", () => {
    test("siete plantillas con sus bloques a la vista; la primera viene elegida y se entrega la que se marca", () => {
        const alConfirmar = vi.fn();
        render(<GaleriaPlantillas etiquetaConfirmar="Empezar" alConfirmar={alConfirmar} />);
        const radios = screen.getAllByRole("radio");
        expect(radios).toHaveLength(7);
        expect(radios[0]).toHaveAttribute("aria-checked", "true");
        for (const nombre of ["Encuesta", "Lista compartida", "Tablero kanban", "Contador de votos", "Formulario de inscripción"]) {
            expect(screen.getByRole("radio", { name: new RegExp(`^${nombre}`) })).toBeInTheDocument();
        }
        fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
        expect(alConfirmar).toHaveBeenLastCalledWith("encuesta");
        fireEvent.click(screen.getByRole("radio", { name: /^Formulario de inscripción/ }));
        expect(screen.getByRole("radio", { name: /^Formulario de inscripción/ })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("radio", { name: /^Encuesta/ })).toHaveAttribute("aria-checked", "false");
        fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
        expect(alConfirmar).toHaveBeenLastCalledWith("formulario-de-inscripcion");
    });

    test("ocupado o deshabilitado no deja confirmar", () => {
        const alConfirmar = vi.fn();
        const { rerender } = render(<GaleriaPlantillas etiquetaConfirmar="Empezar" ocupado alConfirmar={alConfirmar} />);
        expect(screen.getByRole("button", { name: "Un momento…" })).toBeDisabled();
        rerender(<GaleriaPlantillas etiquetaConfirmar="Empezar" deshabilitado alConfirmar={alConfirmar} />);
        expect(screen.getByRole("button", { name: "Empezar" })).toBeDisabled();
        expect(alConfirmar).not.toHaveBeenCalled();
    });
});

describe("portada", () => {
    test("crear un programa navega a su ruta con el nombre y la plantilla elegidos", async () => {
        h.crear.mockResolvedValue({ refId: "abc", ruta: "/programa/abc" });
        render(<HubProgramas />);
        await waitFor(() => expect(screen.getByText("Aún no has creado ningún programa.")).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Nombre del programa/), { target: { value: "  Cena de fin de curso " } });
        fireEvent.click(screen.getByRole("radio", { name: /^Tablero kanban/ }));
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crear programa y entrar" })); });
        await waitFor(() => expect(h.push).toHaveBeenCalledWith("/programa/abc"));
        expect(h.crear).toHaveBeenCalledWith("Cena de fin de curso", { plantilla: "tablero-kanban" });
    });

    test("sin nombre usa el de la plantilla y un fallo se dice sin navegar", async () => {
        h.crear.mockRejectedValue(new Error("Inicia sesión para crear un programa en vivo."));
        render(<HubProgramas />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crear programa y entrar" })); });
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Inicia sesión para crear un programa en vivo."));
        expect(h.crear).toHaveBeenCalledWith("Encuesta rápida", { plantilla: "encuesta" });
        expect(h.push).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Crear programa y entrar" })).toBeEnabled();
    });

    test("lista tus programas como enlaces y avisa si no se pudo leer", async () => {
        h.listar.mockResolvedValueOnce([{ refId: "p1", titulo: "Lista del viaje", ruta: "/programa/p1" }]);
        const { unmount } = render(<HubProgramas />);
        const enlace = await screen.findByRole("link", { name: /Lista del viaje/ });
        expect(enlace).toHaveAttribute("href", "/programa/p1");
        unmount();
        h.listar.mockRejectedValueOnce(new Error("x"));
        render(<HubProgramas />);
        await waitFor(() => expect(screen.getByText(/No se pudo leer tu lista/)).toBeInTheDocument());
    });

    test("dice con claridad lo que un programa no es: no ejecuta código y los votos no son secretos", async () => {
        render(<HubProgramas />);
        await waitFor(() => expect(screen.getByText("Aún no has creado ningún programa.")).toBeInTheDocument());
        expect(screen.getByText(/No ejecuta código de nadie/)).toBeInTheDocument();
        expect(screen.getByText(/Los votos y las respuestas los ve todo el grupo/)).toBeInTheDocument();
        expect(screen.getByText(/Un enlace público solo deja mirar/)).toBeInTheDocument();
    });

    test("el botón de actualizar vuelve a leer la lista", async () => {
        render(<HubProgramas />);
        await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(1));
        h.listar.mockResolvedValueOnce([{ refId: "n1", titulo: "Nuevo", ruta: "/programa/n1" }]);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actualizar la lista de programas" })); });
        expect(await screen.findByRole("link", { name: /Nuevo/ })).toBeInTheDocument();
        expect(h.listar).toHaveBeenCalledTimes(2);
    });
});
