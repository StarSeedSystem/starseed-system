/**
 * «Documentos y presentaciones»: sin cuenta invita a iniciar sesión; con cuenta lista los tuyos y
 * los compartidos, filtra, y crear lleva a la ruta nueva (o dice por qué no se pudo).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const est = vi.hoisted(() => ({
    uid: "ana" as string | null,
    push: vi.fn(),
    crearDoc: vi.fn(async (_t: string) => ({ refId: "nuevo1", ruta: "/documento/nuevo1" })),
}));

vi.mock("@/lib/vivo/doc-colaborativo/espacios", () => ({
    uidActual: async () => est.uid,
    listarEspaciosApp: async (app: string) =>
        app === "documento"
            ? [
                  { refId: "d1", titulo: "Acta de la asamblea", actualizado: new Date().toISOString(), propio: true },
                  { refId: "d2", titulo: "Plan del huerto", actualizado: new Date().toISOString(), propio: false },
              ]
            : [],
}));
vi.mock("@/lib/vivo/documento", async (original) => ({
    ...(await original<typeof import("@/lib/vivo/documento")>()),
    crearVivoDocumento: (t: string) => est.crearDoc(t),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: est.push }) }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { MisDocumentos } from "@/components/vivo/documento/mis-documentos";

beforeEach(() => {
    est.uid = "ana";
    est.push.mockReset();
    est.crearDoc.mockClear();
});
afterEach(cleanup);

describe("MisDocumentos", () => {
    test("sin cuenta: invita a iniciar sesión", async () => {
        est.uid = null;
        render(<MisDocumentos />);
        expect(await screen.findByText("Inicia sesión para crear y ver tus documentos")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    });

    test("lista los tuyos y los compartidos, filtra y crea uno nuevo con su título", async () => {
        render(<MisDocumentos />);
        expect(await screen.findByRole("link", { name: /Acta de la asamblea/ })).toHaveAttribute("href", "/documento/d1");
        expect(screen.getByRole("link", { name: /Plan del huerto/ })).toHaveTextContent("Compartido contigo");
        fireEvent.click(screen.getAllByRole("radio", { name: "Míos" })[0]);
        expect(screen.queryByRole("link", { name: /Plan del huerto/ })).toBeNull();
        expect(screen.getByText(/Todavía no hay presentaciones/)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Crear algo nuevo"), { target: { value: "Presupuesto 2027" } });
        fireEvent.click(screen.getByRole("button", { name: "Nuevo documento" }));
        await waitFor(() => expect(est.push).toHaveBeenCalledWith("/documento/nuevo1"));
        expect(est.crearDoc).toHaveBeenCalledWith("Presupuesto 2027");
    });

    test("si no se puede crear, lo dice en español", async () => {
        est.crearDoc.mockRejectedValueOnce(new Error("No se pudo crear. Inicia sesión e inténtalo de nuevo."));
        render(<MisDocumentos />);
        await screen.findByRole("link", { name: /Acta de la asamblea/ });
        fireEvent.click(screen.getByRole("button", { name: "Nuevo documento" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Inicia sesión e inténtalo de nuevo");
    });
});
