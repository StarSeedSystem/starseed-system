import * as React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosNavegador } from "@/lib/xr/capacidades";

vi.mock("../sondeo-navegador", async (original) => {
    const real = await original<typeof import("../sondeo-navegador")>();
    return { ...real, sondearNavegador: vi.fn(), escucharDispositivosXR: vi.fn() };
});

import { DATOS_SIN_SONDEO, escucharDispositivosXR, sondearNavegador } from "../sondeo-navegador";
import { useCapacidadesXR } from "../use-capacidades-xr";
import type { OpcionesCapacidadesXR } from "../use-capacidades-xr";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const QUEST_INSTALADA: DatosNavegador = { ...DATOS_SIN_SONDEO, ua: QUEST3, seguro: true, tieneXR: true, vr: true, ar: true, webgl2: true, instalada: true };
const ESCRITORIO: DatosNavegador = { ...DATOS_SIN_SONDEO, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0", seguro: true, tieneXR: true, vr: false, ar: false, webgl2: true };

const sondear = vi.mocked(sondearNavegador);
const escuchar = vi.mocked(escucharDispositivosXR);

/** Una promesa que se resuelve cuando el test lo decide (para ordenar respuestas tardías). */
function diferida<T>() {
    let resolver!: (v: T) => void;
    let rechazar!: (e: unknown) => void;
    const promesa = new Promise<T>((ok, mal) => { resolver = ok; rechazar = mal; });
    return { promesa, resolver, rechazar };
}

let quitarOyente: ReturnType<typeof vi.fn>;
beforeEach(() => {
    sondear.mockReset();
    escuchar.mockReset();
    quitarOyente = vi.fn();
    escuchar.mockReturnValue(quitarOyente);
});
afterEach(() => { cleanup(); });

describe("useCapacidadesXR", () => {
    it("arranca «sondeando» con datos, capacidades y plan NUNCA nulos (el botón XR1010E los lee ya)", () => {
        sondear.mockReturnValue(new Promise(() => undefined));
        const { result } = renderHook(() => useCapacidadesXR());
        expect(result.current.estado).toBe("sondeando");
        expect(result.current.datos).toEqual(DATOS_SIN_SONDEO);
        expect(result.current.capacidades.modos).toEqual(["2d"]);
        expect(result.current.plan.estrategia).toBe("solo-pantalla");
    });

    it("al resolver pasa a «listo»: Quest instalada con VR+AR entra sola", async () => {
        sondear.mockResolvedValue(QUEST_INSTALADA);
        const { result } = renderHook(() => useCapacidadesXR());
        await act(async () => { await Promise.resolve(); });
        expect(result.current.estado).toBe("listo");
        expect(result.current.datos).toBe(QUEST_INSTALADA);
        expect(result.current.capacidades.plataforma).toBe("quest");
        expect(result.current.plan.estrategia).toBe("auto-al-abrir");
    });

    it("un sondeo que rechaza deja «listo» con los datos vacíos, sin romper", async () => {
        sondear.mockRejectedValue(new Error("explotó"));
        const { result } = renderHook(() => useCapacidadesXR());
        await act(async () => { await Promise.resolve(); });
        expect(result.current.estado).toBe("listo");
        expect(result.current.datos).toEqual(DATOS_SIN_SONDEO);
    });

    it("devicechange vuelve a sondear (sin volver a «sondeando») y descarta la respuesta tardía de un sondeo anterior", async () => {
        const primero = diferida<DatosNavegador>();
        const segundo = diferida<DatosNavegador>();
        sondear.mockReturnValueOnce(primero.promesa).mockReturnValueOnce(segundo.promesa);
        const { result } = renderHook(() => useCapacidadesXR());
        const alCambiar = escuchar.mock.calls[0][0];
        await act(async () => { alCambiar(); });
        expect(sondear).toHaveBeenCalledTimes(2);
        await act(async () => { segundo.resolver(QUEST_INSTALADA); });
        expect(result.current.datos).toBe(QUEST_INSTALADA);
        await act(async () => { primero.resolver(ESCRITORIO); });
        expect(result.current.datos).toBe(QUEST_INSTALADA);
        expect(result.current.estado).toBe("listo");
    });

    it("conectar un visor después de abrir la página lo reconoce sin recargar", async () => {
        sondear.mockResolvedValueOnce(ESCRITORIO).mockResolvedValueOnce({ ...ESCRITORIO, vr: true });
        const { result } = renderHook(() => useCapacidadesXR());
        await act(async () => { await Promise.resolve(); });
        expect(result.current.capacidades.modos).not.toContain("vr-inmersivo");
        await act(async () => { escuchar.mock.calls[0][0](); });
        expect(result.current.capacidades.modos).toContain("vr-inmersivo");
    });

    it("al desmontar quita el oyente y no actualiza con una respuesta que llega tarde", async () => {
        const tarde = diferida<DatosNavegador>();
        sondear.mockReturnValue(tarde.promesa);
        const { result, unmount } = renderHook(() => useCapacidadesXR());
        unmount();
        expect(quitarOyente).toHaveBeenCalledTimes(1);
        await act(async () => { tarde.resolver(QUEST_INSTALADA); });
        expect(result.current.estado).toBe("sondeando");
    });

    it("cambiar modo o contexto recalcula la recomendación SIN volver a sondear", async () => {
        sondear.mockResolvedValue(QUEST_INSTALADA);
        const { result, rerender } = renderHook((o: OpcionesCapacidadesXR) => useCapacidadesXR(o), { initialProps: {} as OpcionesCapacidadesXR });
        await act(async () => { await Promise.resolve(); });
        expect(result.current.capacidades.recomendado).toBe("ar-passthrough");
        rerender({ contexto: "mundo-vr" });
        expect(result.current.capacidades.recomendado).toBe("vr-inmersivo");
        rerender({ modo: "vr-inmersivo", contexto: "sistema" });
        expect(result.current.capacidades.recomendado).toBe("vr-inmersivo");
        expect(sondear).toHaveBeenCalledTimes(1);
        expect(escuchar).toHaveBeenCalledTimes(1);
    });

    it("el resultado conserva su identidad mientras nada cambia", async () => {
        sondear.mockResolvedValue(ESCRITORIO);
        const { result, rerender } = renderHook(() => useCapacidadesXR());
        await act(async () => { await Promise.resolve(); });
        const antes = result.current;
        rerender();
        expect(result.current).toBe(antes);
    });

    it("en StrictMode (monta dos veces) no deja un oyente colgado ni pisa el estado", async () => {
        sondear.mockResolvedValue(QUEST_INSTALADA);
        const { result } = renderHook(() => useCapacidadesXR(), { wrapper: React.StrictMode });
        await act(async () => { await Promise.resolve(); });
        expect(escuchar).toHaveBeenCalledTimes(2);
        expect(quitarOyente).toHaveBeenCalledTimes(1);
        expect(result.current.estado).toBe("listo");
    });
});
