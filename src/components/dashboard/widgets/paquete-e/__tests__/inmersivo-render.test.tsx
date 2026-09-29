import * as React from "react";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { ImmersiveWidget } from "../../immersive-widget";

function visor(vr: boolean | "error", ar: boolean | "error" | null) {
    const pide = (v: boolean | "error") => (v === "error" ? Promise.reject(new Error("no")) : Promise.resolve(v));
    Object.defineProperty(navigator, "xr", {
        configurable: true,
        value: ar === null && vr === false ? undefined : { isSessionSupported: (m: string) => pide(m === "immersive-vr" ? vr : (ar ?? false)) },
    });
}

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); });

async function montar(clase: any) {
    await act(async () => { montarEn(clase, <ImmersiveWidget />, "#a855f7"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("Espacio inmersivo", () => {
    it.each(TODAS)("se pinta en %s con el portal a /immersive", async (clase) => {
        visor(false, null);
        await montar(clase);
        expect(document.querySelector("[data-widget-e='IMMERSIVE']")?.getAttribute("data-clase")).toBe(clase);
        expect(screen.getByRole("link", { name: "Entrar al espacio inmersivo" }).getAttribute("href")).toBe("/immersive");
    });

    it("sin WebXR lo dice: se abre en 3D en pantalla", async () => {
        visor(false, null);
        await montar("m");
        expect(screen.getByText("Sin visor XR: se abre en 3D en pantalla")).toBeTruthy();
        expect(screen.getByText(/en pantalla/, { selector: "span" })).toBeTruthy();
    });

    it("con visor dice VR y AR; si una consulta falla, no la da por buena", async () => {
        visor(true, true);
        await montar("m");
        expect(screen.getByText("VR y AR disponibles aquí")).toBeTruthy();
        cleanup();
        visor(true, "error");
        await montar("m");
        expect(screen.getByText("VR disponible aquí")).toBeTruthy();
    });

    it("en l lista los lugares 3D reales del catálogo con su ruta", async () => {
        visor(false, null);
        await montar("l");
        const lista = screen.getByRole("list", { name: "Lugares inmersivos" });
        const rutas = Array.from(lista.querySelectorAll("a")).map((a) => a.getAttribute("href"));
        expect(rutas).toEqual(expect.arrayContaining(["/immersive", "/sala-xr", "/escena", "/mundo-avatares"]));
    });
});
