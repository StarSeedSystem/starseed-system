import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCIONES } from "../niveles";
import { AJUSTES_CONTROL_DEFECTO, leerAjustesControl, ponerAjustesControl } from "../ajustes-aparato";

afterEach(() => {
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
});

describe("CTL1117H · ajustes del aparato controlado", () => {
    it("sin Tauri (web, escritorio sin soporte) devuelven los de fábrica sin fallar", async () => {
        expect(await leerAjustesControl()).toEqual(AJUSTES_CONTROL_DEFECTO);
        expect(await ponerAjustesControl({ indicador: "oculto" })).toEqual({ indicador: "oculto", ver_toques: true, alcance: "total" });
    });
    it("con Tauri llama a los dos comandos y limpia lo que vuelve", async () => {
        const invoke = vi.fn(async (cmd: string) => (cmd === "control_ajustes_leer" ? { indicador: "raro", ver_toques: "si" } : { indicador: "oculto", ver_toques: false }));
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
        expect(await leerAjustesControl()).toEqual(AJUSTES_CONTROL_DEFECTO);
        expect(await ponerAjustesControl({ ver_toques: false })).toEqual({ indicador: "oculto", ver_toques: false, alcance: "total" });
        expect(invoke).toHaveBeenCalledWith("control_ajustes_poner", { parcial: { ver_toques: false } });
    });
    it("un fallo nativo no lanza", async () => {
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: vi.fn(async () => { throw new Error("x"); }) } };
        expect(await leerAjustesControl()).toEqual(AJUSTES_CONTROL_DEFECTO);
    });

    it("abrir-sesion admite solo un color público válido; cualquier otro argumento se rechaza", () => {
        const v = ACCIONES["abrir-sesion"].validar;
        expect(v({})).toEqual({});
        expect(v({ color: "#12abef" })).toEqual({ color: "#12abef" });
        expect(v({ color: "#12ABEF" })).toBeNull();
        expect(v({ color: "rojo" })).toBeNull();
        expect(v({ color: 3 })).toBeNull();
        expect(v({ color: "#12abef", nivel: "controlar" })).toBeNull();
        expect(v({ otro: 1 })).toBeNull();
    });
});
