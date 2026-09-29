import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { CameraQuickWidget } from "../../camera-quick-widget";

function dispositivo(camaras: number, permiso: string | null) {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { enumerateDevices: async () => Array.from({ length: camaras }, (_, i) => ({ kind: "videoinput", deviceId: `c${i}`, label: "" })) } });
    Object.defineProperty(navigator, "permissions", { configurable: true, value: permiso ? { query: async () => ({ state: permiso }) } : undefined });
}

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); window.localStorage.clear(); });

async function montar(clase: any) {
    await act(async () => { montarEn(clase, <CameraQuickWidget />, "#fb7185"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("Cámara", () => {
    it.each(TODAS)("se pinta en %s", async (clase) => {
        dispositivo(1, "prompt");
        await montar(clase);
        expect(document.querySelector("[data-widget-e='CAMERA_QUICK']")?.getAttribute("data-clase")).toBe(clase);
        expect(screen.getAllByRole("link", { name: /Abrir la cámara|Foto/ }).length).toBeGreaterThan(0);
    });

    it("consulta el permiso sin pedirlo y lo dice", async () => {
        dispositivo(2, "granted");
        await montar("m");
        expect(screen.getByText("2 cámaras listas")).toBeTruthy();
    });

    it("dice la verdad si no hay cámara o el permiso está denegado", async () => {
        dispositivo(0, null);
        await montar("s");
        expect(screen.getByRole("alert").textContent).toMatch(/no tiene cámara/);
        cleanup();
        dispositivo(1, "denied");
        await montar("s");
        expect(screen.getByRole("alert").textContent).toMatch(/Permiso denegado/);
    });

    it("cambia frontal/trasera y resolución en los mismos ajustes que usa la app", async () => {
        dispositivo(1, "prompt");
        await montar("l");
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Usar la cámara frontal" })); });
        act(() => { fireEvent.click(screen.getByRole("radio", { name: "HD" })); });
        const guardado = JSON.parse(window.localStorage.getItem("starseed.camera.hw.v1") ?? "{}");
        expect(guardado.facingMode).toBe("user");
        expect(guardado.resolution).toBe("hd");
    });
});
