import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ entradas: [] as any[], abrir: vi.fn(async (_o?: any) => true) }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/aurora/aurora-chat-log", () => ({ readAuroraChatEntries: () => h.entradas, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k" }));
vi.mock("@/lib/aurora/open-aurora", () => ({ openAurora: (o: any) => h.abrir(o) }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { NexusQuickAccessWidget } from "../../nexus-quick-access-widget";

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); h.entradas = []; h.abrir.mockReset(); h.abrir.mockImplementation(async () => true); });

describe("Exocórtex (Nexus IA)", () => {
    it.each(TODAS)("se pinta en %s", (clase) => {
        const { container } = montarEn(clase, <NexusQuickAccessWidget />, "#22d3ee");
        expect(container.querySelector("[data-widget-e='NEXUS_QUICK_ACCESS']")?.getAttribute("data-clase")).toBe(clase);
        // Ningún comentario del código se cuela como texto en la tarjeta (pulido 0929).
        expect(container.textContent ?? "").not.toMatch(/\/\/|\/\*/);
    });

    it("sin conversaciones lo dice y manda la pregunta a la Aurora global", async () => {
        montarEn("m", <NexusQuickAccessWidget />);
        expect(screen.getByText(/Vacío todavía/)).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: "Pregunta para Astraura" }), { target: { value: "¿Qué tiempo hace?" } });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar a Astraura" })); });
        expect(h.abrir).toHaveBeenCalledWith({ prompt: "¿Qué tiempo hace?" });
    });

    it("si Aurora no está lista lo dice y ofrece abrir Astraura IA", async () => {
        h.abrir.mockImplementation(async () => false);
        montarEn("l", <NexusQuickAccessWidget />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Resume mi día/ })); });
        expect(screen.getByRole("alert").textContent).toMatch(/aún no está lista/);
    });

    it("enseña la última respuesta real y cuántos mensajes hoy", () => {
        const ahora = Date.now();
        h.entradas = [{ role: "user", text: "hola", ts: ahora - 1000 }, { role: "aurora", text: "Hola, ¿en qué te ayudo?", ts: ahora }];
        montarEn("xl", <NexusQuickAccessWidget />);
        expect(screen.getAllByText("Hola, ¿en qué te ayudo?").length).toBeGreaterThan(0);
        expect(screen.getByText("2 mensajes hoy")).toBeTruthy();
    });
});
