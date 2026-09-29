import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Patrimonio común con los recursos comunes REALES
// del Área Política (Ejecutivo): matriz por estado, uso por tipo y las
// acciones reales «Usar» / «Liberar». Un diseño por tamaño.
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
let sesion: { uid: string | null; ready: boolean } = { uid: "u1", ready: true };
vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => sesion }));

let recursos: any[] = [];
let degradado = false;
let falla = false;
const guardar = vi.fn(async (_r: any) => ({ ok: true, degraded: false }));
vi.mock("@/lib/governance/political", () => ({
    loadCommonsResources: async () => { if (falla) throw new Error("402"); return { list: recursos, degraded: degradado }; },
    upsertCommonsResource: (r: any) => guardar(r),
    labelForUser: async () => "Alex",
}));

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB } from "../../gen2/_paquete-b/cache-compartida";
import { CommonsMatrixWidget, porTipo } from "../commons-matrix-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#10b981", acento2: "#7c5cff", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

const ahora = new Date().toISOString();
beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    sesion = { uid: "u1", ready: true };
    degradado = false;
    falla = false;
    recursos = [
        { id: "r1", name: "Impresora 3D", type: "Herramienta", status: "Disponible", updatedAt: ahora },
        { id: "r2", name: "Taladro", type: "Herramienta", status: "En uso", assignedTo: "otra", assignedLabel: "Ana", updatedAt: ahora },
        { id: "r3", name: "Furgoneta", type: "Vehículo", status: "En uso", assignedTo: "u1", assignedLabel: "Alex", updatedAt: ahora },
        { id: "r4", name: "Horno solar", type: "Cocina", status: "Mantenimiento", updatedAt: ahora },
    ];
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("procomún (puros)", () => {
    it("agrupa por tipo con libres, en uso y mantenimiento", () => {
        const t = porTipo(recursos);
        expect(t[0]).toMatchObject({ tipo: "Herramienta", total: 2, libres: 1, enUso: 1, mant: 0 });
        expect(t.find((x) => x.tipo === "Cocina")).toMatchObject({ mant: 1 });
    });
});

describe("Patrimonio común", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("muestra los recursos reales en %s", async (clase) => {
        render(enMarco(clase, <CommonsMatrixWidget />));
        expect((await screen.findAllByText(/libres/i)).length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
    });
    it("en l usa un recurso libre y libera el tuyo (acciones reales)", async () => {
        render(enMarco("l", <CommonsMatrixWidget />));
        const usar = await screen.findByRole("button", { name: "Usar Impresora 3D" });
        await act(async () => { fireEvent.click(usar); });
        await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", status: "En uso", assignedTo: "u1", assignedLabel: "Alex" })));
        expect(await screen.findByText(/queda en tu uso/)).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar Furgoneta" })); });
        await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ id: "r3", status: "Disponible", assignedTo: null })));
    });
    it("dice cuando lo que ve es la copia local", async () => {
        degradado = true;
        render(enMarco("l", <CommonsMatrixWidget />));
        expect(await screen.findByText(/Copia de este dispositivo/)).toBeInTheDocument();
    });
    it("vacío honesto con «Registrar el primero»", async () => {
        recursos = [];
        render(enMarco("m", <CommonsMatrixWidget />));
        expect(await screen.findByText("Aún no hay recursos comunes")).toBeInTheDocument();
    });
    it("error honesto con reintento", async () => {
        falla = true;
        render(enMarco("m", <CommonsMatrixWidget />));
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});
