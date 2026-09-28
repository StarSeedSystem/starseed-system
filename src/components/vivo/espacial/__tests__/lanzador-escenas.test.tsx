/**
 * Lanzador: lista mis escenas con su ruta (3D o XR) y, si la base aún no admite escenas, lo dice
 * en español sin romperse.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ push: vi.fn(), crear: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...resto}>
            {children}
        </a>
    ),
}));
vi.mock("@/lib/vivo/espacial/persistencia", () => ({
    listarEscenasPropias: async () => [{ id: "e1", titulo: "Huerto", actualizada: "2026-09-28T10:00:00Z", objetos: 3 }],
    listarEscenasCompartidas: async () => [],
}));
vi.mock("@/lib/vivo/escena3d", () => ({
    crearVivoEscena3d: (t: string) => h.crear(t),
    rutaEscena: (id: string) => `/escena/${id}`,
}));
vi.mock("@/lib/vivo/xr", () => ({ rutaSalaXr: (id: string) => `/sala-xr/${id}` }));

import { LanzadorEscenas } from "../lanzador-escenas";

afterEach(cleanup);

describe("LanzadorEscenas", () => {
    test("lista mis escenas y enlaza a la ruta del destino", async () => {
        render(<LanzadorEscenas destino="xr" />);
        const enlace = await screen.findByRole("link", { name: /Huerto/ });
        expect(enlace).toHaveAttribute("href", "/sala-xr/e1");
        expect(screen.getByText(/3 objetos/)).toBeInTheDocument();
    });

    test("si crear falla (migración pendiente), lo explica y no navega", async () => {
        h.crear.mockRejectedValueOnce(new Error("Las escenas 3D compartidas aún no están activadas en la base de datos del OS."));
        render(<LanzadorEscenas destino="escena" />);
        fireEvent.change(screen.getByLabelText("Nueva escena"), { target: { value: "Taller" } });
        fireEvent.click(screen.getByRole("button", { name: "Crear escena" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("aún no están activadas");
        expect(h.push).not.toHaveBeenCalled();
    });

    test("al crear, abre la escena nueva", async () => {
        h.crear.mockResolvedValueOnce({ refId: "nueva", ruta: "/escena/nueva" });
        render(<LanzadorEscenas destino="escena" />);
        fireEvent.click(screen.getByRole("button", { name: "Crear escena" }));
        await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith("/escena/nueva"));
        expect(h.crear).toHaveBeenCalledWith("Escena 3D");
    });
});
