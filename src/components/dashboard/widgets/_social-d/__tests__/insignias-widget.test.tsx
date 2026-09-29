import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import { _reiniciarFuentesParaPruebas } from "../fuente-compartida";
import type { Coleccion } from "../insignias-datos";
import { comoSeGana, siguienteInsignia } from "../insignias-datos";

preparaDom();

const estado = vi.hoisted(() => ({ col: null as Coleccion | null, uid: "yo" as string | null }));

vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => ({ uid: estado.uid, ready: true }) }));
vi.mock("../insignias-datos", async (importOriginal) => {
    const real = await importOriginal<typeof import("../insignias-datos")>();
    return { ...real, cargarInsignias: async () => ({ datos: estado.col }) };
});

import { BadgesWidget } from "../../badges-widget";

const catalogo = [
    { id: "1", code: "verified", name: "Identidad verificada", description: null, icon: "shield-check", area: "general", criteria: null },
    { id: "2", code: "creator", name: "Creadora", description: "Publica en la Tienda", icon: "store", area: "cultura", criteria: null },
    { id: "3", code: "scholar", name: "Erudita", description: null, icon: null, area: "educacion", criteria: null },
];

beforeEach(() => { _reiniciarFuentesParaPruebas(); estado.uid = "yo"; });
afterEach(() => cleanup());

describe("Insignias · la siguiente se elige con honestidad", () => {
    it("prioriza la de logro propio y dice dónde se gana", () => {
        const col: Coleccion = { ganadas: [], catalogo };
        const sig = siguienteInsignia(col);
        expect(sig?.code).toBe("creator");
        expect(comoSeGana(sig!)).toMatchObject({ href: "/store", accion: "Ir a la Tienda" });
        expect(comoSeGana(catalogo[0]).texto).toMatch(/aval/);
    });

    it("vacío: la primera a tu alcance, con su acción real", async () => {
        estado.col = { ganadas: [], catalogo };
        render(<EnMarco clase="m"><BadgesWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio"));
        expect(screen.getByText(/La primera a tu alcance: «Creadora»/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Ir a la Tienda" })).toHaveAttribute("href", "/store");
    });

    it("m: la última medalla, la colección y la siguiente", async () => {
        estado.col = { ganadas: [{ ...catalogo[0], awarded_at: new Date().toISOString(), awarded_by: null }], catalogo };
        render(<EnMarco clase="m"><BadgesWidget /></EnMarco>);
        expect(await screen.findByRole("img", { name: "Identidad verificada: ganada" })).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: /1 de 3/ })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Siguiente insignia: Creadora" })).toBeInTheDocument();
    });

    it("l: vitrina con las ganadas encendidas y las que faltan apagadas", async () => {
        estado.col = { ganadas: [{ ...catalogo[0], awarded_at: null, awarded_by: null }], catalogo };
        render(<EnMarco clase="l"><BadgesWidget /></EnMarco>);
        expect(await screen.findByRole("list", { name: "Vitrina de insignias" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Erudita: por ganar" })).toBeInTheDocument();
    });

    it("s y sin sesión", async () => {
        estado.uid = null;
        render(<EnMarco clase="s"><BadgesWidget /></EnMarco>);
        expect(await screen.findByText("Entra en tu cuenta")).toBeInTheDocument();
    });
});
