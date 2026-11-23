/**
 * CTL1118A · la ventana de control REAL (anfitrión + gancho + PantallaDestino + registro global), con el canal de órdenes
 * falso: tras abrir la sesión, la ventana pide la pantalla.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mandadas: { nombre: string; args: Record<string, unknown>; sesion: string | null }[] = [];
const TOKEN = "b".repeat(32);

vi.mock("@/lib/control-remoto/canal", () => ({
    mandarOrden: vi.fn(async (_para: string, nombre: string, args: Record<string, unknown>, o: { sesion?: string | null }) => {
        mandadas.push({ nombre, args, sesion: o?.sesion ?? null });
        if (nombre === "abrir-sesion") return { tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado: { sesion: TOKEN, nivel: "controlar", alcance: "total", caduca: new Date(Date.now() + 3600_000).toISOString() } };
        if (nombre === "pantalla-iniciar") return { tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado: { ok: false, motivo: "sin-servicio" } };
        return { tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado: {} };
    }),
    firmarParaCanalDirecto: vi.fn(async () => null),
}));

import { VentanaRemota } from "../anfitrion-control";
import { registroGlobal } from "@/lib/control-remoto/registro-sesiones";

beforeEach(() => {
    mandadas.length = 0;
});
afterEach(() => {
    cleanup();
    registroGlobal.olvidar("tableta-1");
});

describe("CTL1118A · la ventana pide la pantalla tras abrir la sesión", () => {
    it("abrir-sesion y después pantalla-iniciar, con la sesión abierta", async () => {
        render(<VentanaRemota neurona="tableta-1" nombre="Tableta" modo="flotante" />);
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        const nombres = mandadas.map((m) => m.nombre);
        expect(nombres.slice(0, 2)).toEqual(["abrir-sesion", "pantalla-iniciar"]);
        expect(mandadas[1].sesion).toBe(TOKEN);
    });
});

import { renderHook } from "@testing-library/react";
import { usarPantallaRemota } from "@/lib/control-remoto/usar-pantalla-remota";
import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";

async function dejarCorrer() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
    });
}
const iniciares = () => mandadas.filter((m) => m.nombre === "pantalla-iniciar");

import { AJUSTES_DEFECTO } from "@/lib/control-remoto/ajustes-sesion";

describe("CTL1118A · cada elección de fuente llega a pantalla-iniciar con su valor", () => {
    it.each([
        ["auto", { lado: AJUSTES_DEFECTO.ladoMaximo, calidad: AJUSTES_DEFECTO.calidadJpeg }],
        ["proyeccion", { fuente: "proyeccion", lado: AJUSTES_DEFECTO.ladoMaximo, calidad: AJUSTES_DEFECTO.calidadJpeg }],
        ["algo-raro", { lado: AJUSTES_DEFECTO.ladoMaximo, calidad: AJUSTES_DEFECTO.calidadJpeg }],
    ] as const)("fuente %s → args %j", async (pedida, args) => {
        const { unmount } = renderHook(() => usarPantallaRemota("tableta-1", { fuente: pedida as FuentePedida }));
        await dejarCorrer();
        expect(iniciares()).toHaveLength(1);
        expect(iniciares()[0].args).toEqual(args);
        unmount();
    });

    it("cambiar la fuente reabre la pantalla: sale otra pantalla-iniciar con la fuente nueva", async () => {
        const { rerender, unmount } = renderHook(({ f }: { f: { fuente?: FuentePedida } }) => usarPantallaRemota("tableta-1", f), { initialProps: { f: { fuente: "auto" as FuentePedida } } });
        await dejarCorrer();
        rerender({ f: { fuente: "proyeccion" as FuentePedida } });
        await dejarCorrer();
        expect(iniciares().map((m) => m.args)).toEqual([
            { lado: AJUSTES_DEFECTO.ladoMaximo, calidad: AJUSTES_DEFECTO.calidadJpeg },
            { fuente: "proyeccion", lado: AJUSTES_DEFECTO.ladoMaximo, calidad: AJUSTES_DEFECTO.calidadJpeg },
        ]);
        unmount();
    });

    it("«reintentar» (lo que llama el selector de medio al cambiar de camino) vuelve a pedir la pantalla", async () => {
        const { result, unmount } = renderHook(() => usarPantallaRemota("tableta-1"));
        await dejarCorrer();
        for (let i = 0; i < 3; i++) {
            act(() => result.current.reintentar());
            await dejarCorrer();
        }
        expect(iniciares()).toHaveLength(4);
        expect(new Set(iniciares().map((m) => m.sesion))).toEqual(new Set([TOKEN]));
        unmount();
    });
});
