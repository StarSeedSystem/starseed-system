/** Portada de los juegos: crear una sala con el juego y las opciones elegidas, y volver a las tuyas. */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
    push: vi.fn(),
    crear: vi.fn(),
    listar: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/vivo/juego", () => ({ crearVivoJuego: h.crear, listarMiosJuego: h.listar }));

import { HubJuegos } from "../hub-juegos";
import { SelectorJuego } from "../selector-juego";

beforeEach(() => {
    h.push.mockReset();
    h.crear.mockReset();
    h.listar.mockReset();
    h.listar.mockResolvedValue([]);
});
afterEach(cleanup);

describe("selector de juego", () => {
    test("cuatro juegos; el Dibujo-adivina enseña tiempo y vueltas y los entrega como opciones", () => {
        const alConfirmar = vi.fn();
        render(<SelectorJuego etiquetaConfirmar="Crear" alConfirmar={alConfirmar} />);
        expect(screen.getAllByRole("radio").filter((r) => r.closest('[aria-label="Elige un juego"]'))).toHaveLength(4);
        fireEvent.click(screen.getByRole("button", { name: "Crear" }));
        expect(alConfirmar).toHaveBeenLastCalledWith("tres-en-raya", {});
        fireEvent.click(screen.getByRole("radio", { name: /Dibujo-adivina/ }));
        fireEvent.click(screen.getByRole("radio", { name: "120 segundos" }));
        fireEvent.click(screen.getByRole("radio", { name: "2 veces" }));
        fireEvent.click(screen.getByRole("button", { name: "Crear" }));
        expect(alConfirmar).toHaveBeenLastCalledWith("dibujo", { segundos: 120, vueltas: 2 });
    });

    test("ocupado o deshabilitado no deja confirmar", () => {
        render(<SelectorJuego etiquetaConfirmar="Crear" ocupado alConfirmar={() => {}} />);
        expect(screen.getByRole("button", { name: "Un momento…" })).toBeDisabled();
    });
});

describe("portada", () => {
    test("crear una sala navega a su ruta con el título elegido", async () => {
        h.crear.mockResolvedValue({ refId: "abc", ruta: "/juego/abc" });
        render(<HubJuegos />);
        await waitFor(() => expect(screen.getByText("Aún no has creado ninguna sala.")).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Nombre de la sala/), { target: { value: "  Partida del viernes " } });
        fireEvent.click(screen.getByRole("radio", { name: /Conecta 4/ }));
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crear sala y entrar" })); });
        await waitFor(() => expect(h.push).toHaveBeenCalledWith("/juego/abc"));
        expect(h.crear).toHaveBeenCalledWith("Partida del viernes", { juego: "conecta-4", opciones: {} });
    });

    test("sin nombre usa uno por defecto y un fallo se dice sin navegar", async () => {
        h.crear.mockRejectedValue(new Error("Inicia sesión para crear una sala en vivo."));
        render(<HubJuegos />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crear sala y entrar" })); });
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Inicia sesión para crear una sala en vivo."));
        expect(h.crear).toHaveBeenCalledWith("Sala de Tres en raya", { juego: "tres-en-raya", opciones: {} });
        expect(h.push).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Crear sala y entrar" })).toBeEnabled();
    });

    test("lista tus salas como enlaces, y avisa si no se pudo leer", async () => {
        h.listar.mockResolvedValueOnce([{ refId: "s1", titulo: "Ajedrez con Ana", ruta: "/juego/s1" }]);
        const { unmount } = render(<HubJuegos />);
        const enlace = await screen.findByRole("link", { name: /Ajedrez con Ana/ });
        expect(enlace).toHaveAttribute("href", "/juego/s1");
        unmount();
        h.listar.mockRejectedValueOnce(new Error("x"));
        render(<HubJuegos />);
        await waitFor(() => expect(screen.getByText(/No se pudo leer tu lista/)).toBeInTheDocument());
    });
});
