import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { alternarCasilla, casillasDe, coincideNota, etiquetasDe, lineasDe, segmentar, PintaSegmentos } from "../notas";
import { QuickNotesWidget } from "../../quick-notes-widget";
import { QUICK_NOTES_KEY } from "@/lib/notes/quick-notes";

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); window.localStorage.clear(); });

function sembrar(notas: { text: string; pinned?: boolean }[]) {
    const ahora = Date.now();
    window.localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify({ v: 1, items: notas.map((n, i) => ({ id: `n${i}`, text: n.text, color: "#38bdf8", createdAt: ahora - i, updatedAt: ahora - i, pinned: n.pinned })) }));
}

describe("markdown ligero (puro)", () => {
    it("segmenta negrita, cursiva, código, etiquetas y enlaces", () => {
        expect(segmentar("**hola** _mundo_ `x` #idea https://starseed.org").map((s) => s.t)).toEqual(["negrita", "texto", "cursiva", "texto", "codigo", "texto", "etiqueta", "texto", "enlace"]);
    });
    it("entiende casillas y listas, y marca la casilla correcta", () => {
        const t = "Compra\n- [ ] pan\n- [x] leche\n- huevos";
        const ls = lineasDe(t);
        expect(ls.map((l) => l.tipo)).toEqual(["parrafo", "casilla", "casilla", "lista"]);
        expect(casillasDe(t)).toEqual({ hechas: 1, total: 2 });
        expect(alternarCasilla(t, 1)).toBe("Compra\n- [x] pan\n- [x] leche\n- huevos");
        expect(alternarCasilla(t, 2)).toBe("Compra\n- [ ] pan\n- [ ] leche\n- huevos");
    });
    it("etiquetas y búsqueda sin acentos", () => {
        expect(etiquetasDe("#Idea y #café")).toEqual(["idea", "café"]);
        expect(coincideNota("Reunión del círculo", "reunion")).toBe(true);
    });
    it("nunca pinta HTML de la nota", () => {
        const { container } = render(<PintaSegmentos segs={segmentar("<img src=x onerror=alert(1)> javascript:alert(1)")} color="#fff" />);
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("a")).toBeNull();
    });
});

describe("Notas rápidas", () => {
    it.each(TODAS)("sin notas lo dice en %s", async (clase) => {
        await act(async () => { montarEn(clase, <QuickNotesWidget />); });
        expect(screen.getByRole("region", { name: /Notas rápidas: 0 notas/ })).toBeTruthy();
    });

    it("escribe con Intro, marca casillas y borra con deshacer", async () => {
        await act(async () => { montarEn("m", <QuickNotesWidget />); });
        const campo = screen.getByRole("textbox", { name: "Nota nueva" });
        fireEvent.change(campo, { target: { value: "- [ ] regar el huerto" } });
        act(() => { fireEvent.keyDown(campo, { key: "Enter" }); });
        const casilla = screen.getByRole("checkbox", { name: /regar el huerto/ });
        act(() => { fireEvent.click(casilla); });
        expect(window.localStorage.getItem(QUICK_NOTES_KEY)).toContain("[x] regar el huerto");
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Borrar nota" })); });
        expect(screen.getByText("Nota borrada")).toBeTruthy();
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Deshacer" })); });
        expect(window.localStorage.getItem(QUICK_NOTES_KEY)).toContain("regar el huerto");
    });

    it("en l busca y filtra por etiqueta", async () => {
        sembrar([{ text: "Plan del #huerto" }, { text: "Ideas de #radio" }, { text: "Llamar a Ana" }]);
        await act(async () => { montarEn("l", <QuickNotesWidget />); });
        act(() => { fireEvent.click(screen.getByRole("tab", { name: "#radio" })); });
        expect(screen.queryByText(/Llamar a Ana/)).toBeNull();
        expect(screen.getByText(/Ideas de/)).toBeTruthy();
    });
});
