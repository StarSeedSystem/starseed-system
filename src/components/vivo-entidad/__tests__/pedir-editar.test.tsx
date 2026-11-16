/**
 * SES1116B — «Pedir editar» para quien sólo mira: los cuatro estados, la petición
 * única ante doble clic y el motivo del fallo tal cual.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PedirEditar, pedirEdicionDeSpaces, type ResultadoPedir } from "../pedir-editar";
import { AppearanceProvider } from "@/context/appearance-context";
import type { RangoSesion } from "@/lib/vivo-entidad/traduccion-roles";

afterEach(cleanup);

function pintar(rango: RangoSesion | null, pedir: () => Promise<ResultadoPedir>) {
    render(
        <AppearanceProvider>
            <PedirEditar rango={rango} pedir={pedir} />
        </AppearanceProvider>,
    );
}

describe("PedirEditar (SES1116B)", () => {
    it("con rango ver o comentar enseña el botón «Pedir editar»", () => {
        pintar("ver", vi.fn());
        expect(screen.getByTestId("boton-pedir-editar").textContent).toBe("Pedir editar");
        cleanup();
        pintar("comentar", vi.fn());
        expect(screen.getByTestId("boton-pedir-editar")).toBeTruthy();
    });

    it("con rango editar o superior, o sin rango, no se renderiza nada", () => {
        for (const rango of ["editar", "moderar", "gestionar", "dueno", null] as const) {
            const { container } = render(
                <AppearanceProvider>
                    <PedirEditar rango={rango} pedir={vi.fn()} />
                </AppearanceProvider>,
            );
            expect(container.querySelector('[data-testid="pedir-editar"]')).toBeNull();
            cleanup();
        }
    });

    it("un clic llama a pedir una vez y muestra «Pedida: quien gestiona la verá»", async () => {
        const pedir = vi.fn(async (): Promise<ResultadoPedir> => ({ estado: "pedida" }));
        pintar("ver", pedir);
        fireEvent.click(screen.getByTestId("boton-pedir-editar"));
        expect(pedir).toHaveBeenCalledTimes(1);
        expect(await screen.findByTestId("estado-peticion").then((n) => n.textContent)).toBe(
            "Pedida: quien gestiona la verá",
        );
    });

    it("doble clic = una sola petición", async () => {
        const pedir = vi.fn(async (): Promise<ResultadoPedir> => ({ estado: "pedida" }));
        pintar("ver", pedir);
        const boton = screen.getByTestId("boton-pedir-editar");
        fireEvent.click(boton);
        fireEvent.click(boton);
        await screen.findByTestId("estado-peticion");
        expect(pedir).toHaveBeenCalledTimes(1);
    });

    it("si el rango ya da paso, muestra «Ya puedes editar»", async () => {
        pintar("ver", vi.fn(async (): Promise<ResultadoPedir> => ({ estado: "puede-editar" })));
        fireEvent.click(screen.getByTestId("boton-pedir-editar"));
        expect(await screen.findByTestId("estado-peticion").then((n) => n.textContent)).toBe("Ya puedes editar");
    });

    it("si pedir falla, el motivo se muestra tal cual y ya no se puede pedir otra vez", async () => {
        const pedir = vi.fn(async (): Promise<ResultadoPedir> => ({ estado: "error", motivo: "Sin conexión" }));
        pintar("comentar", pedir);
        fireEvent.click(screen.getByTestId("boton-pedir-editar"));
        const estado = await screen.findByTestId("estado-peticion");
        expect(estado.textContent).toBe("Sin conexión");
        expect(estado.getAttribute("role")).toBe("alert");
        expect(screen.queryByTestId("boton-pedir-editar")).toBeNull();
        expect(pedir).toHaveBeenCalledTimes(1);
    });

    it("un pedir que rechaza lanzando excepción enseña su mensaje", async () => {
        pintar(
            "ver",
            vi.fn(async () => {
                throw new Error("Sesión cerrada");
            }),
        );
        fireEvent.click(screen.getByTestId("boton-pedir-editar"));
        expect(await screen.findByTestId("estado-peticion").then((n) => n.textContent)).toBe("Sesión cerrada");
    });
});

describe("pedirEdicionDeSpaces — integración con requestSpaceAccess (sin red)", () => {
    it("mapea la respuesta de spaces: ok → pedida, alreadyMember → ya puedes editar, fallo → error", async () => {
        const pedida = pedirEdicionDeSpaces("espacio-1", async () => ({ ok: true }));
        expect(await pedida()).toEqual({ estado: "pedida" });
        const socio = pedirEdicionDeSpaces("espacio-1", async () => ({ ok: true, alreadyMember: true }));
        expect(await socio()).toEqual({ estado: "puede-editar" });
        const fallo = pedirEdicionDeSpaces("espacio-1", async () => ({ ok: false }));
        expect(await fallo()).toEqual({ estado: "error", motivo: "No se pudo enviar la petición" });
    });

    it("un pedirAcceso que rechaza enseña el motivo tal cual", async () => {
        const pedir = pedirEdicionDeSpaces("espacio-1", async () => {
            throw new Error("Sin conexión");
        });
        expect(await pedir()).toEqual({ estado: "error", motivo: "Sin conexión" });
    });
});
