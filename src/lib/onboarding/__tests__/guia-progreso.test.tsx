/**
 * GUIA1025U · retomar la guía donde se dejó (`guia-progreso.ts`) y saber si hay cuenta (`use-hay-sesion.ts`).
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
    usuario: null as null | { id: string; email?: string; is_anonymous?: boolean },
    avisar: null as null | ((u: unknown) => void),
    baja: 0,
    falla: false,
}));
vi.mock("@/lib/consumo/usuario", () => ({
    usuarioActual: async () => {
        if (sim.falla) throw new Error("sin red");
        return sim.usuario;
    },
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: (cb: (evento: string, sesion: { user: unknown } | null) => void) => {
                sim.avisar = (user) => cb("TEST", user ? { user } : null);
                return { data: { subscription: { unsubscribe: () => { sim.baja += 1; } } } };
            },
        },
    }),
}));

import { CLAVE_PROGRESO_GUIA, borrarProgresoGuia, guardarProgresoGuia, leerProgresoGuia } from "../guia-progreso";
import { PASOS_GUIA, ULTIMO_PASO, indiceDePaso } from "../guia-completa";
import { esCuentaReal, useHaySesion } from "@/hooks/use-hay-sesion";

beforeEach(() => {
    window.localStorage.clear();
    sim.usuario = null;
    sim.avisar = null;
    sim.baja = 0;
    sim.falla = false;
});
afterEach(() => cleanup());

describe("guia-progreso", () => {
    it("sin nada guardado no hay a dónde volver", () => {
        expect(leerProgresoGuia()).toBeNull();
    });

    it("guarda el paso por su id y lo devuelve como posición", () => {
        guardarProgresoGuia(indiceDePaso("malla"));
        expect(JSON.parse(window.localStorage.getItem(CLAVE_PROGRESO_GUIA) ?? "{}")).toEqual({ paso: "malla" });
        expect(leerProgresoGuia()).toBe(indiceDePaso("malla"));
    });

    it("sigue valiendo aunque el catálogo cambie de tamaño (se guarda el id, no la posición)", () => {
        window.localStorage.setItem(CLAVE_PROGRESO_GUIA, JSON.stringify({ paso: "genesis" }));
        expect(PASOS_GUIA[leerProgresoGuia() as number].id).toBe("genesis");
    });

    it("el primer y el último paso no se guardan, y llegar a la cuenta borra lo que hubiera", () => {
        guardarProgresoGuia(5);
        expect(leerProgresoGuia()).toBe(5);
        guardarProgresoGuia(ULTIMO_PASO);
        expect(leerProgresoGuia()).toBeNull();
        guardarProgresoGuia(5);
        guardarProgresoGuia(0);
        expect(leerProgresoGuia()).toBeNull();
    });

    it("un dato roto o de un paso que ya no existe se ignora", () => {
        window.localStorage.setItem(CLAVE_PROGRESO_GUIA, "no es json");
        expect(leerProgresoGuia()).toBeNull();
        window.localStorage.setItem(CLAVE_PROGRESO_GUIA, JSON.stringify({ paso: "paso-borrado" }));
        expect(leerProgresoGuia()).toBeNull();
        window.localStorage.setItem(CLAVE_PROGRESO_GUIA, JSON.stringify({ paso: 7 }));
        expect(leerProgresoGuia()).toBeNull();
    });

    it("borrarProgresoGuia lo olvida", () => {
        guardarProgresoGuia(4);
        borrarProgresoGuia();
        expect(leerProgresoGuia()).toBeNull();
    });

    it("sin almacenamiento local no rompe: no se recuerda nada", () => {
        const espia = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("cuota");
        });
        expect(() => guardarProgresoGuia(4)).not.toThrow();
        espia.mockRestore();
    });
});

describe("useHaySesion", () => {
    it("una cuenta real tiene correo y no es anónima", () => {
        expect(esCuentaReal({ email: "ana@star.seed" })).toBe(true);
        expect(esCuentaReal({ email: "ana@star.seed", is_anonymous: true })).toBe(false);
        expect(esCuentaReal({ email: "" })).toBe(false);
        expect(esCuentaReal(null)).toBe(false);
        expect(esCuentaReal(undefined)).toBe(false);
    });

    it("no averigua nada mientras la guía está cerrada", async () => {
        const { result } = renderHook(() => useHaySesion(false));
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(result.current).toBeNull();
    });

    it("sin cuenta da false, con cuenta true, y sigue los cambios de sesión", async () => {
        const { result } = renderHook(() => useHaySesion(true));
        expect(result.current).toBeNull();
        await waitFor(() => expect(result.current).toBe(false));
        await waitFor(() => expect(sim.avisar).not.toBeNull());
        act(() => sim.avisar?.({ id: "u", email: "ana@star.seed" }));
        expect(result.current).toBe(true);
        act(() => sim.avisar?.({ id: "u", email: "ana@star.seed", is_anonymous: true }));
        expect(result.current).toBe(false);
    });

    it("una sesión anónima (invitado) no cuenta como cuenta", async () => {
        sim.usuario = { id: "i", is_anonymous: true };
        const { result } = renderHook(() => useHaySesion(true));
        await waitFor(() => expect(result.current).toBe(false));
    });

    it("si no se puede saber, se queda en null y la guía no quita nada", async () => {
        sim.falla = true;
        const { result } = renderHook(() => useHaySesion(true));
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(result.current).toBeNull();
    });

    it("al desmontar suelta la suscripción", async () => {
        const { unmount } = renderHook(() => useHaySesion(true));
        await waitFor(() => expect(sim.avisar).not.toBeNull());
        unmount();
        expect(sim.baja).toBe(1);
    });
});
