// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Bot, Mic } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MenuListaMovil } from "@/components/ui/menu-lista-movil";

const OPCIONES = [
    { id: "chat", label: "Chat Multiagéntico & Voz", icon: Bot, hint: "Conversa con Astraura" },
    { id: "voz", label: "VoiceStudio & Forja de Sonido", icon: Mic },
    { id: "gobernanza", label: "Gobernanza de la Red" },
];

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("MenuListaMovil", () => {
    it("el botón enseña la opción actual con su nombre completo", () => {
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="voz" onCambiar={() => {}} />);
        const boton = screen.getByRole("button", { name: "Secciones: VoiceStudio & Forja de Sonido" });
        expect(boton.textContent).toContain("VoiceStudio & Forja de Sonido");
    });

    it("abre la lista completa, marca la actual y elige otra", () => {
        const onCambiar = vi.fn();
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="chat" onCambiar={onCambiar} />);
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        const hoja = screen.getByRole("dialog", { name: "Secciones" });
        expect(hoja.textContent).toContain("Gobernanza de la Red");
        expect(hoja.textContent).toContain("Conversa con Astraura");
        const actual = [...hoja.querySelectorAll("button[aria-current='true']")];
        expect(actual).toHaveLength(1);
        expect(actual[0].textContent).toContain("Chat Multiagéntico & Voz");
        fireEvent.click(screen.getByText("Gobernanza de la Red"));
        expect(onCambiar).toHaveBeenCalledWith("gobernanza");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("se cierra con Escape y elegir la actual no la vuelve a cambiar", () => {
        const onCambiar = vi.fn();
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="chat" onCambiar={onCambiar} />);
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        fireEvent.click(screen.getAllByText("Chat Multiagéntico & Voz").at(-1)!);
        expect(onCambiar).not.toHaveBeenCalled();
    });

    // GEN1114INT · la hoja («Secciones de Astraura» y las demás que usan este componente) deja libre a la derecha lo
    // que tapa una orbe o un botón flotante (`position: fixed`, ≤ 160 px). Sin flotantes, no cambia nada.
    it("sin flotantes, la lista no reserva nada (el resto de usos queda igual)", async () => {
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="chat" onCambiar={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByRole("dialog", { name: "Secciones" }).querySelector("ul")!.style.paddingRight).toBe("");
    });

    it("con la orbe encima, la lista deja libre su carril y la orbe no se toca", async () => {
        const caja = { left: 300, top: 300, right: 348, bottom: 348 };
        const orbe = document.createElement("div");
        orbe.style.position = "fixed";
        document.body.appendChild(orbe);
        const rect = (r: typeof caja) => ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r }) as DOMRect;
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return this === orbe ? rect(caja) : rect({ left: 0, top: 100, right: 360, bottom: 640 });
        });
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
        (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x: number, y: number) =>
            x >= caja.left && x < caja.right && y >= caja.top && y < caja.bottom ? [orbe, document.body] : [document.body];
        try {
            const onCambiar = vi.fn();
            render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="chat" onCambiar={onCambiar} />);
            fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
            const lista = screen.getByRole("dialog", { name: "Secciones" }).querySelector("ul")!;
            await waitFor(() => expect(lista.style.paddingRight).toBe("68px"));
            expect(orbe.style.cssText).toBe("position: fixed;");
            fireEvent.click(screen.getByText("Gobernanza de la Red"));
            expect(onCambiar).toHaveBeenCalledWith("gobernanza");
        } finally {
            orbe.remove();
            delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
        }
    });
});
