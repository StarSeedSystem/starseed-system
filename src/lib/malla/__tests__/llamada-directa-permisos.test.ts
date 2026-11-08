import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * MIC1108A · La llamada directa (Mensajes › Neuronas) ya no dice «Este navegador no deja usar el
 * micrófono» para todo: en la app anterior dice que le falta el permiso del sistema; en la nueva,
 * dónde se activa y qué ajustes abrir; en el navegador, lo de siempre. Tauri y medios simulados.
 */

import { __vaciarRegistroEnlacesLocales, registrarEnlaceLocal, type EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import { colgarLlamada, estadoLlamadaDirecta, llamarPorEnlace } from "@/lib/malla/llamada-directa";
import { olvidarEntornoMedios } from "@/lib/nativa/medios-nativos";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

function enlaceFalso(id: string): EnlaceLocalVivo {
    return {
        id,
        par: { nombre: "Maggaboard", syncDeviceId: "B" },
        desde: 0,
        abierto: () => true,
        rttMs: () => 6,
        ruta: () => null,
        capacidadKbps: () => null,
        enviar: () => true,
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        alMensaje: () => () => undefined,
        ponerPistas: async () => true,
        alFlujoRemoto: () => () => undefined,
        cerrar: () => undefined,
    } as EnlaceLocalVivo;
}

function app(estado: unknown | null) {
    const invoke = vi.fn(async (cmd: string) => {
        if (cmd === "medios_estado" && estado) return estado;
        throw `Command ${cmd} not allowed by ACL`;
    });
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    return invoke;
}

afterEach(() => {
    colgarLlamada();
    __vaciarRegistroEnlacesLocales();
    olvidarEntornoMedios();
    vi.unstubAllGlobals();
});

describe("llamada directa: por qué no hay micrófono", () => {
    it("app anterior a MIC1108A en macOS (WebKit sin getUserMedia): falta el permiso de la app", async () => {
        registrarEnlaceLocal(enlaceFalso("local:m1"));
        vi.stubGlobal("navigator", { userAgent: MAC, mediaDevices: {} });
        app(null);
        const r = await llamarPorEnlace("local:m1", false);
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/Esta instalación de la app no tiene permiso del sistema para usar el micrófono/);
        expect(r.motivo).not.toMatch(/Este navegador no deja/);
        expect(r.ajustes).toBeNull();
        expect(estadoLlamadaDirecta().fase).toBe("inactiva");
    });

    it("app nueva en macOS y el sistema dijo que no: dónde se activa y «Abrir ajustes» del micrófono", async () => {
        registrarEnlaceLocal(enlaceFalso("local:m2"));
        const getUserMedia = vi.fn(async () => {
            throw Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        });
        vi.stubGlobal("navigator", { userAgent: MAC, mediaDevices: { getUserMedia } });
        const invoke = app({ version: 1, plataforma: "macos", declarados: true, abrir_ajustes: true });
        const r = await llamarPorEnlace("local:m2", true);
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/^macOS no deja a StarSeed usar el micrófono y la cámara\./);
        expect(r.motivo).toMatch(/Ajustes del Sistema › Privacidad y seguridad › Micrófono y Cámara/);
        expect(r.ajustes).toBe("microfono");
        expect(invoke).toHaveBeenCalledWith("medios_estado", undefined);
    });

    it("sin micrófono conectado lo dice tal cual (también en la app)", async () => {
        registrarEnlaceLocal(enlaceFalso("local:m3"));
        vi.stubGlobal("navigator", {
            userAgent: MAC,
            mediaDevices: { getUserMedia: async () => Promise.reject(Object.assign(new Error("x"), { name: "NotFoundError" })) },
        });
        app({ version: 1, plataforma: "macos", declarados: true, abrir_ajustes: true });
        const r = await llamarPorEnlace("local:m3", false);
        expect(r.motivo).toMatch(/No encontramos ningún micrófono/);
        expect(r.ajustes).toBeNull();
    });

    it("en el navegador (sin la app): los textos del navegador y sin botón", async () => {
        registrarEnlaceLocal(enlaceFalso("local:m4"));
        vi.stubGlobal("navigator", {
            userAgent: MAC,
            mediaDevices: { getUserMedia: async () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) },
        });
        vi.stubGlobal("window", {});
        const r = await llamarPorEnlace("local:m4", false);
        expect(r.motivo).toMatch(/candado/);
        expect(r.ajustes).toBeNull();
    });
});
