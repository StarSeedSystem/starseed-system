import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const TAB = "11111111-2222-4333-8444-555555555555";
const MAC = "99999999-2222-4333-8444-555555555555";
const permiso = vi.hoisted(() => ({
    v: {
        encendido: true,
        nivel: "controlar",
        controladores: [{ huella: "h-ok", nombre: "Maggaboard", cuenta: "c", desde: "2026-11-15T10:00:00Z" }],
        pendientes: [{ huella: "h-pide", nombre: "MacBook de Alex", cuenta: "c", desde: "2026-11-15T10:00:00Z" }],
    } as unknown,
}));

vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => permiso.v,
    guardarPermisoLocal: () => undefined,
    puertaControl: () => null,
    presentarmeA: async () => ({ ok: true }),
    sondearAceptacion: async () => ({ ok: true, motivo: "ok", resultado: { aceptado: true, nombre: "Maggaboard", sinLimite: true } }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({
    aparatoLocal: async () => ({ codigo: "A1B2" }),
    codigoDe: async (h: string) => (h === "h-pide" ? "C3D4" : "E5F6"),
}));
vi.mock("@/lib/neurons/neurons", () => ({
    thisDeviceId: () => MAC,
    listNeurons: async () => [{ id: TAB, name: "Maggaboard", kind: "tablet", capabilities: { platform: "Android" }, online: true, isThisDevice: false }],
}));
vi.mock("@/lib/banco-llamadas/app", () => ({
    estadoBanco: () => null,
    ultimoInforme: () => ({ v: 1, t: 1, llave: true, objetivo: TAB, codigo: "A1B2", sesion: { estado: "aceptada", motivo: null, t: 1 }, armada: null }),
    informarBanco: () => undefined,
    armarBanco: () => true,
    apagarBanco: () => undefined,
}));

import { ControlEntreNeuronasPanel } from "../banda-control";

afterEach(cleanup);

describe("CAL1115I · el panel dice quién controla a quién antes de pulsar nada", () => {
    it("cuando otro aparato pide operar este", async () => {
        render(<ControlEntreNeuronasPanel />);
        await waitFor(() => expect(screen.getByText(/quiere operar ESTE aparato/)).toBeInTheDocument());
        const t = screen.getByText(/quiere operar ESTE aparato/).textContent ?? "";
        expect(t).toContain("MacBook de Alex quiere operar ESTE aparato; si aceptas, podrá ver la pantalla y operar todo el aparato, apps incluidas (también los ajustes y los permisos).");
        expect(t).toContain("C3D4");
    });

    it("en la lista de aceptados: quién puede operar este aparato y qué puede operar este aparato", async () => {
        render(<ControlEntreNeuronasPanel />);
        await waitFor(() => expect(screen.getByText(/Puede operar este aparato: Maggaboard/)).toBeInTheDocument());
        await waitFor(() => expect(screen.getByTestId("este-aparato-puede")).toHaveTextContent("Este aparato puede operar: Maggaboard"));
    });

    it("al elegir una neurona, antes de pedir nada, dice «Vas a operar … desde este aparato»", async () => {
        render(<ControlEntreNeuronasPanel />);
        await waitFor(() => expect(within(screen.getByTestId("neuronas-elegir")).getByRole("option")).toHaveTextContent("Maggaboard"));
        expect(screen.queryByTestId("este-aparato-pide")).toBeNull();
        await userEvent.click(within(screen.getByTestId("neuronas-elegir")).getByRole("option"));
        await waitFor(() =>
            expect(screen.getByTestId("este-aparato-pide")).toHaveTextContent("Vas a operar Maggaboard desde este aparato; en Maggaboard tienen que aceptar el código A1B2."),
        );
    });
});
