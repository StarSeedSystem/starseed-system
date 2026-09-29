import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { CLAVE_REGISTRO, PATRONES, diaLocal, faseEn, racha, reloj, semana, sumarSegundos, duracionLegible, registroVacio } from "../respiracion";
import { MentalCoherenceWidget } from "../../mental-coherence-widget";

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); vi.useRealTimers(); window.localStorage.clear(); });

describe("respiración (puro)", () => {
    const [coherente, , caja] = PATRONES;
    it("sigue las fases y la flor crece al inhalar y se cierra al exhalar", () => {
        expect(faseEn(coherente, 0).fase.tipo).toBe("inhala");
        expect(faseEn(coherente, 0).escala).toBeCloseTo(0.55);
        expect(faseEn(coherente, 4.99).escala).toBeGreaterThan(0.99);
        expect(faseEn(coherente, 6).fase.tipo).toBe("exhala");
        expect(faseEn(coherente, 12).ciclo).toBe(1);
        expect(faseEn(coherente, 1.2).restante).toBe(4);
    });
    it("en la caja, sostener mantiene la flor donde quedó", () => {
        expect(faseEn(caja, 5).fase.tipo).toBe("sosten");
        expect(faseEn(caja, 5).escala).toBe(1);
        expect(faseEn(caja, 13).escala).toBeCloseTo(0.55);
    });
    it("registro: suma por día, racha desde hoy o ayer y la semana", () => {
        const hoy = new Date(2026, 8, 29, 10);
        const ayer = new Date(2026, 8, 28, 10);
        const antes = new Date(2026, 8, 27, 10);
        let r = sumarSegundos(registroVacio(), diaLocal(ayer), 120);
        r = sumarSegundos(r, diaLocal(antes), 90);
        expect(racha(r, hoy)).toBe(2);
        r = sumarSegundos(r, diaLocal(hoy), 30);
        expect(racha(r, hoy)).toBe(2);
        r = sumarSegundos(r, diaLocal(hoy), 40);
        expect(racha(r, hoy)).toBe(3);
        const s = semana(r, hoy);
        expect(s).toHaveLength(7);
        expect(s[6]).toMatchObject({ hoy: true, minutos: 1, nombre: "martes" });
        expect(s[5].minutos).toBe(2);
    });
    it("textos de tiempo", () => {
        expect(reloj(125)).toBe("2:05");
        expect(duracionLegible(45)).toBe("45 s");
        expect(duracionLegible(3900)).toBe("1 h 5 min");
    });
});

describe("Coherencia", () => {
    it.each(TODAS)("se pinta en %s y se puede empezar con un toque", async (clase) => {
        await act(async () => { montarEn(clase, <MentalCoherenceWidget />, "#8b5cf6"); });
        expect(document.querySelector("[data-widget-e='MENTAL_COHERENCE']")?.getAttribute("data-clase")).toBe(clase);
        expect(screen.getByRole("button", { name: "Empezar a respirar" })).toBeTruthy();
    });

    it("guía la respiración, se pausa y guarda lo practicado solo en este navegador", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
        vi.setSystemTime(new Date(2026, 8, 29, 10));
        await act(async () => { montarEn("m", <MentalCoherenceWidget />, "#8b5cf6"); });
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Empezar a respirar" })); });
        expect(screen.getByText(/Inhala \d s · quedan/)).toBeTruthy();
        act(() => { vi.advanceTimersByTime(6000); });
        expect(screen.getByText(/Exhala \d s · quedan/)).toBeTruthy();
        act(() => { vi.advanceTimersByTime(6000); });
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Pausar la respiración" })); });
        expect(screen.getByText(/En pausa · quedan 2:4\d/)).toBeTruthy();
        const guardado = JSON.parse(window.localStorage.getItem(CLAVE_REGISTRO) ?? "{}");
        expect(guardado.dias["2026-09-29"]).toBeGreaterThanOrEqual(11);
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Terminar" })); });
        expect(screen.getByRole("button", { name: "Empezar a respirar" })).toBeTruthy();
    });

    it("no deja cambiar el patrón a mitad de sesión y lo recuerda al volver", async () => {
        await act(async () => { montarEn("l", <MentalCoherenceWidget />); });
        act(() => { fireEvent.click(screen.getByRole("radio", { name: "Caja" })); });
        act(() => { fireEvent.click(screen.getByRole("radio", { name: "5 min" })); });
        expect(screen.getByText("Caja 4 · 4 · 4 · 4 · 5 min")).toBeTruthy();
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Empezar a respirar" })); });
        expect((screen.getByRole("radio", { name: "Calma" }) as HTMLButtonElement).disabled).toBe(true);
        cleanup();
        await act(async () => { montarEn("l", <MentalCoherenceWidget />); });
        expect(screen.getByRole("radio", { name: "Caja" }).getAttribute("aria-checked")).toBe("true");
    });

    it("dice que no mide nada y, sin almacenamiento, que no recordará", async () => {
        await act(async () => { montarEn("l", <MentalCoherenceWidget />); });
        expect(screen.getByText(/la coherencia no se mide, se practica/)).toBeTruthy();
        expect(screen.getByText(/Aún sin práctica: prueba un minuto/)).toBeTruthy();
        cleanup();
        const getItem = Storage.prototype.getItem;
        Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
        try {
            await act(async () => { montarEn("l", <MentalCoherenceWidget />); });
            expect(screen.getByRole("alert").textContent).toMatch(/no deja guardar/);
        } finally { Storage.prototype.getItem = getItem; }
    });
});
