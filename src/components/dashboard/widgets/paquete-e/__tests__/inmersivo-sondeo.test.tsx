import * as React from "react";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type PropsEnlace = { href: unknown; children?: React.ReactNode; prefetch?: unknown } & Record<string, unknown>;
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: PropsEnlace) => <a href={String(href)} {...r}>{children}</a> }));

import { entornoNavegador, montarEn } from "../pruebas-render";
import { ImmersiveWidget } from "../../immersive-widget";

/** Pone un `navigator.xr` que contesta lo que diga `respuesta` (un EventTarget real, como el del navegador). */
function ponerXR(respuesta: (modo: string) => Promise<boolean>) {
    const xr = Object.assign(new EventTarget(), { isSessionSupported: respuesta });
    Object.defineProperty(navigator, "xr", { configurable: true, value: xr });
    return xr;
}

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Espacio inmersivo · sondeo común de StarSeed XR", () => {
    it("si el navegador nunca contesta, a los 1500 ms deja de decir «Comprobando» y se abre en pantalla", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        ponerXR(() => new Promise<boolean>(() => undefined));
        await act(async () => { montarEn("m", <ImmersiveWidget />, "#a855f7"); });
        expect(screen.getByText("Comprobando tu visor…")).toBeTruthy();
        await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
        expect(screen.queryByText("Comprobando tu visor…")).toBeTruthy();
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(screen.getByText("Sin visor XR: se abre en 3D en pantalla")).toBeTruthy();
    });

    it("si se enchufa un visor con la página abierta (devicechange), el widget lo reconoce sin recargar", async () => {
        let hayVR = false;
        const xr = ponerXR(async (modo) => modo === "immersive-vr" && hayVR);
        await act(async () => { montarEn("m", <ImmersiveWidget />, "#a855f7"); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        expect(screen.getByText("Sin visor XR: se abre en 3D en pantalla")).toBeTruthy();
        hayVR = true;
        await act(async () => { xr.dispatchEvent(new Event("devicechange")); await new Promise((r) => setTimeout(r, 0)); });
        expect(screen.getByText("VR disponible aquí")).toBeTruthy();
    });

    it("al quitar el widget deja de escuchar el devicechange", async () => {
        const xr = ponerXR(async () => false);
        const quitar = vi.spyOn(xr, "removeEventListener");
        const { unmount } = await act(async () => montarEn("m", <ImmersiveWidget />, "#a855f7"));
        unmount();
        expect(quitar).toHaveBeenCalledWith("devicechange", expect.any(Function));
    });
});
