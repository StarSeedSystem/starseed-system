import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const MAC = "99999999-2222-4333-8444-555555555555";
const HUELLA = "abcdef0123456789abcdef0123456789";
const permiso = vi.hoisted(() => ({
    v: { encendido: true, nivel: "controlar", controladores: [{ huella: "abcdef0123456789abcdef0123456789", nombre: "Mac de Alex", cuenta: "c", desde: "2026-11-15T10:00:00Z" }], pendientes: [] } as unknown,
}));

vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => permiso.v,
    guardarPermisoLocal: (p: unknown) => {
        permiso.v = p;
    },
    puertaControl: () => null,
    presentarmeA: async () => ({ ok: true }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({ aparatoLocal: async () => ({ codigo: "A1B2" }), codigoDe: async () => "E5F6" }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => MAC, listNeurons: async () => [] }));
vi.mock("@/lib/banco-llamadas/app", () => ({
    estadoBanco: () => null,
    ultimoInforme: () => null,
    informarBanco: () => undefined,
    armarBanco: () => true,
    apagarBanco: () => undefined,
}));

import { ControlEntreNeuronasPanel } from "../banda-control";

beforeEach(() => {
    permiso.v = { encendido: true, nivel: "controlar", controladores: [{ huella: HUELLA, nombre: "Mac de Alex", cuenta: "c", desde: "2026-11-15T10:00:00Z" }], pendientes: [] };
});
afterEach(() => {
    cleanup();
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
});

function nativo(quitar: () => Promise<unknown>) {
    const inv = vi.fn(async (c: string) => {
        if (c === "control_entrada_quitar") return quitar();
        if (c === "control_entrada_aceptados") return { ok: true, controladores: [{ huella: HUELLA.slice(0, 8), nombre: "Mac de Alex", codigo: "111-222" }] };
        throw new Error("no");
    });
    (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: inv } };
    return inv;
}

async function pulsarQuitar() {
    render(<ControlEntreNeuronasPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar" }));
}

describe("PENB4 · «Quitar» también quita al controlador de la lista nativa", () => {
    it("lo nativo responde ok: se pide con la huella entera y el aviso es «Quitado»", async () => {
        const inv = nativo(async () => ({ ok: true, quitados: 1 }));
        await pulsarQuitar();
        await waitFor(() => expect(screen.getByText("Quitado")).toBeInTheDocument());
        expect(inv).toHaveBeenCalledWith("control_entrada_quitar", { huella: HUELLA });
        expect((permiso.v as { controladores: unknown[] }).controladores).toHaveLength(0);
    });

    it("lo nativo falla: dice que este aparato aún lo tiene aceptado y vuelve a leer la lista nativa", async () => {
        const inv = nativo(async () => {
            throw new Error("boom");
        });
        await pulsarQuitar();
        await waitFor(() => expect(screen.getByText(/Se quitó aquí, pero este aparato aún lo tiene aceptado para tocar/)).toBeInTheDocument());
        expect(screen.queryByText("Quitado")).toBeNull();
        // lecturas de la lista nativa: al montar, antes de quitar y la de después (la que se vuelve a hacer)
        await waitFor(() => expect(inv.mock.calls.filter((c) => c[0] === "control_entrada_aceptados").length).toBeGreaterThanOrEqual(3));
    });

    it("sin Tauri no hay aviso extraño y el controlador se quita de la página", async () => {
        await pulsarQuitar();
        await waitFor(() => expect((permiso.v as { controladores: unknown[] }).controladores).toHaveLength(0));
        expect(screen.queryByText("Quitado")).toBeNull();
        expect(screen.queryByText(/aún lo tiene aceptado/)).toBeNull();
    });
});
