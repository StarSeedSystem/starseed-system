import { afterEach, describe, expect, it, vi } from "vitest";
import { quitarControladorNativo } from "../nativo";

afterEach(() => {
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
});

function tauri(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) {
    (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

describe("PENB3 · quitar un controlador de la lista nativa", () => {
    it("ok con el número de quitados, y la huella viaja entera", async () => {
        const huella = "a".repeat(64);
        const invoke = vi.fn(async () => ({ ok: true, quitados: 1 }));
        tauri(invoke);
        expect(await quitarControladorNativo(huella)).toEqual({ ok: true, quitados: 1 });
        expect(invoke).toHaveBeenCalledWith("control_entrada_quitar", { huella });
    });

    it("quitar uno que no estaba no es un error", async () => {
        tauri(async () => ({ ok: true }));
        expect(await quitarControladorNativo("abc")).toEqual({ ok: true, quitados: 0 });
    });

    it("sin Tauri no lanza y dice sin-soporte", async () => {
        expect(await quitarControladorNativo("abc")).toEqual({ ok: false, motivo: "sin-soporte" });
    });

    it("el motivo de lo nativo se conserva; un rechazo de invoke es sin-servicio", async () => {
        tauri(async () => ({ ok: false, motivo: "sin-soporte" }));
        expect(await quitarControladorNativo("abc")).toEqual({ ok: false, motivo: "sin-soporte" });
        tauri(async () => {
            throw new Error("boom");
        });
        expect(await quitarControladorNativo("abc")).toEqual({ ok: false, motivo: "sin-servicio" });
    });
});
