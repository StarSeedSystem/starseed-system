/**
 * CTL1118B · el control apagado se dice y no engaña.
 *
 * Lo que pasó (18-11): «Terminar» apagó el control en la tableta; después la persona aceptó a la Mac varias veces, la Mac
 * seguía saliendo como aceptada y todo contestaba «permiso-apagado». Además cada guardado con el control apagado volvía a «revocar».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const HUELLA = "abcdef0123456789abcdef0123456789";
const PIDE = { huella: HUELLA, spki: "c3BraQ", cuenta: "c", nombre: "Mac de Alex", neurona: "99999999-2222-4333-8444-555555555555", desde: "2026-11-18T08:25:16Z" };
const e = vi.hoisted(() => ({ v: null as unknown, revocar: vi.fn() }));

vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => e.v,
    guardarPermisoLocal: (p: unknown) => {
        e.v = p;
        window.dispatchEvent(new CustomEvent("starseed:control-neuronas-cambio")); // como el canal real: el panel se vuelve a leer
    },
    puertaControl: () => ({ revocar: e.revocar, sesionActiva: () => null }),
    presentarmeA: async () => ({ ok: true }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({ aparatoLocal: async () => ({ codigo: "A1B2" }), codigoDe: async () => "E5F6" }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "11111111-2222-4333-8444-555555555555", listNeurons: async () => [] }));
vi.mock("@/lib/banco-llamadas/app", () => ({ estadoBanco: () => null, ultimoInforme: () => null, informarBanco: () => undefined, armarBanco: () => true, apagarBanco: () => undefined }));

import { ControlEntreNeuronasPanel, TEXTO_CONTROL_APAGADO, TEXTO_PERMISO_QUITADO, TEXTO_TERMINADO } from "../banda-control";

const permiso = () => e.v as { encendido: boolean; nivel: string; controladores: { huella: string }[]; pendientes: unknown[] };

beforeEach(() => {
    e.revocar.mockClear();
});
afterEach(() => cleanup());

describe("CTL1118B · control apagado", () => {
    it("apagado y con alguien pidiendo: el botón dice «Aceptar y encender el control», acepta, enciende y no revoca", async () => {
        e.v = { encendido: false, nivel: "ver", controladores: [], pendientes: [PIDE] };
        render(<ControlEntreNeuronasPanel />);
        expect(await screen.findByTestId("control-apagado-aviso")).toHaveTextContent(TEXTO_CONTROL_APAGADO);
        await userEvent.click(screen.getByRole("button", { name: "Aceptar y encender el control" }));
        await waitFor(() => expect(permiso().encendido).toBe(true));
        expect(permiso().controladores.map((c) => c.huella)).toEqual([HUELLA]);
        expect(permiso().pendientes).toHaveLength(0);
        expect(e.revocar).not.toHaveBeenCalled();
    });

    it("apagado y con alguien ya aceptado: lo avisa y «Encender el control» lo enciende", async () => {
        e.v = { encendido: false, nivel: "ver", controladores: [PIDE], pendientes: [] };
        render(<ControlEntreNeuronasPanel />);
        await screen.findByTestId("control-apagado-aviso");
        await userEvent.click(screen.getByRole("button", { name: "Encender el control" }));
        await waitFor(() => expect(permiso().encendido).toBe(true));
        expect(screen.queryByTestId("control-apagado-aviso")).toBeNull();
        expect(e.revocar).not.toHaveBeenCalled();
    });

    it("guardar otra cosa con el control apagado no vuelve a revocar; apagarlo estando encendido sí, una vez", async () => {
        e.v = { encendido: false, nivel: "controlar", controladores: [], pendientes: [] };
        render(<ControlEntreNeuronasPanel />);
        fireEvent.change(await screen.findByRole("combobox"), { target: { value: "ver" } });
        await waitFor(() => expect(permiso().nivel).toBe("ver"));
        expect(e.revocar).not.toHaveBeenCalled();
        expect(screen.queryByTestId("control-apagado-aviso")).toBeNull(); // sin nadie aceptado ni pidiendo no hay nada que avisar

        await userEvent.click(screen.getByRole("switch", { name: "Apagado en este aparato" })); // enciende
        await waitFor(() => expect(permiso().encendido).toBe(true));
        expect(e.revocar).not.toHaveBeenCalled();
        await userEvent.click(await screen.findByRole("switch", { name: "Encendido en este aparato" })); // apaga
        await waitFor(() => expect(permiso().encendido).toBe(false));
        expect(e.revocar).toHaveBeenCalledTimes(1);
        expect(e.revocar).toHaveBeenCalledWith("apagado-por-el-dueno");
    });

    it("encendido: el botón de aceptar es el de siempre y no hay aviso de apagado", async () => {
        e.v = { encendido: true, nivel: "ver", controladores: [], pendientes: [PIDE] };
        render(<ControlEntreNeuronasPanel />);
        expect(await screen.findByRole("button", { name: "Aceptar" })).toBeInTheDocument();
        expect(screen.queryByTestId("control-apagado-aviso")).toBeNull();
    });

    it("CTL1118G · los textos dicen la regla nueva: «Terminar» solo corta la sesión y «Quitar permiso» apaga", () => {
        expect(TEXTO_TERMINADO).toMatch(/Sesión terminada/);
        expect(TEXTO_TERMINADO).toMatch(/permiso sigue encendido/);
        expect(TEXTO_TERMINADO).not.toMatch(/quedó apagado/);
        expect(TEXTO_CONTROL_APAGADO).toMatch(/«Terminar» solo corta la sesión/);
        expect(TEXTO_CONTROL_APAGADO).not.toMatch(/«Terminar» también lo apaga/);
        expect(TEXTO_PERMISO_QUITADO).toMatch(/^Control apagado en este aparato/);
    });
});
